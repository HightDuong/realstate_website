import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import {
  HiChatAlt2,
  HiClock,
  HiExclamationCircle,
  HiExternalLink,
  HiInbox,
  HiLightningBolt,
  HiMail,
  HiPhone,
  HiSearch,
  HiTrendingUp,
  HiX,
} from "react-icons/hi";
import API_URL from "../../config";
import { useAuth } from "../../context/AuthContext";
import Select from "../../components/common/Select";
import Pagination from "../../components/common/Pagination";
import useNotificationEvent from "../../hooks/useNotificationEvent";
import { sellerInquiriesStyles as s } from "../../assets/dummyStyles";
import {
  INQUIRY_STATUS_LABELS,
  INQUIRY_STATUS_ORDER,
  LOST_REASON_LABELS,
  formatVND,
  getInquiryStatus,
} from "../../utils/propertyLabels";

const PAGE_SIZE = 20;
const OVERDUE_MS = 24 * 60 * 60 * 1000;
const MAX_NOTE_LENGTH = 1000;
const DESKTOP_QUERY = "(min-width: 1024px)";

const TABS = [
  { key: "all", label: "Tất cả" },
  ...INQUIRY_STATUS_ORDER.map((key) => ({ key, label: INQUIRY_STATUS_LABELS[key] })),
];

// Desktop: chi tiết nằm cột phải; mobile: lớp phủ toàn màn hình
const subscribeDesktop = (callback) => {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
};
const useIsDesktop = () =>
  useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );

const formatDuration = (minutes) => {
  if (minutes == null) return "—";
  if (minutes < 60) return `${Math.max(Math.round(minutes), 1)} phút`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours * 10) / 10} giờ`.replace(".", ",");
  return `${Math.round((hours / 24) * 10) / 10} ngày`.replace(".", ",");
};

const minutesSince = (date) => (Date.now() - new Date(date).getTime()) / 60000;

// "5 phút trước", "3 giờ trước", "2 ngày trước" (làm tròn xuống, không lẻ)
const formatRelative = (date) => {
  const minutes = Math.floor(minutesSince(date));
  if (minutes < 1) return "Vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} giờ trước`;
  if (minutes < 60 * 24 * 30) return `${Math.floor(minutes / 1440)} ngày trước`;
  return new Date(date).toLocaleDateString("vi-VN");
};

const formatDateTime = (date) =>
  new Date(date).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const isOverdue = (inquiry) =>
  getInquiryStatus(inquiry) === "new" && minutesSince(inquiry.createdAt) * 60000 > OVERDUE_MS;

