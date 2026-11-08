import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  HiExclamationCircle,
  HiLocationMarker,
  HiOutlineLogin,
  HiOutlinePencilAlt,
  HiPaperAirplane,
  HiX,
} from "react-icons/hi";
import { BiCollapse, BiExpand } from "react-icons/bi";
import { aiChatStyles as s } from "../../assets/dummyStyles";
import RealEstateBotIcon from "./RealEstateBotIcon";
import useAiChat from "../../hooks/useAiChat";
import {
  OPEN_AI_CHAT_EVENT,
  ROBOT_ICON_CREDIT,
  SUGGESTIONS,
  getContextPropertyId,
  shouldShowAiChat,
} from "./aiChatConfig";

// "4.200.000.000" → "4,2 tỷ"; "850.000.000" → "850 triệu"
const formatShortPrice = (price) => {
  if (!price) return "Liên hệ";
  if (price >= 1e9) {
    return `${(price / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`;
  }
  return `${Math.round(price / 1e6).toLocaleString("vi-VN")} triệu`;
};

// Phòng khi model vẫn trả markdown: bỏ ký hiệu ** và #
const cleanText = (text) =>
  text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#{1,6}\s*/gm, "");

const PropertyMiniCard = ({ property }) => (
  <Link to={`/property/${property._id}`} className={s.card}>
    <img
      src={property.images?.[0] || "/placeholder.jpg"}
      alt={property.title}
      className={s.cardImage}
      loading="lazy"
    />
    <div className={s.cardInfo}>
      <p className={s.cardTitle}>{property.title}</p>
      <p className={s.cardPrice}>{formatShortPrice(property.price)}</p>
      <p className={s.cardMeta}>
        <HiLocationMarker size={12} className="shrink-0" />
        <span className="truncate">
          {[property.area, property.city].filter(Boolean).join(", ")}
          {property.bhk ? ` · ${property.bhk} PN` : ""}
          {property.areaSize ? ` · ${property.areaSize} m²` : ""}
        </span>
      </p>
    </div>
  </Link>
);

const TypingStatus = ({ label }) => (
  <div className={s.status}>
    <span className={s.typingDots}>
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className={s.typingDot}
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
    {label}
  </div>
);

// Thời gian hiệu ứng đóng khung chat (khớp keyframe aiPanelOut trong index.css)
const PANEL_CLOSE_MS = 220;

