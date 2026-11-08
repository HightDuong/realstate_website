import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  HiBell,
  HiOutlineBell,
  HiCheckCircle,
  HiExclamationCircle,
  HiInformationCircle,
} from "react-icons/hi";
import API_URL from "../../config";
import { useAuth } from "../../context/AuthContext";
import { useChat } from "../../context/ChatContext";
import { emitNotificationEvent } from "../../hooks/useNotificationEvent";

const TYPE_ICONS = {
  property_approved: { Icon: HiCheckCircle, color: "text-[#16a34a]" },
  property_rejected: { Icon: HiExclamationCircle, color: "text-[#dc2626]" },
};

const timeAgo = (date) => {
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return "Vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return new Date(date).toLocaleDateString("vi-VN");
};

// Chuông thông báo: tải danh sách qua REST, nhận thông báo mới realtime qua socket ("notification")
const NotificationBell = ({ align = "right" }) => {
  const { token } = useAuth();
  const { socket } = useChat();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const wrapperRef = useRef(null);

  const headers = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    axios
      .get(`${API_URL}api/notifications`, { headers: headers() })
      .then((res) => {
        if (cancelled) return;
        setItems(res.data.notifications || []);
        setUnread(res.data.unreadCount || 0);
      })
      .catch((error) => console.error("Tải thông báo thất bại!", error));
    return () => {
      cancelled = true;
    };
  }, [token, headers]);

  // thông báo realtime
  useEffect(() => {
    if (!socket) return;
    const onNotification = (n) => {
      setItems((prev) => [n, ...prev].slice(0, 30));
      setUnread((c) => c + 1);
      // cho các trang đang mở tự cập nhật (vd nhãn "Chờ duyệt" → "Bị từ chối")
      emitNotificationEvent(n);
    };
    socket.on("notification", onNotification);
    return () => socket.off("notification", onNotification);
  }, [socket]);

  // bấm ra ngoài → đóng
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const openItem = async (n) => {
    setOpen(false);
    if (!n.isRead) {
      setItems((prev) => prev.map((x) => (x._id === n._id ? { ...x, isRead: true } : x)));
      setUnread((c) => Math.max(0, c - 1));
      axios
        .patch(`${API_URL}api/notifications/${n._id}/read`, {}, { headers: headers() })
        .catch(() => {});
    }
    if (n.link) navigate(n.link);
  };

  const markAll = async () => {
    setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
    setUnread(0);
    axios
      .patch(`${API_URL}api/notifications/read-all`, {}, { headers: headers() })
      .catch(() => {});
  };

  if (!token) return null;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative w-10 h-10 flex items-center justify-center rounded-full text-text-main hover:bg-primary/10 transition-colors"
        aria-label={unread ? `Thông báo (${unread} chưa đọc)` : "Thông báo"}
        title="Thông báo"
      >
        {unread ? <HiBell size={22} className="text-primary" /> : <HiOutlineBell size={22} />}
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#ef4444] text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute ${align === "left" ? "left-0" : "right-0"} mt-2 w-[340px] max-w-[calc(100vw-32px)] bg-white rounded-2xl border border-[#e2e8f0] shadow-[0_16px_40px_-12px_rgba(15,23,42,0.25)] z-[2200] overflow-hidden animate-[selectIn_120ms_ease-out]`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
            <p className="font-bold text-text-main">Thông báo</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Đánh dấu đã đọc tất cả
              </button>
            )}
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-[#94a3b8]">
                Chưa có thông báo nào
              </p>
            ) : (
              items.map((n) => {
                const { Icon, color } = TYPE_ICONS[n.type] || {
                  Icon: HiInformationCircle,
                  color: "text-primary",
                };
                return (
                  <button
                    key={n._id}
                    type="button"
                    onClick={() => openItem(n)}
                    className={`w-full flex gap-3 px-4 py-3 text-left border-b border-[#f8fafc] hover:bg-[#f8fafc] transition-colors ${
                      n.isRead ? "" : "bg-[#f0fdfa]"
                    }`}
                  >
                    <Icon size={20} className={`shrink-0 mt-0.5 ${color}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-text-main">{n.title}</span>
                      {n.message && (
                        <span className="block text-xs text-[#64748b] mt-0.5 whitespace-pre-line line-clamp-3">
                          {n.message}
                        </span>
                      )}
                      <span className="block text-[11px] text-[#94a3b8] mt-1">
                        {timeAgo(n.createdAt)}
                      </span>
                    </span>
                    {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
