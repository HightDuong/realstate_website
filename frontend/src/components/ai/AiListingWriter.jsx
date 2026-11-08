import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { HiOutlineSparkles, HiX } from "react-icons/hi";
import API_URL from "../../config";
import { useAuth } from "../../context/AuthContext";
import { getFurnishingLabel, getPropertyTypeLabel } from "../../utils/propertyLabels";

// AI viết tin đăng cho người bán (spec mục 11.6), dùng chung cho AddProperty và EditProperty.
// AI chỉ soạn nháp: người bán xem, sửa, bấm "Dùng nội dung này" để điền vào form rồi tự đăng tin.

const MAX_IMAGES = 4;
const MAX_HIGHLIGHTS = 500;

// Thu nhỏ ảnh trong trình duyệt trước khi gửi (AI chỉ cần ảnh nhỏ, đỡ tốn mạng)
const resizeImage = (file, max = 768) =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], "anh.jpg", { type: "image/jpeg" }) : null),
        "image/jpeg",
        0.82,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });

const filled = (v) => v !== undefined && v !== null && String(v).trim() !== "";

const AiListingWriter = ({ formData, newImages = [], existingImages = [], amenityOptions = [], onApply }) => {
  const { token } = useAuth();
  const [quota, setQuota] = useState(null); // { enabled, limit, remaining }
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState("input"); // input | loading | result
  const [mode, setMode] = useState("create");
  const [highlights, setHighlights] = useState("");
  const [useImages, setUseImages] = useState(true);
  const [error, setError] = useState(null); // { message, limit }
  const [draft, setDraft] = useState(null);
  const [pickedAmenities, setPickedAmenities] = useState([]);

  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${API_URL}api/ai/listing-draft/quota`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => !cancelled && setQuota(res.data))
      .catch(() => !cancelled && setQuota(null));
    return () => {
      cancelled = true;
    };
  }, [token]);

  // đang chờ AI thì không cho đóng: tránh mở lại rồi gửi thêm request (mỗi request tốn một lượt)
  const loading = step === "loading";
  const close = useCallback(() => {
    if (!loading) setOpen(false);
  }, [loading]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!quota?.enabled) return null; // AI tắt → người bán tự nhập như bình thường

  const hasDescription = filled(formData.description);
  const imageCount = existingImages.length + newImages.length;
  const checklist = [
    ["Loại hình", getPropertyTypeLabel(formData.propertyType), true],
    ["Thành phố", formData.city, filled(formData.city)],
    ["Khu vực", formData.area, filled(formData.area)],
    ["Giá", formData.price && `${Number(formData.price).toLocaleString("vi-VN")} đ`, filled(formData.price)],
    ["Diện tích", formData.areaSize && `${formData.areaSize} m²`, filled(formData.areaSize)],
    ["Phòng ngủ", formData.bhk, filled(formData.bhk)],
    ["Phòng tắm", formData.bathrooms, filled(formData.bathrooms)],
    ["Nội thất", getFurnishingLabel(formData.furnishing), filled(formData.furnishing)],
    ["Ảnh", imageCount ? `${imageCount} ảnh` : "", imageCount > 0],
  ];
  const outOfQuota = quota.remaining <= 0;
  const canSubmit = filled(formData.city) && !loading && !outOfQuota;

  const openModal = () => {
    setMode(hasDescription ? "improve" : "create");
    setStep("input");
    setError(null);
    setOpen(true);
  };

  const generate = async () => {
    setStep("loading");
    setError(null);
    try {
      const data = new FormData();
      for (const key of ["title", "description", "propertyType", "price", "city", "area", "bhk", "bathrooms", "areaSize", "furnishing"]) {
        data.append(key, formData[key] ?? "");
      }
      (formData.amenities || []).forEach((a) => data.append("amenities", a));
      amenityOptions.forEach((a) => data.append("amenityOptions", a));
      data.append("mode", mode);
      data.append("highlights", highlights);
      if (useImages) {
        const existing = existingImages.slice(0, MAX_IMAGES);
        data.append("existingImages", JSON.stringify(existing));
        const files = await Promise.all(newImages.slice(0, MAX_IMAGES - existing.length).map((f) => resizeImage(f)));
        files.filter(Boolean).forEach((f) => data.append("images", f));
      }
      const res = await axios.post(`${API_URL}api/ai/listing-draft`, data, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 120_000,
      });
      setDraft(res.data.draft);
      setPickedAmenities([]);
      setQuota((q) => ({ ...q, limit: res.data.limit, remaining: res.data.remaining }));
      setStep("result");
    } catch (err) {
      const body = err.response?.data || {};
      if (body.code === "AI_LISTING_LIMIT") setQuota((q) => ({ ...q, remaining: 0 }));
      else if (typeof body.remaining === "number") setQuota((q) => ({ ...q, remaining: body.remaining }));
      const fallback = err.code === "ECONNABORTED" ? "AI phản hồi quá lâu, vui lòng thử lại." : "AI viết tin gặp sự cố, vui lòng thử lại.";
      setError({ message: body.message || fallback, limit: body.code === "AI_LISTING_LIMIT" });
      setStep("input");
    }
  };

  const apply = () => {
    onApply({ title: draft.title, description: draft.description, amenities: pickedAmenities });
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="ml-auto shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold text-primary border border-primary bg-secondary hover:bg-primary-light transition-colors"
      >
        <HiOutlineSparkles size={16} />
        {hasDescription ? "Cải thiện bằng AI" : "Viết bằng AI"}
      </button>

      {/* Portal ra body: thẻ form có hiệu ứng (transform/backdrop-filter) sẽ giam phần tử fixed bên trong */}
      {open && createPortal(
        <div
          className="fixed inset-0 z-[2300] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={close}
        >
          <div
            role="dialog"
            aria-label="AI viết tin đăng"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-xl overflow-hidden"
          >
            <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-[#f1f5f9]">
              <div>
                <h3 className="text-lg font-bold text-text-main flex items-center gap-2">
                  <HiOutlineSparkles className="text-primary" /> AI viết tin đăng
                </h3>
                <p className="text-sm text-[#64748b]">
                  Còn {quota.remaining}/{quota.limit} lượt hôm nay
                </p>
              </div>
              <button type="button" onClick={close} disabled={loading} className="p-1 rounded-lg text-[#94a3b8] hover:bg-[#f1f5f9] disabled:opacity-40" aria-label="Đóng">
                <HiX size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {(error || (outOfQuota && step === "input")) && (
                <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
                  {error?.message ||
                    "Bạn đã dùng hết lượt AI viết tin hôm nay. Vui lòng liên hệ quản trị viên để được cấp thêm lượt."}
                  {(error?.limit || (!error && outOfQuota)) && (
                    // tab mới: không rời form đang nhập (mất nội dung và ảnh đã chọn)
                    <a href="/contact" target="_blank" rel="noopener noreferrer" className="block mt-1 font-semibold underline">
                      Liên hệ quản trị viên (mở tab mới)
                    </a>
                  )}
                </div>
              )}

              {step === "loading" && (
                <div className="py-10 flex flex-col items-center gap-3 text-sm text-[#64748b]">
                  <span className="w-8 h-8 rounded-full border-[3px] border-primary border-t-transparent animate-spin" />
                  AI đang viết tin cho bạn, vui lòng chờ trong giây lát…
                </div>
              )}

              {step === "input" && (
                <>
                  <section>
                    <h4 className="text-sm font-bold text-text-main mb-2">AI sẽ dựa vào thông tin bạn đã nhập trong form</h4>
                    <div className="flex flex-wrap gap-2">
                      {checklist.map(([label, value, ok]) => (
                        <span
                          key={label}
                          className={`px-2.5 py-1 rounded-full text-xs border ${
                            ok ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]" : "border-[#e2e8f0] bg-[#f8fafc] text-[#94a3b8]"
                          }`}
                        >
                          {ok ? "✓" : "–"} {label}
                          {ok && value ? `: ${value}` : ""}
                        </span>
                      ))}
                    </div>
                    {!filled(formData.city) && (
                      <p className="mt-2 text-xs text-[#b45309]">Nhập ít nhất thành phố ở form bên dưới để AI viết tin.</p>
                    )}
                    <p className="mt-2 text-xs text-[#64748b]">Thông tin càng đầy đủ, nội dung AI viết càng chính xác.</p>
                  </section>

                  {hasDescription && (
                    <section className="flex flex-wrap gap-2">
                      {[
                        ["improve", "Cải thiện mô tả hiện tại"],
                        ["create", "Viết mới hoàn toàn"],
                      ].map(([value, label]) => (
                        <label
                          key={value}
                          className={`px-3 py-2 rounded-xl border text-sm cursor-pointer ${
                            mode === value ? "border-primary bg-secondary text-primary font-semibold" : "border-[#e2e8f0] text-text-main"
                          }`}
                        >
                          <input type="radio" name="ai-mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="sr-only" />
                          {label}
                        </label>
                      ))}
                    </section>
                  )}

                  <section>
                    <label className="block text-sm font-bold text-text-main mb-1.5">
                      Điểm nổi bật muốn nhấn mạnh <span className="font-normal text-[#94a3b8]">(không bắt buộc)</span>
                    </label>
                    <textarea
                      value={highlights}
                      onChange={(e) => setHighlights(e.target.value)}
                      maxLength={MAX_HIGHLIGHTS}
                      rows={3}
                      placeholder="VD: hẻm xe hơi, gần trường tiểu học, sổ hồng riêng, nhà mới sơn lại…"
                      className="w-full rounded-xl border border-[#e2e8f0] p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    />
                    <p className="text-right text-xs text-[#94a3b8]">
                      {highlights.length}/{MAX_HIGHLIGHTS}
                    </p>
                  </section>

                  {imageCount > 0 && (
                    <label className="flex items-center gap-2 text-sm text-text-main">
                      <input type="checkbox" checked={useImages} onChange={(e) => setUseImages(e.target.checked)} />
                      Cho AI xem ảnh để tả không gian (tối đa {MAX_IMAGES} ảnh đầu, ảnh chỉ dùng để viết, không được lưu)
                    </label>
                  )}
                </>
              )}

              {step === "result" && draft && (
                <>
                  <section>
                    <label className="block text-sm font-bold text-text-main mb-1.5">Tiêu đề</label>
                    <input
                      value={draft.title}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                      maxLength={200}
                      className="w-full rounded-xl border border-[#e2e8f0] p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    />
                  </section>
                  <section>
                    <label className="block text-sm font-bold text-text-main mb-1.5">Mô tả</label>
                    <textarea
                      value={draft.description}
                      onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                      maxLength={5000}
                      rows={10}
                      className="w-full rounded-xl border border-[#e2e8f0] p-3 text-sm leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    />
                  </section>

                  {draft.missingInfo.length > 0 && (
                    <section className="rounded-xl border border-[#fde68a] bg-[#fffbeb] p-4">
                      <h4 className="text-sm font-bold text-[#92400e] mb-1.5">Thông tin nên bổ sung</h4>
                      <ul className="list-disc pl-5 space-y-1 text-sm text-[#78350f]">
                        {draft.missingInfo.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {draft.suggestedAmenities.length > 0 && (
                    <section>
                      <h4 className="text-sm font-bold text-text-main mb-1.5">Tiện ích AI thấy trong ảnh</h4>
                      <p className="text-xs text-[#64748b] mb-2">Tick để thêm vào phần Tiện ích của tin.</p>
                      <div className="flex flex-wrap gap-2">
                        {draft.suggestedAmenities.map((a) => {
                          const on = pickedAmenities.includes(a);
                          return (
                            <label
                              key={a}
                              className={`px-3 py-1.5 rounded-full border text-xs cursor-pointer ${
                                on ? "border-primary bg-secondary text-primary font-semibold" : "border-[#e2e8f0] text-text-main"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() =>
                                  setPickedAmenities((prev) => (on ? prev.filter((x) => x !== a) : [...prev, a]))
                                }
                                className="sr-only"
                              />
                              {on ? "✓ " : "+ "}
                              {a}
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-[#f1f5f9] flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[#94a3b8] max-w-xs">
                Nội dung AI viết có thể chưa chính xác, hãy kiểm tra lại trước khi đăng. Tin vẫn được quản trị viên duyệt như bình thường.
              </p>
              <div className="flex gap-2 ml-auto">
                {step === "result" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setStep("input")}
                      className="px-4 py-2 rounded-xl text-sm font-semibold text-[#64748b] hover:bg-[#f1f5f9]"
                    >
                      Viết lại
                    </button>
                    <button
                      type="button"
                      onClick={apply}
                      disabled={!draft.title.trim() || !draft.description.trim()}
                      className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50"
                    >
                      Dùng nội dung này
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={close} disabled={loading} className="px-4 py-2 rounded-xl text-sm font-semibold text-[#64748b] hover:bg-[#f1f5f9] disabled:opacity-40">
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={generate}
                      disabled={!canSubmit}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50"
                    >
                      <HiOutlineSparkles size={16} /> {mode === "improve" ? "Cải thiện mô tả" : "Viết tin"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

export default AiListingWriter;
