import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminPropertiesStyles as s } from "../../assets/dummyStyles";
import { useAuth } from "../../context/AuthContext";
import PropertyCard from "../../components/common/PropertyCard";
import axios from "axios";
import API_URL from "../../config";
import {
  HiOutlineBan,
  HiOutlineCheck,
  HiOutlineExternalLink,
  HiOutlineTrash,
  HiX,
} from "react-icons/hi";
import { Link } from "react-router-dom";
import { getModerationStatus, MODERATION_LABELS } from "../../utils/propertyLabels";
import useNotificationEvent from "../../hooks/useNotificationEvent";
import { AiReviewModal, AiReviewSummary } from "../../components/ai/AiModerationReview";

// Tab lọc theo trạng thái kiểm duyệt. "Chờ duyệt" gồm cả tin cũ chưa từng được kiểm duyệt.
const TABS = [
  { key: "queue", label: "Cần duyệt", match: (st) => st === "pending" || st === "legacy" },
  { key: "approved", label: "Đã duyệt", match: (st) => st === "approved" },
  { key: "rejected", label: "Bị từ chối", match: (st) => st === "rejected" },
  { key: "all", label: "Tất cả", match: () => true },
];

const LEVEL_RANK = { high: 3, medium: 2, low: 1 };
// Chưa có kết quả (chưa phân tích, đang chạy, lỗi) xếp giữa trung bình và thấp: chưa rõ thì không coi là an toàn
const UNKNOWN_RISK_RANK = 1500;
const riskRank = (p) =>
  p.aiReview?.status === "done" ? LEVEL_RANK[p.aiReview.level] * 1000 + p.aiReview.score : UNKNOWN_RISK_RANK;

// Tin vừa gửi duyệt: backend phân tích ngầm vài giây sau khi lưu, có thể chưa kịp tạo bản ghi "running"
const REVIEW_WARMUP_MS = 2 * 60 * 1000;
const isAwaitingReview = (p, now) =>
  p.aiReview?.status === "running" ||
  (p.moderationStatus === "pending" && !p.aiReview && now - new Date(p.updatedAt).getTime() < REVIEW_WARMUP_MS);

const REJECT_PRESETS = [
  "Thông tin/hình ảnh không đúng thực tế",
  "Giá đăng không hợp lý hoặc sai đơn vị",
  "Nội dung trùng lặp với tin khác",
  "Thiếu thông tin quan trọng (địa chỉ, diện tích, pháp lý)",
];