/* ---------- Hộp thoại chọn lý do "Không tiếp tục" ---------- */
const LostReasonModal = ({ inquiry, onClose, onSubmit }) => {
  const [reason, setReason] = useState(inquiry.lostReason || "");
  const [note, setNote] = useState(inquiry.lostNote || "");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason) return;
    setSubmitting(true);
    const ok = await onSubmit({ lostReason: reason, lostNote: note.trim() });
    setSubmitting(false);
    if (ok) onClose();
  };

  return createPortal(
    <div className={s.modalOverlay} onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className={s.modal}
        role="dialog"
        aria-label="Lý do không tiếp tục"
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className={s.modalTitle}>Không tiếp tục với khách này?</h3>
          <button type="button" onClick={onClose} className={s.closeBtn} aria-label="Đóng">
            <HiX size={20} />
          </button>
        </div>
        <p className={s.modalSub}>
          {inquiry.buyer?.name} · {inquiry.property?.title || "Tin đăng đã bị xóa"}
        </p>
        <div className={s.reasonList}>
          {Object.entries(LOST_REASON_LABELS).map(([value, label]) => (
            <label key={value} className={s.reasonOption(reason === value)}>
              <input
                type="radio"
                name="lostReason"
                value={value}
                checked={reason === value}
                onChange={() => setReason(value)}
                className="accent-[#0d9488]"
              />
              {label}
            </label>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          placeholder="Ghi chú thêm (không bắt buộc, khách không nhìn thấy)"
          className={s.noteArea}
        />
        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className="btn btn-outline">
            Hủy
          </button>
          <button type="submit" disabled={!reason || submitting} className="btn btn-primary">
            {submitting ? "Đang lưu..." : "Xác nhận"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
};

/* ---------- Chi tiết một yêu cầu ---------- */
const InquiryDetail = ({ inquiry, onClose, onChangeStatus, onSaveNote, onStartChat }) => {
  const status = getInquiryStatus(inquiry);
  const [note, setNote] = useState(inquiry.sellerNote || "");
  const [savedNote, setSavedNote] = useState(inquiry.sellerNote || "");
  const [noteState, setNoteState] = useState("idle"); // idle | saving | saved | error
  const [busy, setBusy] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);

  const noteDirty = note.trim() !== savedNote;

  const saveNote = async () => {
    if (!noteDirty || noteState === "saving") return;
    setNoteState("saving");
    const saved = await onSaveNote(inquiry._id, note.trim());
    if (saved === null) {
      setNoteState("error");
    } else {
      setSavedNote(saved);
      setNoteState("saved");
    }
  };

  const handleStatus = async (next) => {
    if (next === "lost") {
      setLostOpen(true);
      return;
    }
    if (next === status || busy) return;
    setBusy(true);
    await onChangeStatus(inquiry, next);
    setBusy(false);
  };

  const history = [...(inquiry.statusHistory || [])].reverse();
  const property = inquiry.property;

  return (
    <div className={s.detail}>
      <div className={s.detailHeader}>
        <div className="min-w-0">
          <h2 className={s.detailName}>{inquiry.buyer?.name || "Người dùng"}</h2>
          <p className={s.detailSub}>Gửi lúc {formatDateTime(inquiry.createdAt)}</p>
        </div>
        <button type="button" onClick={onClose} className={s.closeBtn} aria-label="Đóng chi tiết">
          <HiX size={20} />
        </button>
      </div>

      <div className={s.contactList}>
        {inquiry.buyer?.phone ? (
          <a href={`tel:${inquiry.buyer.phone}`} className={s.contactItem}>
            <HiPhone className="shrink-0 text-[#94a3b8]" /> {inquiry.buyer.phone}
          </a>
        ) : (
          <span className={s.contactItem}>
            <HiPhone className="shrink-0 text-[#94a3b8]" /> Khách chưa cung cấp số điện thoại
          </span>
        )}
        {inquiry.buyer?.email && (
          <a href={`mailto:${inquiry.buyer.email}`} className={s.contactItem}>
            <HiMail className="shrink-0 text-[#94a3b8]" /> {inquiry.buyer.email}
          </a>
        )}
      </div>

      {property ? (
        <Link to={`/property/${property._id}`} className={s.propertyBox}>
          {property.images?.[0] ? (
            <img src={property.images[0]} alt="" className={s.propertyImg} />
          ) : (
            <span className={s.propertyImg} />
          )}
          <span className={s.propertyInfo}>
            <span className={s.propertyTitle}>{property.title}</span>
            <span className={s.propertyPrice}>{formatVND(property.price)}</span>
            {property.status === "sold" && <span className={s.propertySold}>Đã bán</span>}
          </span>
        </Link>
      ) : (
        <p className="text-sm text-[#94a3b8]">Tin đăng đã bị xóa</p>
      )}

      <div>
        <p className={s.sectionLabel}>Nội dung yêu cầu</p>
        <p className={s.messageBox}>{inquiry.message}</p>
      </div>

      <div>
        <p className={s.sectionLabel}>Trạng thái</p>
        <div className={s.statusGrid}>
          {INQUIRY_STATUS_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              disabled={busy}
              aria-pressed={key === status}
              onClick={() => handleStatus(key)}
              className={s.statusChip(key, key === status)}
            >
              {INQUIRY_STATUS_LABELS[key]}
            </button>
          ))}
        </div>
        {status === "lost" && inquiry.lostReason && (
          <p className={s.lostInfo}>
            Lý do: {LOST_REASON_LABELS[inquiry.lostReason]}
            {inquiry.lostNote ? ` – ${inquiry.lostNote}` : ""}
          </p>
        )}
      </div>

      <div>
        <p className={s.sectionLabel}>Ghi chú nội bộ</p>
        <textarea
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setNoteState("idle");
          }}
          onBlur={saveNote}
          maxLength={MAX_NOTE_LENGTH}
          placeholder="VD: khách cần vay ngân hàng 70%, muốn xem cuối tuần… (khách không nhìn thấy)"
          className={s.noteArea}
        />
        <div className={s.noteFooter}>
          <span>
            {noteState === "saving" && "Đang lưu..."}
            {noteState === "saved" && !noteDirty && "Đã lưu"}
            {noteState === "error" && (
              <span className="text-[#dc2626]">Không lưu được, thử lại</span>
            )}
            {noteState === "idle" && `${note.length}/${MAX_NOTE_LENGTH}`}
          </span>
          <button
            type="button"
            onClick={saveNote}
            disabled={!noteDirty || noteState === "saving"}
            className={s.noteSave}
          >
            Lưu ghi chú
          </button>
        </div>
      </div>

      <div className={s.actions}>
        <button
          type="button"
          onClick={() => onStartChat(inquiry)}
          disabled={!property}
          title={property ? undefined : "Tin đăng đã bị xóa, không thể nhắn tin"}
          className={s.btnChat}
        >
          <HiChatAlt2 /> Nhắn tin
        </button>
        {property ? (
          <Link to={`/property/${property._id}`} className={s.btnOutline}>
            Xem tin <HiExternalLink />
          </Link>
        ) : (
          <span />
        )}
      </div>

      {history.length > 0 && (
        <div>
          <p className={s.sectionLabel}>Lịch sử</p>
          <ol className={s.timeline}>
            {history.map((h, i) => (
              <li key={`${h.at}-${i}`} className={s.timelineItem}>
                <span className={s.timelineDot} />
                <p className={s.timelineLabel}>
                  {h.status === "new" && i === history.length - 1
                    ? "Khách gửi yêu cầu"
                    : `Chuyển sang "${INQUIRY_STATUS_LABELS[h.status]}"`}
                </p>
                <p className={s.timelineTime}>
                  {formatDateTime(h.at)}
                  {h.auto && " · tự động khi bạn trả lời tin nhắn"}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {lostOpen && (
        <LostReasonModal
          inquiry={inquiry}
          onClose={() => setLostOpen(false)}
          onSubmit={(extra) => onChangeStatus(inquiry, "lost", extra)}
        />
      )}
    </div>
  );
};

/* ---------- Trang Khách hàng ---------- */
const SellerInquiries = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("id");

  const authHeader = useMemo(
    () => ({ headers: { Authorization: `Bearer ${token}` } }),
    [token],
  );

  const [tab, setTab] = useState("new");
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const [list, setList] = useState({
    loaded: false,
    inquiries: [],
    counts: {},
    total: 0,
    totalPages: 1,
    error: "",
  });
  const [stats, setStats] = useState(null);
  const [properties, setProperties] = useState([]);
  const [detail, setDetail] = useState({ id: null, inquiry: null, error: "" });

  // Gõ tìm tên khách: chờ người dùng ngừng gõ rồi mới gọi API
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Danh sách theo tab / trang / bộ lọc
  useEffect(() => {
    let cancelled = false;
    const params = { status: tab, page, limit: PAGE_SIZE };
    if (q) params.q = q;
    if (propertyId) params.propertyId = propertyId;
    axios
      .get(`${API_URL}api/inquiry/seller`, { ...authHeader, params })
      .then((res) => {
        if (cancelled) return;
        setList({
          loaded: true,
          inquiries: res.data.inquiries || [],
          counts: res.data.counts || {},
          total: res.data.total || 0,
          totalPages: res.data.totalPages || 1,
          error: "",
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setList((prev) => ({
          ...prev,
          loaded: true,
          error: error.response?.data?.message || "Không tải được danh sách khách hàng",
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [authHeader, tab, page, q, propertyId, reloadKey]);

  // Số liệu tổng quan
  useEffect(() => {
    axios
      .get(`${API_URL}api/inquiry/seller/stats`, authHeader)
      .then((res) => setStats(res.data.stats))
      .catch(() => {});
  }, [authHeader, reloadKey]);

  // Danh sách tin của seller cho bộ lọc
  useEffect(() => {
    axios
      .get(`${API_URL}api/property/my`, authHeader)
      .then((res) => setProperties(res.data.properties || []))
      .catch(() => {});
  }, [authHeader]);

  // Chi tiết yêu cầu đang chọn (?id=...), mở ra thì tự đánh dấu đã đọc
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    axios
      .get(`${API_URL}api/inquiry/${selectedId}`, authHeader)
      .then((res) => {
        if (cancelled) return;
        const inquiry = res.data.inquiry;
        setDetail({ id: selectedId, inquiry, error: "" });
        if (!inquiry.isRead) {
          axios
            .patch(`${API_URL}api/inquiry/${inquiry._id}/read`, {}, authHeader)
            .then(() =>
              setList((prev) => ({
                ...prev,
                inquiries: prev.inquiries.map((i) =>
                  i._id === inquiry._id ? { ...i, isRead: true } : i,
                ),
              })),
            )
            .catch(() => {});
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setDetail({
          id: selectedId,
          inquiry: null,
          error: error.response?.data?.message || "Không tải được yêu cầu",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, authHeader, reloadKey]);

  // Khách mới gửi yêu cầu → cập nhật danh sách ngay, không cần F5
  useNotificationEvent(["inquiry_new"], reload);

  const changeTab = (key) => {
    setTab(key);
    setPage(1);
  };

  const openInquiry = (id) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("id", id);
      return next;
    });

  const closeDetail = () =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("id");
      return next;
    });

  const changeStatus = async (inquiry, status, extra = {}) => {
    try {
      const res = await axios.patch(
        `${API_URL}api/inquiry/${inquiry._id}/status`,
        { status, ...extra },
        authHeader,
      );
      const updated = res.data.inquiry;
      setDetail((d) => (d.inquiry?._id === updated._id ? { ...d, inquiry: updated } : d));

      // Chốt xong: hỏi có chuyển tin sang "Đã bán" không (không tự đổi)
      if (
        status === "won" &&
        updated.property?.status === "sale" &&
        window.confirm(`Đã chốt với khách. Đánh dấu tin "${updated.property.title}" là đã bán?`)
      ) {
        try {
          await axios.patch(
            `${API_URL}api/property/${updated.property._id}/status`,
            { status: "sold" },
            authHeader,
          );
        } catch (error) {
          alert(error.response?.data?.message || "Không đổi được trạng thái tin");
        }
      }
      reload();
      return true;
    } catch (error) {
      alert(error.response?.data?.message || "Không cập nhật được trạng thái");
      return false;
    }
  };

  const saveNote = async (id, note) => {
    try {
      const res = await axios.patch(`${API_URL}api/inquiry/${id}/note`, { note }, authHeader);
      return res.data.sellerNote ?? note;
    } catch {
      return null;
    }
  };

  const startChat = async (inquiry) => {
    try {
      const res = await axios.post(
        `${API_URL}api/chat/start`,
        { propertyId: inquiry.property?._id, buyerId: inquiry.buyer?._id },
        authHeader,
      );
      navigate("/chat-messages", { state: { chat: res.data } });
    } catch (error) {
      alert(error.response?.data?.message || "Không mở được cuộc trò chuyện");
    }
  };

  const propertyOptions = [
    { value: "", label: "Tất cả tin đăng" },
    ...properties.map((p) => ({ value: p._id, label: p.title })),
  ];

  const statCards = [
    {
      label: "Chưa xử lý",
      icon: HiInbox,
      value: stats?.newCount ?? "—",
      hint: "Khách ở trạng thái Mới",
    },
    {
      label: "Chờ quá 24 giờ",
      icon: HiExclamationCircle,
      value: stats?.overdueCount ?? "—",
      danger: stats?.overdueCount > 0,
      hint: "Nên phản hồi sớm",
    },
    {
      label: "Tỉ lệ chốt",
      icon: HiTrendingUp,
      value: stats?.winRate90d == null ? "—" : `${stats.winRate90d}%`,
      hint: stats?.closed90d
        ? `${stats.won90d}/${stats.closed90d} khách đã kết thúc, 90 ngày`
        : "Chưa có khách kết thúc trong 90 ngày",
    },
    {
      label: "Phản hồi trung bình",
      icon: HiLightningBolt,
      value: formatDuration(stats?.medianResponseMinutes),
      hint: "Trung vị, 90 ngày",
    },
  ];

  const detailLoading = selectedId && detail.id !== selectedId;
  let detailContent = null;
  if (selectedId) {
    if (detailLoading) {
      detailContent = (
        <div className={s.loaderBox}>
          <div className="loader" />
        </div>
      );
    } else if (detail.error) {
      detailContent = (
        <div className={s.detail}>
          <div className={s.detailHeader}>
            <p className="text-[#dc2626]">{detail.error}</p>
            <button type="button" onClick={closeDetail} className={s.closeBtn} aria-label="Đóng">
              <HiX size={20} />
            </button>
          </div>
        </div>
      );
    } else if (detail.inquiry) {
      detailContent = (
        <InquiryDetail
          key={detail.inquiry._id}
          inquiry={detail.inquiry}
          onClose={closeDetail}
          onChangeStatus={changeStatus}
          onSaveNote={saveNote}
          onStartChat={startChat}
        />
      );
    }
  }

  const from = list.total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(page * PAGE_SIZE, list.total);

  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.title}>Khách hàng</h1>
        <p className={s.subtitle}>
          Theo dõi từng khách từ lúc gửi yêu cầu đến khi chốt giao dịch.
        </p>
      </div>

      <div className={s.statsGrid}>
        {statCards.map(({ label, icon: Icon, value, hint, danger }) => (
          <div key={label} className={s.statCard}>
            <p className={s.statLabel}>
              <Icon /> {label}
            </p>
            <p className={s.statValue(danger)}>{value}</p>
            <p className={s.statHint}>{hint}</p>
          </div>
        ))}
      </div>

      <div className={s.tabs} role="tablist" aria-label="Lọc theo trạng thái">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => changeTab(t.key)}
            className={s.tab(tab === t.key)}
          >
            {t.label}
            <span className={s.tabCount(tab === t.key)}>{list.counts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className={s.filters}>
        <div className={s.searchWrapper}>
          <HiSearch className={s.searchIcon} />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm theo tên khách..."
            className={s.searchInput}
            aria-label="Tìm theo tên khách"
          />
        </div>
        <Select
          name="propertyId"
          value={propertyId}
          onChange={(e) => {
            setPropertyId(e.target.value);
            setPage(1);
          }}
          options={propertyOptions}
          className={s.propertySelect}
          ariaLabel="Lọc theo tin đăng"
        />
      </div>

      <div className={s.layout}>
        <div className={s.list}>
          {!list.loaded ? (
            <div className={s.loaderBox}>
              <div className="loader" />
            </div>
          ) : list.error ? (
            <div className={s.errorBox}>{list.error}</div>
          ) : list.inquiries.length === 0 ? (
            <div className={s.empty}>
              <div className={s.emptyIcon}>
                <HiInbox size={28} />
              </div>
              <p>
                {q || propertyId
                  ? "Không có khách nào khớp bộ lọc."
                  : tab === "new"
                    ? "Bạn đã xử lý hết khách mới 🎉"
                    : "Chưa có khách nào trong mục này."}
              </p>
              {tab !== "all" && (
                <button type="button" onClick={() => changeTab("all")} className={s.emptyLink}>
                  Xem tất cả khách hàng
                </button>
              )}
            </div>
          ) : (
            <>
              {list.inquiries.map((inq) => {
                const status = getInquiryStatus(inq);
                const overdue = isOverdue(inq);
                return (
                  <button
                    key={inq._id}
                    type="button"
                    onClick={() => openInquiry(inq._id)}
                    className={s.row(inq._id === selectedId)}
                  >
                    <span className={s.avatar}>{(inq.buyer?.name || "?").trim().charAt(0)}</span>
                    <span className={s.rowBody}>
                      <span className={s.rowTop}>
                        <span className={s.rowName}>
                          {!inq.isRead && <span className={s.unreadDot} title="Chưa đọc" />}
                          <span className="truncate">{inq.buyer?.name || "Người dùng"}</span>
                        </span>
                        <span className={s.statusBadge(status)}>{INQUIRY_STATUS_LABELS[status]}</span>
                      </span>
                      <span className={s.rowProperty}>
                        {inq.property?.title || "Tin đăng đã bị xóa"}
                      </span>
                      <span className={s.rowMessage}>{inq.message}</span>
                      <span className={s.rowMeta}>
                        <HiClock /> {formatRelative(inq.createdAt)}
                        {overdue && (
                          <span className={s.overdue}>
                            · Chờ phản hồi {formatDuration(minutesSince(inq.createdAt))}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
              {list.totalPages > 1 && (
                <Pagination
                  page={page}
                  totalPages={list.totalPages}
                  onPageChange={setPage}
                  from={from}
                  to={to}
                  total={list.total}
                  unit="khách"
                />
              )}
            </>
          )}
        </div>

        <aside className={s.aside} aria-label="Chi tiết khách hàng">
          {isDesktop &&
            (detailContent || (
              <p className={s.asidePlaceholder}>Chọn một khách trong danh sách để xem chi tiết.</p>
            ))}
        </aside>
      </div>

      {!isDesktop &&
        detailContent &&
        createPortal(
          <div className={s.mobileSheet} role="dialog" aria-label="Chi tiết khách hàng">
            {detailContent}
          </div>,
          document.body,
        )}
    </div>
  );
};

export default SellerInquiries;
