import { useEffect, useState } from "react";
import { adminContactsStyles as s } from "../../assets/dummyStyles";
import { useAuth } from "../../context/AuthContext";
import axios from "axios";
import API_URL from "../../config";
import {
  HiCheck,
  HiCheckCircle,
  HiOutlineClock,
  HiOutlineDuplicate,
  HiOutlineMail,
  HiOutlinePhone,
  HiOutlineRefresh,
  HiOutlineReply,
} from "react-icons/hi";

const ROLE_LABELS = { buyer: "Người mua", seller: "Người bán" };
// Thư cũ chưa có field status → backend trả về "pending" (giá trị mặc định của schema)
const STATUS_LABELS = { pending: "Chờ xử lý", resolved: "Đã xử lý" };
const FILTERS = [
  { key: "pending", label: "Chờ xử lý" },
  { key: "resolved", label: "Đã xử lý" },
  { key: "all", label: "Tất cả" },
];
const EMPTY_TEXT = {
  pending: "Không còn thư nào chờ xử lý.",
  resolved: "Chưa có thư nào được đánh dấu đã xử lý.",
  all: "Chưa có thư liên hệ nào từ người dùng.",
};
// mailto quá dài có thể bị trình duyệt/ứng dụng thư cắt hoặc từ chối → chỉ trích dẫn phần đầu nội dung
const MAX_QUOTE_LENGTH = 1000;

const formatDateTime = (date) =>
  new Date(date).toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" });
const telHref = (phone) => `tel:${phone.replace(/[^\d+]/g, "")}`;

// Email trả lời soạn sẵn: tiêu đề + lời chào + trích dẫn nội dung người dùng đã gửi
const replyMailto = (contact) => {
  const message =
    contact.message.length > MAX_QUOTE_LENGTH
      ? `${contact.message.slice(0, MAX_QUOTE_LENGTH)}…`
      : contact.message;
  const quoted = message
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const body =
    `Chào ${contact.name},\n\n\n\n` +
    `Trân trọng,\nBan quản trị RealEstate\n\n` +
    `----- Nội dung bạn đã gửi lúc ${formatDateTime(contact.createdAt)} -----\n${quoted}`;
  const params = `subject=${encodeURIComponent("Phản hồi yêu cầu liên hệ - RealEstate")}&body=${encodeURIComponent(body)}`;
  return `mailto:${encodeURIComponent(contact.email)}?${params}`;
};