const AdminProperties = () => {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("queue");
  const [rejecting, setRejecting] = useState(null); // tin đang mở hộp thoại từ chối
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [sortBy, setSortBy] = useState("risk"); // "risk" | "newest"
  const [reviewingId, setReviewingId] = useState(null); // tin đang mở hộp thoại phân tích AI
  const [runningIds, setRunningIds] = useState(() => new Set()); // tin admin vừa bấm "Phân tích lại"
  const { token } = useAuth();
  // có tin mới / tin sửa cần duyệt → tải lại danh sách
  const [reloadKey, setReloadKey] = useState(0);
  useNotificationEvent(["property_submitted"], () => setReloadKey((k) => k + 1));

  // tăng mỗi khi admin đổi danh sách tại chỗ (duyệt, từ chối, xóa, phân tích lại)
  const mutationRef = useRef(0);

  //to fetch properties
  useEffect(() => {
    let cancelled = false;
    const startedAt = mutationRef.current;
    const fetchProperties = async () => {
      try {
        const res = await axios.get(`${API_URL}api/admin/properties`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        // đã có lần tải mới hơn → bỏ qua; admin vừa thao tác trong lúc chờ → dữ liệu này đã cũ, tải lại
        if (cancelled) return;
        if (mutationRef.current !== startedAt) {
          setReloadKey((k) => k + 1);
          return;
        }
        const props = Array.isArray(res.data)
          ? res.data
          : res.data.properties || [];
        const now = Date.now();
        setProperties(props.map((p) => ({ ...p, aiAwaiting: isAwaitingReview(p, now) })));
      } catch (error) {
        console.error("Tải BĐS thất bại!", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchProperties();
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  // AI đang phân tích tin nào đó → cứ 4 giây tải lại một lần (kể cả khi một lần tải bị lỗi)
  const hasAwaiting = properties.some((p) => p.aiAwaiting);
  useEffect(() => {
    if (!hasAwaiting) return;
    const timer = setInterval(() => setReloadKey((k) => k + 1), 4000);
    return () => clearInterval(timer);
  }, [hasAwaiting]);

  const counts = useMemo(() => {
    const c = {};
    TABS.forEach((t) => {
      c[t.key] = properties.filter((p) => t.match(getModerationStatus(p))).length;
    });
    return c;
  }, [properties]);

  const visible = useMemo(() => {
    const current = TABS.find((t) => t.key === tab);
    const list = properties.filter((p) => current.match(getModerationStatus(p)));
    // danh sách gốc đã xếp mới nhất trước; sort ổn định nên tin cùng mức rủi ro vẫn giữ thứ tự đó
    return sortBy === "risk" ? [...list].sort((a, b) => riskRank(b) - riskRank(a)) : list;
  }, [properties, tab, sortBy]);

  const applyResult = (id, data) => {
    mutationRef.current += 1;
    setProperties((prev) => prev.map((p) => (p._id === id ? { ...p, ...data } : p)));
  };

  const handleRunReview = async (id) => {
    setRunningIds((prev) => new Set(prev).add(id));
    try {
      const res = await axios.post(
        `${API_URL}api/admin/properties/${id}/ai-review`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      applyResult(id, { aiReview: res.data.review, aiAwaiting: false });
    } catch (error) {
      alert(error.response?.data?.message || "Phân tích tin đăng thất bại!");
    } finally {
      setRunningIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const openReject = (p, presetReason = "") => {
    setReviewingId(null);
    setRejecting(p);
    setReason(presetReason);
  };

  const reviewingProperty = properties.find((p) => p._id === reviewingId) || null;
  const closeReview = useCallback(() => setReviewingId(null), []);

  const handleApprove = async (id) => {
    const review = properties.find((p) => p._id === id)?.aiReview;
    if (
      review?.status === "done" &&
      review.level === "high" &&
      !window.confirm(
        `AI đánh giá tin này "${review.levelLabel}" (${review.score} điểm): ${review.flags
          .slice(0, 2)
          .map((f) => f.label)
          .join(", ")}. Bạn vẫn muốn duyệt?`,
      )
    ) {
      return;
    }
    setBusyId(id);
    try {
      const res = await axios.patch(
        `${API_URL}api/admin/properties/${id}/approve`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      applyResult(id, res.data.property);
    } catch (error) {
      alert(error.response?.data?.message || "Duyệt tin thất bại!");
    } finally {
      setBusyId(null);
    }
  };

  const submitReject = async (e) => {
    e.preventDefault();
    const id = rejecting._id;
    setBusyId(id);
    try {
      const res = await axios.patch(
        `${API_URL}api/admin/properties/${id}/reject`,
        { reason },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      applyResult(id, res.data.property);
      setRejecting(null);
      setReason("");
    } catch (error) {
      alert(error.response?.data?.message || "Từ chối tin thất bại!");
    } finally {
      setBusyId(null);
    }
  };

  //to delete a particular property
  const handleDelete = async (id) => {
    if (!window.confirm("Bạn chắc chắn muốn xóa BĐS này chứ?")) return;

    try {
      await axios.delete(`${API_URL}api/admin/properties/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      mutationRef.current += 1;
      setProperties((prev) => prev.filter((p) => p._id !== id));
    } catch (error) {
      alert(error.response?.data?.message || "Xóa BĐS thất bại!");
    }
  };

  if (loading)
    return (
      <div className={s.loaderFullPage}>
        <div className={s.loader}></div>
      </div>
    );
  return (
    <>
      <div className={s.headerContainer}>
        <h1 className={s.pageTitle}>Kiểm duyệt bất động sản</h1>
        <p className={s.pageSubtitle}>
          Tin mới chỉ hiển thị công khai sau khi được duyệt. Tin bị từ chối sẽ
          được gửi lại khi người bán chỉnh sửa. AI tự rà soát tin chờ duyệt và
          nêu mức rủi ro kèm lý do; quyết định cuối cùng thuộc về bạn.
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
                tab === t.key
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-text-main border-[#e2e8f0] hover:border-primary"
              }`}
            >
              {t.label}
              <span
                className={`ml-2 px-1.5 rounded-full text-xs ${
                  tab === t.key ? "bg-white/25" : "bg-[#f1f5f9] text-[#64748b]"
                }`}
              >
                {counts[t.key]}
              </span>
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-sm text-[#64748b]">
            Sắp xếp
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-xl border border-[#e2e8f0] bg-white px-3 py-2 text-sm text-text-main outline-none focus:border-primary"
            >
              <option value="risk">Rủi ro cao trước</option>
              <option value="newest">Mới nhất</option>
            </select>
          </label>
        </div>
      </div>
      <div className={s.headerContainer}>
        {visible.length === 0 ? (
          <div className={s.emptyStateCard}>
            {tab === "queue"
              ? "Không có tin nào cần duyệt 🎉"
              : "Không có bất động sản nào trong mục này"}
          </div>
        ) : (
          <div className={s.propertiesGrid}>
            {visible.map((p) => {
              const status = getModerationStatus(p);
              return (
                <PropertyCard
                  key={p._id}
                  property={p}
                  showModeration
                  renderActions={() => (
                    <div className="w-full flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-[#64748b]">
                          {MODERATION_LABELS[status]}
                        </span>
                        {p.moderatedAt && (
                          <span className="text-[#94a3b8]">
                            {new Date(p.moderatedAt).toLocaleDateString("vi-VN")}
                          </span>
                        )}
                      </div>
                      {status === "rejected" && p.rejectionReason && (
                        <p className="text-xs text-[#b91c1c] bg-[#fef2f2] rounded-lg px-3 py-2">
                          Lý do: {p.rejectionReason}
                        </p>
                      )}
                      <AiReviewSummary
                        review={p.aiReview}
                        running={runningIds.has(p._id) || p.aiAwaiting}
                        onOpen={() => setReviewingId(p._id)}
                        onRun={() => handleRunReview(p._id)}
                      />
                      <div className={s.actionWrapper}>
                        <div className={s.sellerInfo}>
                          <div className={s.sellerName}>
                            Người bán: {p.seller?.name || "Không xác định"}
                          </div>
                          <div className={s.sellerEmail}>{p.seller?.email}</div>
                        </div>
                        <div className={s.buttonGroup}>
                          {status !== "approved" && (
                            <button
                              type="button"
                              disabled={busyId === p._id}
                              onClick={() => handleApprove(p._id)}
                              className="p-2 rounded-lg border border-[#99f6e4] bg-[#f0fdfa] text-primary hover:bg-[#ccfbf1] transition-colors disabled:opacity-50"
                              title="Duyệt tin"
                            >
                              <HiOutlineCheck size={16} />
                            </button>
                          )}
                          {status !== "rejected" && (
                            <button
                              type="button"
                              disabled={busyId === p._id}
                              onClick={() => openReject(p)}
                              className="p-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] text-[#d97706] hover:bg-[#fef3c7] transition-colors disabled:opacity-50"
                              title="Từ chối tin"
                            >
                              <HiOutlineBan size={16} />
                            </button>
                          )}
                          <Link to={`/property/${p._id}`} className={s.viewLink} title="Xem tin">
                            <HiOutlineExternalLink size={16} />
                          </Link>

                          <button
                            onClick={() => handleDelete(p._id)}
                            className={s.deleteButton}
                            title="Xóa tin"
                          >
                            <HiOutlineTrash size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                />
              );
            })}
          </div>
        )}
      </div>

      {rejecting && (
        <div
          className="fixed inset-0 z-[2300] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setRejecting(null)}
        >
          <form
            onSubmit={submitReject}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-xl"
            role="dialog"
            aria-label="Từ chối tin đăng"
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-bold text-text-main">Từ chối tin đăng</h3>
                <p className="text-sm text-[#64748b] line-clamp-1">{rejecting.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setRejecting(null)}
                className="p-1 rounded-lg text-[#94a3b8] hover:bg-[#f1f5f9]"
                aria-label="Đóng"
              >
                <HiX size={20} />
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {rejecting.aiReview?.suggestedReason && (
                <button
                  type="button"
                  onClick={() => setReason(rejecting.aiReview.suggestedReason)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold border border-primary text-primary bg-secondary hover:bg-primary-light"
                >
                  ✨ Dùng lý do AI gợi ý
                </button>
              )}
              {REJECT_PRESETS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className="px-3 py-1.5 rounded-full text-xs border border-[#e2e8f0] hover:border-primary hover:text-primary"
                >
                  {r}
                </button>
              ))}
            </div>
            <label className="block text-sm font-semibold text-text-main mb-1.5">
              Lý do (người bán sẽ nhận được qua thông báo và email)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              maxLength={500}
              required
              minLength={5}
              placeholder="VD: Ảnh không phải ảnh thực tế của căn nhà…"
              className="w-full rounded-xl border border-[#e2e8f0] p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={() => setRejecting(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-[#64748b] hover:bg-[#f1f5f9]"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={busyId === rejecting._id || reason.trim().length < 5}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[#dc2626] hover:bg-[#b91c1c] disabled:opacity-50"
              >
                Từ chối tin
              </button>
            </div>
          </form>
        </div>
      )}

      {reviewingProperty && (
        <AiReviewModal
          property={reviewingProperty}
          review={reviewingProperty.aiReview}
          running={runningIds.has(reviewingProperty._id) || reviewingProperty.aiAwaiting}
          onClose={closeReview}
          onRun={() => handleRunReview(reviewingProperty._id)}
          onUseReason={(text) => openReject(reviewingProperty, text)}
        />
      )}
    </>
  );
};

export default AdminProperties;