const AiChatWidget = () => {
  const { pathname } = useLocation();
  const contextPropertyId = getContextPropertyId(pathname);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [closing, setClosing] = useState(false);
  const bodyRef = useRef(null);
  const panelRef = useRef(null);
  const closeTimerRef = useRef(null);

  // Đóng có hiệu ứng: khung thu nhỏ + mờ dần về phía nút chat rồi mới gỡ khỏi trang
  const closeChat = useCallback(() => {
    if (closeTimerRef.current) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setClosing(true);
    closeTimerRef.current = setTimeout(
      () => {
        closeTimerRef.current = null;
        setClosing(false);
        setOpen(false);
      },
      reduceMotion ? 0 : PANEL_CLOSE_MS,
    );
  }, []);

  const openChat = useCallback(() => {
    // đang đóng dở mà mở lại → hủy đóng
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    setClosing(false);
    setOpen(true);
  }, []);

  useEffect(() => () => clearTimeout(closeTimerRef.current), []);

  // Bấm ra ngoài khung chat → tự thu lại (hội thoại vẫn được giữ nguyên)
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        closeChat();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open, closeChat]);
  const textareaRef = useRef(null);

  const {
    messages,
    quota,
    sending,
    limitReached,
    isGuest,
    sendMessage,
    resetConversation,
  } = useAiChat({ contextPropertyId });

  // Tự cuộn xuống tin mới nhất
  useEffect(() => {
    if (open && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, open]);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  // Nơi khác trong trang yêu cầu mở khung chat
  useEffect(() => {
    window.addEventListener(OPEN_AI_CHAT_EVENT, openChat);
    return () => window.removeEventListener(OPEN_AI_CHAT_EVENT, openChat);
  }, [openChat]);

  // Esc: đang phóng to thì thu nhỏ trước, sau đó mới đóng
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (expanded) setExpanded(false);
      else closeChat();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, expanded, closeChat]);

  if (!shouldShowAiChat(pathname) || quota?.enabled === false) return null;

  const submit = (text = input) => {
    if (!text.trim() || sending) return;
    sendMessage(text);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const handleInput = (e) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={openChat}
          className={`group ai-fab-in ${s.fab}`}
          aria-label="Mở chatbot RealEstate"
        >
          {messages.length === 0 && <span className={s.fabPulse} />}
          <span className={s.fabIconWrap}>
            <span className={s.fabRing} />
            <span className={s.fabIcon}>
              <span className="ai-float">
                <RealEstateBotIcon size={34} className="ai-wave" />
              </span>
            </span>
            <span className={s.fabSparkle} aria-hidden="true">✦</span>
          </span>
          <span className={`relative ${s.fabLabel}`}>Chat với RealEstate</span>
        </button>
      )}

      {open && (
        <section
          ref={panelRef}
          className={`${s.panel} ${expanded ? s.panelExpanded : s.panelNormal} ${
            closing ? "ai-panel-out pointer-events-none" : ""
          }`}
          role="dialog"
          aria-label="Chatbot RealEstate"
        >
          <header className={s.header}>
            <div className={s.headerAvatar}>
              {/* đang trả lời → lắc lư "suy nghĩ"; bình thường bồng bềnh nhẹ */}
              <span className={sending ? "ai-thinking inline-flex" : "ai-float"}>
                <RealEstateBotIcon size={34} />
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className={s.headerTitle}>
                RealEstate <span className={s.aiBadge}>AI</span>
              </p>
              <p className={s.headerSubtitle}>
                <span className={s.onlineDot} />
                Trợ lý tìm nhà thông minh
              </p>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={resetConversation}
                className={s.headerButton}
                title="Cuộc trò chuyện mới"
              >
                <HiOutlinePencilAlt size={20} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className={`${s.headerButton} max-sm:hidden`}
              title={expanded ? "Thu nhỏ" : "Phóng to"}
            >
              {expanded ? <BiCollapse size={20} /> : <BiExpand size={20} />}
            </button>
            <button
              type="button"
              onClick={closeChat}
              className={s.headerButton}
              title="Đóng"
            >
              <HiX size={20} />
            </button>
          </header>

          <div ref={bodyRef} className={s.body}>
            {messages.length === 0 ? (
              <div className={s.welcome}>
                <div className={`ai-pop ${s.welcomeIcon}`}>
                  <span className="ai-float">
                    <RealEstateBotIcon size={60} className="ai-wave" />
                  </span>
                </div>
                <p className={s.welcomeTitle}>Xin chào, mình là RealEstate! 👋</p>
                <p className={s.welcomeText}>
                  Hãy mô tả ngôi nhà bạn mong muốn bằng lời của bạn, mình sẽ tìm
                  những tin phù hợp nhất trên sàn.
                  {contextPropertyId && " Bạn cũng có thể hỏi về căn đang xem."}
                </p>
                <div className={s.chips}>
                  {(contextPropertyId
                    ? ["Căn này có gì nổi bật?", ...SUGGESTIONS.slice(0, 3)]
                    : SUGGESTIONS
                  ).map((text) => (
                    <button
                      key={text}
                      type="button"
                      onClick={() => submit(text)}
                      disabled={sending || limitReached}
                      className={s.chip}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className={s.userRow}>
                    <div className={s.userBubble}>{m.content}</div>
                  </div>
                ) : (
                  <div key={m.id} className={s.botRow}>
                    <div className={s.botAvatar}>
                      <RealEstateBotIcon size={26} />
                    </div>
                    <div className={s.botContent}>
                      {m.content && (
                        <div className={s.botBubble}>{cleanText(m.content)}</div>
                      )}
                      {m.status && <TypingStatus label={m.status} />}
                      {m.properties?.length > 0 && (
                        <div className={s.cards}>
                          {m.properties.map((p) => (
                            <PropertyMiniCard key={p._id} property={p} />
                          ))}
                        </div>
                      )}
                      {m.error && (
                        <div className={s.errorBox}>
                          <HiExclamationCircle size={16} className="shrink-0 mt-px" />
                          {m.error}
                        </div>
                      )}
                    </div>
                  </div>
                ),
              )
            )}
          </div>

          <footer className={s.footer}>
            {limitReached ? (
              <div className={s.limitBox}>
                <p className={s.limitTitle}>
                  {isGuest
                    ? `Bạn đã dùng hết ${quota?.limit ?? 10} câu hỏi miễn phí`
                    : "Bạn đã dùng hết lượt hỏi hôm nay"}
                </p>
                <p className={s.limitText}>
                  {isGuest
                    ? "Đăng nhập để tiếp tục trò chuyện và nhận gợi ý bất động sản dành riêng cho bạn."
                    : "Vui lòng quay lại vào ngày mai."}
                </p>
                {isGuest && (
                  <Link to="/login" className={s.limitButton}>
                    <HiOutlineLogin size={16} /> Đăng nhập
                  </Link>
                )}
              </div>
            ) : (
              <>
                {isGuest && quota && (
                  <div className={s.quota}>
                    <span>
                      Còn <strong>{quota.remaining}</strong>/{quota.limit} câu hỏi
                      miễn phí
                    </span>
                    <Link to="/login" className={s.quotaLink}>
                      Đăng nhập để hỏi thêm
                    </Link>
                  </div>
                )}
                <div className={s.inputRow}>
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={input}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    maxLength={1000}
                    placeholder="VD: căn hộ yên tĩnh gần biển cho gia đình…"
                    className={s.textarea}
                  />
                  <button
                    type="button"
                    onClick={() => submit()}
                    disabled={!input.trim() || sending}
                    className={s.sendButton}
                    aria-label="Gửi"
                  >
                    <HiPaperAirplane size={18} className="rotate-90" />
                  </button>
                </div>
              </>
            )}
            <p className={s.disclaimer}>
              Trợ lý AI có thể nhầm lẫn. Hãy kiểm tra lại thông tin trong tin đăng.
              {" · "}
              <a
                href={ROBOT_ICON_CREDIT.url}
                target="_blank"
                rel="noopener noreferrer"
                className={s.credit}
              >
                Icon{ROBOT_ICON_CREDIT.author ? ` by ${ROBOT_ICON_CREDIT.author}` : ""} – Flaticon
              </a>
            </p>
          </footer>
        </section>
      )}
    </>
  );
};

export default AiChatWidget;