const AdminContacts = () => {
  const [contacts, setContacts] = useState([]);
  const [counts, setCounts] = useState({ all: 0, pending: 0, resolved: 0 });
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const { token } = useAuth();

  // Dự phòng khi máy admin chưa cài ứng dụng thư (mailto không mở được gì): sao chép email để dán vào Gmail web
  const copyEmail = async (contact) => {
    try {
      await navigator.clipboard.writeText(contact.email);
      setCopiedId(contact._id);
      setTimeout(() => setCopiedId((id) => (id === contact._id ? null : id)), 1500);
    } catch {
      window.prompt("Sao chép email:", contact.email);
    }
  };

  // bỏ kết quả cũ khi admin đổi bộ lọc nhanh (response về không theo thứ tự)
  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${API_URL}api/contact`, {
        params: { status: filter },
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        if (cancelled) return;
        setContacts(Array.isArray(res.data.data) ? res.data.data : []);
        if (res.data.counts) setCounts(res.data.counts);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || "Không tải được danh sách liên hệ");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, token, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  const updateStatus = async (contact, status) => {
    setUpdatingId(contact._id);
    try {
      await axios.patch(
        `${API_URL}api/contact/${contact._id}/status`,
        { status },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      // tải lại để thư rời khỏi bộ lọc hiện tại và số đếm trên bộ lọc đúng
      reload();
    } catch (err) {
      alert(err.response?.data?.message || "Không cập nhật được trạng thái");
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading)
    return (
      <div className="loader-full-page">
        <div className="loader"></div>
      </div>
    );
  return (
    <>
      <div className={s.container}>
        <h1 className={s.heading}>Yêu cầu liên lạc</h1>
        <p className={s.subheading}>
          Quản lý yêu cầu từ người dùng. Hỗ trợ xong thì bấm "Đánh dấu đã xử lý".
        </p>
      </div>

      <div className={s.tabs}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={s.tab(filter === f.key)}
          >
            {f.label}
            <span className={s.tabCount(filter === f.key)}>{counts[f.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className={s.card}>
        <div className={s.cardHeader}>
          <h2 className={s.cardTitle}>
            {FILTERS.find((f) => f.key === filter)?.label} ({contacts.length})
          </h2>
        </div>
        {error ? (
          <div className={s.emptyState}>
            <p className={s.errorText}>{error}</p>
            <button type="button" className="btn btn-outline mt-3" onClick={reload}>
              Thử lại
            </button>
          </div>
        ) : contacts.length === 0 ? (
          <div className={s.emptyState}>
            <HiOutlineMail size={48} className={s.emptyIcon} />
            <p>{EMPTY_TEXT[filter]}</p>
          </div>
        ) : (
          <div className={s.contactList}>
            {contacts.map((contact, index) => {
              const status = contact.status === "resolved" ? "resolved" : "pending";
              const busy = updatingId === contact._id;
              return (
                <div key={contact._id} className={s.contactItem(index, contacts.length)}>
                  <div className={s.contactHeader}>
                    <div className="flex gap-5">
                      <div className={s.avatarWrapper(contact.role)}>
                        {contact.name.charAt(0).toUpperCase()}
                      </div>

                      <div>
                        <div className={s.nameBadgeContainer}>
                          <h3 className={s.name}>{contact.name}</h3>
                          <span className={s.roleBadge(contact.role)}>
                            {ROLE_LABELS[contact.role] || "Không rõ"}
                          </span>
                          <span className={s.statusBadge(status)}>
                            {status === "resolved" ? (
                              <HiCheckCircle size={13} />
                            ) : (
                              <HiOutlineClock size={13} />
                            )}
                            {STATUS_LABELS[status]}
                          </span>
                        </div>

                        <div className={s.contactDetails}>
                          <div className={s.detailItem}>
                            <HiOutlineMail size={16} className="shrink-0" />
                            <a
                              href={replyMailto(contact)}
                              className={s.detailLink}
                              title="Soạn email trả lời"
                            >
                              {contact.email}
                            </a>
                            <button
                              type="button"
                              onClick={() => copyEmail(contact)}
                              className={s.copyButton}
                              title="Sao chép email"
                              aria-label="Sao chép email"
                            >
                              {copiedId === contact._id ? (
                                <HiCheck size={14} />
                              ) : (
                                <HiOutlineDuplicate size={14} />
                              )}
                            </button>
                          </div>
                          {contact.phone && (
                            <div className={s.detailItem}>
                              <HiOutlinePhone size={16} className="shrink-0" />
                              <a
                                href={telHref(contact.phone)}
                                className={s.detailLink}
                                title="Gọi điện"
                              >
                                {contact.phone}
                              </a>
                            </div>
                          )}
                          <div className={s.detailItem}>
                            <HiOutlineClock size={16} /> {formatDateTime(contact.createdAt)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={s.messageBox}>{contact.message}</div>
                  {status === "resolved" && contact.resolvedAt && (
                    <p className={s.resolvedNote}>
                      <HiCheckCircle size={14} className="shrink-0" />
                      Đã xử lý
                      {contact.resolvedBy?.name ? ` bởi ${contact.resolvedBy.name}` : ""} lúc{" "}
                      {formatDateTime(contact.resolvedAt)}
                    </p>
                  )}
                  <div className={s.actions}>
                    <a href={replyMailto(contact)} className={s.replyButton}>
                      <HiOutlineReply size={16} /> Trả lời qua email
                    </a>
                    {contact.phone && (
                      <a href={telHref(contact.phone)} className={s.callButton}>
                        <HiOutlinePhone size={16} /> Gọi điện
                      </a>
                    )}
                    {status === "pending" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => updateStatus(contact, "resolved")}
                        className={s.resolveButton}
                      >
                        <HiCheckCircle size={16} /> {busy ? "Đang lưu..." : "Đánh dấu đã xử lý"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => updateStatus(contact, "pending")}
                        className={s.callButton}
                      >
                        <HiOutlineRefresh size={16} /> {busy ? "Đang lưu..." : "Mở lại"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

export default AdminContacts;
