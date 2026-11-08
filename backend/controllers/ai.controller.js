import mongoose from "mongoose";
import AiConversation from "../models/aiConversation.model.js";
import AiQuota from "../models/aiQuota.model.js";
import UserInterest from "../models/userInterest.model.js";
import {
  CHAT_MODEL,
  REASONING_EFFORT,
  getOpenAI,
  isAiEnabled,
} from "../ai/openaiClient.js";
import { BUYER_TOOLS, runBuyerTool } from "../ai/buyerTools.js";
import { buildBuyerSystemPrompt } from "../ai/buyerPrompt.js";
import { CARD_FIELDS } from "../ai/semanticSearch.js";
import Property from "../models/property.model.js";
import { PUBLIC_VISIBILITY } from "../utils/propertyQuery.js";
import { getFeaturedProperties } from "../utils/featuredProperties.js";

const GUEST_LIMIT = 10; // khách: tổng cộng 10 câu, đăng nhập để hỏi tiếp
const GUEST_IP_LIMIT = 30; // chặn khách xóa localStorage để lấy thêm lượt
const USER_DAILY_LIMIT = Number(process.env.AI_USER_DAILY_LIMIT) || 100;
const MAX_MESSAGE_LENGTH = 1000;
const HISTORY_MESSAGES = 10;
const MAX_TOOL_ROUNDS = 4;
const RECOMMENDATION_COUNT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const TOOL_LABELS = {
  search_properties: "Đang tìm bất động sản phù hợp…",
  get_property_details: "Đang xem chi tiết tin đăng…",
};

const isValidId = (id) =>
  typeof id === "string" && mongoose.Types.ObjectId.isValid(id);
const isValidGuestId = (id) =>
  typeof id === "string" && /^[A-Za-z0-9-]{8,64}$/.test(id);

const todayVN = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(),
  );

// ---------- Hạn mức ----------
const quotaEntries = (req, guestId) =>
  req.user
    ? [
        {
          key: `user:${req.user._id}:${todayVN()}`,
          limit: USER_DAILY_LIMIT,
          ttlMs: 2 * DAY_MS,
        },
      ]
    : [
        { key: `guest:${guestId}`, limit: GUEST_LIMIT, ttlMs: 365 * DAY_MS },
        { key: `guestip:${req.ip}`, limit: GUEST_IP_LIMIT, ttlMs: 30 * DAY_MS },
      ];

const readQuota = async (entries) => {
  const docs = await AiQuota.find({ key: { $in: entries.map((e) => e.key) } })
    .select("key count")
    .lean();
  const used = Object.fromEntries(docs.map((d) => [d.key, d.count]));
  const remaining = Math.max(
    Math.min(...entries.map((e) => e.limit - (used[e.key] || 0))),
    0,
  );
  return { limit: entries[0].limit, remaining };
};

const changeQuota = (entries, delta) =>
  Promise.all(
    entries.map((e) =>
      AiQuota.updateOne(
        { key: e.key },
        {
          $inc: { count: delta },
          $setOnInsert: { expiresAt: new Date(Date.now() + e.ttlMs) },
        },
        { upsert: true },
      ),
    ),
  );

const limitMessage = (req) =>
  req.user
    ? "Bạn đã dùng hết lượt hỏi trợ lý AI hôm nay. Vui lòng quay lại vào ngày mai."
    : `Bạn đã dùng hết ${GUEST_LIMIT} câu hỏi dành cho khách. Đăng nhập để tiếp tục trò chuyện với trợ lý.`;

const friendlyAiError = (error) => {
  if (error?.status === 401) return "Cấu hình trợ lý AI không hợp lệ. Vui lòng báo quản trị viên.";
  if (error?.status === 429) return "Trợ lý AI đang quá tải. Vui lòng thử lại sau ít phút.";
  return "Trợ lý AI gặp sự cố. Vui lòng thử lại.";
};

// GET /api/ai/quota?guestId=...
export const getAiQuota = async (req, res) => {
  try {
    const { guestId } = req.query;
    if (!req.user && !isValidGuestId(guestId)) {
      return res.status(400).json({ message: "Thiếu mã khách hợp lệ" });
    }
    const quota = await readQuota(quotaEntries(req, guestId));
    res.json({ success: true, isGuest: !req.user, enabled: isAiEnabled(), ...quota });
  } catch (error) {
    console.error("GET_AI_QUOTA_ERROR:", error);
    res.status(500).json({ message: "Không lấy được hạn mức trợ lý AI" });
  }
};

// Tìm hội thoại thuộc đúng người dùng/khách đang gọi
const findOwnConversation = (req, conversationId, guestId) =>
  AiConversation.findOne({
    _id: conversationId,
    ...(req.user ? { user: req.user._id } : { user: null, guestId }),
  });

