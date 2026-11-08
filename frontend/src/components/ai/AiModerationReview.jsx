import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  HiOutlineExternalLink,
  HiOutlineRefresh,
  HiOutlineSparkles,
  HiX,
} from "react-icons/hi";

// Kết quả AI hỗ trợ kiểm duyệt (spec mục 11.5) trên trang Kiểm duyệt tin của admin.
// Nhãn, lý do và bằng chứng đều do backend trả về bằng tiếng Việt.

const LEVEL_STYLES = {
  high: { box: "border-[#fecaca] bg-[#fef2f2]", badge: "bg-[#dc2626] text-white", bar: "bg-[#dc2626]" },
  medium: { box: "border-[#fed7aa] bg-[#fff7ed]", badge: "bg-[#ea580c] text-white", bar: "bg-[#ea580c]" },
  low: { box: "border-[#bbf7d0] bg-[#f0fdf4]", badge: "bg-[#16a34a] text-white", bar: "bg-[#16a34a]" },
};

const SEVERITY = {
  high: { label: "Cao", dot: "bg-[#dc2626]", chip: "bg-[#fee2e2] text-[#b91c1c]" },
  medium: { label: "Trung bình", dot: "bg-[#ea580c]", chip: "bg-[#ffedd5] text-[#c2410c]" },
  low: { label: "Thấp", dot: "bg-[#94a3b8]", chip: "bg-[#f1f5f9] text-[#475569]" },
};

const IMAGE_CODES = ["non_property_image", "image_contact_info", "image_mismatch"];
const sourceLabel = (flag) => {
  if (flag.source === "rule") return "Kiểm tra tự động";
  if (flag.source === "duplicate") return "So trùng tin đăng";
  return IMAGE_CODES.includes(flag.code) ? "AI xem ảnh" : "AI đọc nội dung";
};

const Spinner = () => (
  <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
);

