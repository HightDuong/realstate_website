import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import API_URL from "../config";
import { useAuth } from "../context/AuthContext";
import { AI_INTEREST_EVENT } from "../components/ai/aiChatConfig";

const GUEST_ID_KEY = "aiGuestId";
const conversationKey = (user) =>
  `aiConversation:${user ? user._id || user.id : "guest"}`;

const safeStorage = {
  get: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // trình duyệt chặn localStorage → bỏ qua
    }
  },
};

const getGuestId = () => {
  let id = safeStorage.get(GUEST_ID_KEY);
  if (!id) {
    id =
      crypto.randomUUID?.() ||
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    safeStorage.set(GUEST_ID_KEY, id);
  }
  return id;
};

let messageSeq = 0;
const newId = () => `m${Date.now()}-${messageSeq++}`;

// Tách luồng SSE thành các sự kiện { event, data }
const parseSseChunk = (raw) => {
  let event = "message";
  const dataLines = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (!dataLines.length) return null;
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
};

/**
 * Quản lý hội thoại với trợ lý tìm nhà.
 * messages: [{ id, role: "user" | "assistant", content, properties: [], status?, error? }]
 */
const useAiChat = ({ contextPropertyId } = {}) => {
  const { user, token } = useAuth();
  const [messages, setMessages] = useState([]);
  const [quota, setQuota] = useState(null); // { limit, remaining, isGuest, enabled }
  const [sending, setSending] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const conversationIdRef = useRef(null);
  const abortRef = useRef(null);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  const updateMessage = (id, updater) =>
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updater(m) } : m)),
    );

  // Tải hạn mức + hội thoại cũ mỗi khi đổi tài khoản (đăng nhập/đăng xuất)
  useEffect(() => {
    let cancelled = false;
    const guestId = user ? undefined : getGuestId();
    conversationIdRef.current = safeStorage.get(conversationKey(user));

    const load = async () => {
      try {
        const quotaRes = await axios.get(`${API_URL}api/ai/quota`, {
          params: { guestId },
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!cancelled) {
          setQuota(quotaRes.data);
          setLimitReached(quotaRes.data.remaining <= 0);
        }
      } catch {
        if (!cancelled) setQuota(null);
      }

      if (!conversationIdRef.current) {
        if (!cancelled) setMessages([]);
        return;
      }
      try {
        const res = await axios.get(
          `${API_URL}api/ai/conversations/${conversationIdRef.current}`,
          {
            params: { guestId },
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        );
        if (!cancelled) {
          setMessages(
            res.data.messages.map((m) => ({ ...m, id: newId() })),
          );
        }
      } catch {
        // hội thoại đã hết hạn hoặc không thuộc tài khoản này → bắt đầu mới
        safeStorage.set(conversationKey(user), null);
        conversationIdRef.current = null;
        if (!cancelled) setMessages([]);
      }
    };
    load();

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [user, token]);

  const sendMessage = useCallback(
    async (rawText) => {
      const text = rawText.trim();
      if (!text || sending || limitReached) return;

      const assistantId = newId();
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "user", content: text, properties: [] },
        {
          id: assistantId,
          role: "assistant",
          content: "",
          properties: [],
          status: "Đang suy nghĩ…",
        },
      ]);
      setSending(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(`${API_URL}api/ai/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({
            message: text,
            conversationId: conversationIdRef.current,
            guestId: user ? undefined : getGuestId(),
            context: { propertyId: contextPropertyId },
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          if (response.status === 429) {
            setLimitReached(true);
            setQuota((q) => (q ? { ...q, remaining: 0 } : q));
          }
          throw new Error(body.message || "Trợ lý AI đang bận, vui lòng thử lại.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const handleEvent = ({ event, data }) => {
          switch (event) {
            case "meta":
              conversationIdRef.current = data.conversationId;
              safeStorage.set(conversationKey(user), data.conversationId);
              setQuota((q) => ({ ...(q || {}), limit: data.limit, remaining: data.remaining }));
              break;
            case "text":
              updateMessage(assistantId, (m) => ({
                content: m.content + data.delta,
                status: null,
              }));
              break;
            case "tool_status":
              updateMessage(assistantId, () => ({ status: data.label }));
              break;
            case "properties":
              updateMessage(assistantId, (m) => ({
                properties: [...m.properties, ...data.properties],
              }));
              break;
            case "interest_updated":
              window.dispatchEvent(new Event(AI_INTEREST_EVENT));
              break;
            case "done":
              setQuota((q) => (q ? { ...q, remaining: data.remaining } : q));
              if (data.remaining <= 0) setLimitReached(true);
              break;
            case "error":
              updateMessage(assistantId, () => ({ error: data.message, status: null }));
              break;
            default:
              break;
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
          let boundary;
          while ((boundary = buffer.indexOf("\n\n")) !== -1) {
            const parsed = parseSseChunk(buffer.slice(0, boundary));
            buffer = buffer.slice(boundary + 2);
            if (parsed) handleEvent(parsed);
          }
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          updateMessage(assistantId, () => ({
            error: error.message || "Không kết nối được trợ lý AI.",
          }));
        }
      } finally {
        updateMessage(assistantId, () => ({ status: null }));
        setSending(false);
        abortRef.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sending, limitReached, user, token, contextPropertyId],
  );

  // Bắt đầu cuộc trò chuyện mới (giữ nguyên hạn mức)
  const resetConversation = useCallback(() => {
    abortRef.current?.abort();
    conversationIdRef.current = null;
    safeStorage.set(conversationKey(user), null);
    setMessages([]);
    // Phiên mới → gợi ý theo phiên cũ không còn đúng: xóa, trang /properties quay về "Gợi ý nổi bật"
    if (token) {
      axios
        .delete(`${API_URL}api/ai/recommendations`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then(() => window.dispatchEvent(new Event(AI_INTEREST_EVENT)))
        .catch(() => {});
    }
  }, [user, token]);

  return {
    messages,
    quota,
    sending,
    limitReached,
    isGuest: !user,
    sendMessage,
    resetConversation,
  };
};

export default useAiChat;