// GET /api/ai/conversations/:id?guestId=...
export const getAiConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const { guestId } = req.query;
    if (!isValidId(id)) return res.status(400).json({ message: "Mã hội thoại không hợp lệ" });
    if (!req.user && !isValidGuestId(guestId)) {
      return res.status(400).json({ message: "Thiếu mã khách hợp lệ" });
    }

    const conversation = await findOwnConversation(req, id, guestId)
      .populate("messages.propertyIds", CARD_FIELDS)
      .lean();
    if (!conversation) return res.status(404).json({ message: "Không tìm thấy hội thoại" });

    res.json({
      success: true,
      conversationId: conversation._id,
      messages: conversation.messages.map((m) => ({
        role: m.role,
        content: m.content,
        properties: (m.propertyIds || []).filter(Boolean),
      })),
    });
  } catch (error) {
    console.error("GET_AI_CONVERSATION_ERROR:", error);
    res.status(500).json({ message: "Không tải được hội thoại" });
  }
};

// POST /api/ai/chat  → Server-Sent Events
export const chatWithAssistant = async (req, res) => {
  if (!isAiEnabled()) {
    return res.status(503).json({ code: "AI_DISABLED", message: "Trợ lý AI hiện chưa được bật" });
  }

  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const { conversationId, guestId } = req.body || {};
  const contextPropertyId = isValidId(req.body?.context?.propertyId)
    ? req.body.context.propertyId
    : null;

  if (!message) return res.status(400).json({ message: "Vui lòng nhập câu hỏi" });
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ message: `Câu hỏi tối đa ${MAX_MESSAGE_LENGTH} ký tự` });
  }
  if (!req.user && !isValidGuestId(guestId)) {
    return res.status(400).json({ message: "Thiếu mã khách hợp lệ" });
  }

  let entries;
  let quotaConsumed = false;
  try {
    entries = quotaEntries(req, guestId);
    const quota = await readQuota(entries);
    if (quota.remaining <= 0) {
      return res.status(429).json({
        code: req.user ? "AI_DAILY_LIMIT" : "AI_GUEST_LIMIT",
        message: limitMessage(req),
        limit: quota.limit,
        remaining: 0,
      });
    }

    let conversation = isValidId(conversationId)
      ? await findOwnConversation(req, conversationId, guestId)
      : null;
    if (!conversation) {
      conversation = new AiConversation({
        user: req.user?._id || null,
        guestId: req.user ? null : guestId,
        messages: [],
        expiresAt: new Date(Date.now() + 7 * DAY_MS),
      });
    }

    await changeQuota(entries, 1);
    quotaConsumed = true;

    // ---- Mở luồng SSE ----
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (event, data) => {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Người dùng đóng khung chat giữa chừng → hủy request tới OpenAI
    const abort = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) abort.abort();
    });

    send("meta", {
      conversationId: conversation._id,
      limit: quota.limit,
      remaining: quota.remaining - 1,
    });

    const history = conversation.messages.slice(-HISTORY_MESSAGES).map((m) => ({
      role: m.role,
      content:
        m.content ||
        (m.propertyIds?.length ? "(Đã hiển thị danh sách bất động sản cho người dùng.)" : "…"),
    }));

    const messages = [
      { role: "system", content: await buildBuyerSystemPrompt({ contextPropertyId }) },
      ...history,
      { role: "user", content: message },
    ];

    const openai = getOpenAI();
    const shownIds = new Set();
    let finalText = "";
    let interest = null;
    let truncated = false;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const stream = await openai.chat.completions.create(
        {
          model: CHAT_MODEL,
          messages,
          tools: BUYER_TOOLS,
          // vòng cuối buộc model trả lời bằng dữ liệu đã có
          tool_choice: round === MAX_TOOL_ROUNDS ? "none" : "auto",
          stream: true,
          stream_options: { include_usage: true },
          max_completion_tokens: 2500,
          ...(REASONING_EFFORT ? { reasoning_effort: REASONING_EFFORT } : {}),
        },
        { signal: abort.signal },
      );

      let text = "";
      let finishReason = null;
      const toolCalls = [];

      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta || {};
        if (delta.content) {
          // tách đoạn trả lời trước và sau khi gọi tool
          const piece = !text && finalText ? `\n\n${delta.content}` : delta.content;
          text += piece;
          send("text", { delta: piece });
        }
        for (const tc of delta.tool_calls || []) {
          const slot = (toolCalls[tc.index] ||= {
            id: "",
            type: "function",
            function: { name: "", arguments: "" },
          });
          if (tc.id) slot.id = tc.id;
          if (tc.function?.name) slot.function.name += tc.function.name;
          if (tc.function?.arguments) slot.function.arguments += tc.function.arguments;
        }
        if (choice.finish_reason) finishReason = choice.finish_reason;
      }

      finalText += text;
      const calls = toolCalls.filter(Boolean);
      if (finishReason === "length") truncated = true;
      if (finishReason !== "tool_calls" || calls.length === 0) break;

      messages.push({ role: "assistant", content: text || null, tool_calls: calls });

      for (const call of calls) {
        send("tool_status", {
          name: call.function.name,
          label: TOOL_LABELS[call.function.name] || "Đang tra cứu dữ liệu…",
        });
        let output;
        try {
          output = await runBuyerTool(call.function.name, call.function.arguments);
        } catch (error) {
          console.error("AI_TOOL_ERROR:", call.function.name, error);
          output = { result: { error: "Lỗi khi tra cứu dữ liệu, hãy xin lỗi người dùng và đề nghị thử lại." } };
        }
        if (output.cards?.length) {
          const fresh = output.cards.filter((p) => !shownIds.has(p._id.toString()));
          fresh.forEach((p) => shownIds.add(p._id.toString()));
          if (fresh.length) send("properties", { properties: fresh });
        }
        if (output.interest) interest = output.interest;
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(output.result),
        });
      }
    }

    if (truncated) {
      const note = "\n\n(Câu trả lời bị cắt ngắn, bạn có thể hỏi tiếp để xem thêm.)";
      finalText += note;
      send("text", { delta: note });
    }

    // ---- Lưu hội thoại ----
    conversation.messages.push(
      { role: "user", content: message },
      {
        role: "assistant",
        content: finalText,
        propertyIds: [...shownIds],
      },
    );
    conversation.expiresAt = new Date(Date.now() + (req.user ? 90 : 7) * DAY_MS);
    await conversation.save();

    // ---- Cập nhật hồ sơ "Có thể bạn quan tâm" (chỉ người đăng nhập) ----
    if (req.user && interest) {
      const filters = Object.fromEntries(
        Object.entries(interest.filters).filter(
          ([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0),
        ),
      );
      // Ghi đè hoàn toàn: gợi ý chỉ phản ánh nhu cầu mới nhất của phiên chat hiện tại
      await UserInterest.updateOne(
        { user: req.user._id },
        {
          $set: {
            query: interest.query,
            filters,
            embedding: interest.embedding,
            conversation: conversation._id,
            propertyIds: (interest.propertyIds || []).slice(0, RECOMMENDATION_COUNT),
          },
        },
        { upsert: true },
      );
      send("interest_updated", {});
    }

    send("done", { conversationId: conversation._id, remaining: quota.remaining - 1 });
    res.end();
  } catch (error) {
    const aborted = error?.name === "AbortError" || error?.constructor?.name === "APIUserAbortError";
    if (!aborted) console.error("AI_CHAT_ERROR:", error);
    // Lỗi không phải do người dùng hủy → hoàn lại lượt hỏi
    if (quotaConsumed && !aborted) {
      await changeQuota(entries, -1).catch(() => {});
    }
    if (!res.headersSent) {
      return res.status(500).json({ message: friendlyAiError(error) });
    }
    if (!res.writableEnded) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: friendlyAiError(error) })}\n\n`);
      res.end();
    }
  }
};

// GET /api/ai/recommendations  → tối đa 5 tin "Có thể bạn quan tâm"
// GET /api/ai/recommendations (khách hoặc đã đăng nhập)
//  - mode "chat": đúng các tin chatbot tìm được cho nhu cầu mới nhất trong phiên chat hiện tại (1–5 tin).
//    Không bổ sung tin không liên quan cho đủ số lượng.
//  - mode "featured": chưa chat / phiên mới / không có tin khớp → tin nổi bật chấm điểm nhiều yếu tố.
export const getRecommendations = async (req, res) => {
  try {
    if (req.user) {
      const interest = await UserInterest.findOne({ user: req.user._id }).lean();
      const ids = interest?.propertyIds || [];
      if (ids.length) {
        const found = await Property.find({
          _id: { $in: ids },
          status: "sale",
          seller: { $ne: req.user._id },
          ...PUBLIC_VISIBILITY,
        })
          .select(CARD_FIELDS)
          .lean();
        // giữ đúng thứ tự độ phù hợp lúc chatbot tìm
        const byId = new Map(found.map((p) => [p._id.toString(), p]));
        const properties = ids.map((id) => byId.get(id.toString())).filter(Boolean);
        if (properties.length) {
          return res.json({
            success: true,
            mode: "chat",
            basedOn: interest.query,
            updatedAt: interest.updatedAt,
            properties: properties.slice(0, RECOMMENDATION_COUNT),
          });
        }
      }
    }

    const featured = await getFeaturedProperties({
      limit: RECOMMENDATION_COUNT,
      excludeSeller: req.user?._id,
    });
    res.json({
      success: true,
      mode: "featured",
      properties: featured.map(({ property, highlight }) => ({ ...property, highlight })),
    });
  } catch (error) {
    console.error("GET_RECOMMENDATIONS_ERROR:", error);
    res.status(500).json({ message: "Không lấy được gợi ý bất động sản" });
  }
};

// DELETE /api/ai/recommendations → người dùng xóa hồ sơ sở thích
export const clearRecommendations = async (req, res) => {
  try {
    await UserInterest.deleteOne({ user: req.user._id });
    res.json({ success: true, message: "Đã xóa gợi ý dựa trên trò chuyện" });
  } catch (error) {
    console.error("CLEAR_RECOMMENDATIONS_ERROR:", error);
    res.status(500).json({ message: "Không xóa được gợi ý" });
  }
};