/** Khối tóm tắt trên thẻ tin: mức rủi ro, điểm, tối đa 3 cảnh báo kèm lý do. */
export const AiReviewSummary = ({ review, running, onOpen, onRun }) => {
  if (running) {
    return (
      <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2.5 text-xs text-[#64748b] flex items-center gap-2">
        <Spinner /> AI đang phân tích tin đăng…
      </div>
    );
  }
  if (!review || review.status !== "done") {
    return (
      <div className="rounded-xl border border-dashed border-[#cbd5e1] px-3 py-2.5 text-xs text-[#64748b] flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <HiOutlineSparkles className="text-primary" />
          {review ? "Phân tích AI bị lỗi" : "Chưa có phân tích AI"}
        </span>
        <button type="button" onClick={onRun} className="font-semibold text-primary hover:underline">
          {review ? "Thử lại" : "Phân tích ngay"}
        </button>
      </div>
    );
  }

  const style = LEVEL_STYLES[review.level] || LEVEL_STYLES.low;
  const top = review.flags.slice(0, 3);
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${style.box}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-[#475569]">
          <HiOutlineSparkles className="text-primary" /> AI kiểm duyệt
        </span>
        <span className={`px-2 py-0.5 rounded-full text-[0.7rem] font-bold whitespace-nowrap ${style.badge}`}>
          {review.levelLabel} · {review.score}
        </span>
      </div>
      {top.length === 0 ? (
        <p className="mt-1.5 text-xs text-[#15803d]">Không phát hiện vấn đề nào.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {top.map((f) => (
            <li key={f.code} className="flex gap-2 text-xs leading-snug">
              <span className={`mt-1 w-2 h-2 shrink-0 rounded-full ${SEVERITY[f.severity]?.dot}`} />
              <span className="line-clamp-3">
                <b className="text-text-main">{f.label}:</b>{" "}
                <span className="text-[#475569]">{f.reason}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {review.outdated && (
        <p className="mt-2 text-xs text-[#b45309]">
          ⚠ Nội dung tin đã thay đổi sau lần phân tích này.{" "}
          <button type="button" onClick={onRun} className="font-semibold underline">
            Phân tích lại
          </button>
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <button type="button" onClick={onOpen} className="text-xs font-semibold text-primary hover:underline">
          Xem phân tích chi tiết →
        </button>
        {review.flags.length > 3 && (
          <span className="text-xs text-[#64748b]">+{review.flags.length - 3} cảnh báo khác</span>
        )}
      </div>
    </div>
  );
};

/** Hộp thoại chi tiết: toàn bộ cảnh báo kèm bằng chứng, nhận xét AI, ghi chú, lý do từ chối gợi ý. */
export const AiReviewModal = ({ property, review, running, onClose, onRun, onUseReason }) => {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const done = review?.status === "done";
  const style = LEVEL_STYLES[review?.level] || LEVEL_STYLES.low;
  const canReject = property.moderationStatus !== "rejected";

  // Portal ra body để phần tử cha có transform/filter không giam được lớp phủ fixed
  return createPortal(
    <div
      className="fixed inset-0 z-[2300] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Phân tích AI hỗ trợ kiểm duyệt"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-xl overflow-hidden"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-[#f1f5f9]">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-text-main flex items-center gap-2">
              <HiOutlineSparkles className="text-primary shrink-0" /> Phân tích AI hỗ trợ kiểm duyệt
            </h3>
            <p className="text-sm text-[#64748b] truncate">{property.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[#94a3b8] hover:bg-[#f1f5f9]"
            aria-label="Đóng"
          >
            <HiX size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {running ? (
            <div className="flex items-center gap-2 text-sm text-[#64748b]">
              <Spinner /> AI đang phân tích tin đăng, vui lòng chờ trong giây lát…
            </div>
          ) : !done ? (
            <p className="text-sm text-[#64748b]">
              {review ? "Lần phân tích gần nhất bị lỗi." : "Tin này chưa được phân tích."} Bấm "Phân tích lại" để chạy.
            </p>
          ) : (
            <>
              {review.outdated && (
                <p className="rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-2.5 text-sm text-[#92400e]">
                  ⚠ Nội dung tin đã thay đổi sau lần phân tích này. Bấm "Phân tích lại" để có kết quả mới.
                </p>
              )}
              {/* Mức rủi ro + điểm */}
              <section className={`rounded-xl border p-4 ${style.box}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className={`px-3 py-1 rounded-full text-sm font-bold ${style.badge}`}>{review.levelLabel}</span>
                  <span className="text-2xl font-extrabold text-text-main">
                    {review.score}
                    <span className="text-sm font-semibold text-[#94a3b8]">/100</span>
                  </span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-white/80 overflow-hidden">
                  <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${review.score}%` }} />
                </div>
                <p className="mt-2 text-xs text-[#64748b]">
                  Điểm = tổng điểm các cảnh báo (Cao 60 · Trung bình 25 · Thấp 10), tối đa 100. Từ 60 điểm là rủi ro cao, từ 25 điểm là rủi ro trung bình.
                </p>
                {review.ai.summary && (
                  <p className="mt-3 text-sm text-text-main">
                    <b>Nhận xét của AI:</b> {review.ai.summary}
                  </p>
                )}
              </section>

              {/* Cảnh báo */}
              <section>
                <h4 className="text-sm font-bold text-text-main mb-2">
                  Cảnh báo ({review.flags.length})
                </h4>
                {review.flags.length === 0 ? (
                  <p className="text-sm text-[#15803d]">Không phát hiện vấn đề nào.</p>
                ) : (
                  <ul className="space-y-3">
                    {review.flags.map((f) => (
                      <li key={f.code} className="rounded-xl border border-[#e2e8f0] p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[0.7rem] font-bold ${SEVERITY[f.severity]?.chip}`}>
                            {SEVERITY[f.severity]?.label}
                          </span>
                          <span className="font-semibold text-sm text-text-main">{f.label}</span>
                          <span className="ml-auto text-[0.7rem] text-[#94a3b8]">{sourceLabel(f)}</span>
                        </div>
                        <p className="mt-1.5 text-sm text-[#475569]">{f.reason}</p>
                        {f.evidence && (
                          <p className="mt-2 text-xs text-[#334155] bg-[#f8fafc] border-l-2 border-[#cbd5e1] rounded px-2.5 py-1.5 break-words">
                            {f.evidence}
                          </p>
                        )}
                        {f.relatedProperty && (
                          <Link
                            to={`/property/${f.relatedProperty}`}
                            target="_blank"
                            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                          >
                            Mở tin bị trùng <HiOutlineExternalLink size={13} />
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {review.ai.imageSummary && (
                <section>
                  <h4 className="text-sm font-bold text-text-main mb-1">
                    Ảnh AI đã xem ({review.ai.imagesChecked})
                  </h4>
                  <p className="text-sm text-[#475569]">{review.ai.imageSummary}</p>
                </section>
              )}

              {review.notes.length > 0 && (
                <section>
                  <h4 className="text-sm font-bold text-text-main mb-1">Ghi chú</h4>
                  <ul className="list-disc pl-5 space-y-0.5 text-sm text-[#64748b]">
                    {review.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </section>
              )}

              {review.suggestedReason && canReject && (
                <section className="rounded-xl border border-[#fde68a] bg-[#fffbeb] p-4">
                  <h4 className="text-sm font-bold text-[#92400e] mb-1">Lý do từ chối gợi ý</h4>
                  <p className="text-sm text-[#78350f]">{review.suggestedReason}</p>
                  <button
                    type="button"
                    onClick={() => onUseReason(review.suggestedReason)}
                    className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#d97706] hover:bg-[#b45309]"
                  >
                    Dùng lý do này để từ chối
                  </button>
                </section>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#f1f5f9] flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[#94a3b8] max-w-sm">
            Kết quả AI chỉ để tham khảo, quyết định cuối cùng thuộc về quản trị viên.
            {done && review.reviewedAt && (
              <> Phân tích lúc {new Date(review.reviewedAt).toLocaleString("vi-VN")}.</>
            )}
          </p>
          <button
            type="button"
            onClick={onRun}
            disabled={running}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border border-[#e2e8f0] text-text-main hover:border-primary hover:text-primary disabled:opacity-50"
          >
            <HiOutlineRefresh size={16} className={running ? "animate-spin" : ""} /> Phân tích lại
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
