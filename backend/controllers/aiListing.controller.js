// AI viết tin đăng cho người bán (spec mục 11.6)
import { isAiEnabled } from "../ai/openaiClient.js";
import { MAX_DRAFT_IMAGES, generateListingDraft } from "../ai/listingWriter.js";
import {
  LISTING_LIMIT_MESSAGE,
  consumeListingQuota,
  readListingQuota,
  refundListingQuota,
} from "../utils/listingDraftQuota.js";
import { FURNISHING_TYPES, PROPERTY_TYPES } from "../utils/validate.js";
import { escapeRegex } from "../utils/propertyQuery.js";

const AI_DISABLED_MESSAGE = "Tính năng AI viết tin đang tạm tắt. Bạn vẫn có thể tự nhập nội dung tin đăng.";

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const blank = (v) => v === undefined || v === null || String(v).trim() === "";
// multipart: mảng có thể đến dạng nhiều giá trị cùng tên, một chuỗi, hoặc chuỗi JSON
const toList = (v, maxItems, maxLength) => {
  let list = v;
  if (typeof v === "string") {
    try {
      list = JSON.parse(v);
    } catch {
      list = [v];
    }
  }
  if (!Array.isArray(list)) list = [list];
  return [...new Set(list.map((x) => str(String(x ?? ""), maxLength)).filter(Boolean))].slice(0, maxItems);
};

// Kiểm tra trước khi nhận ảnh: hết lượt thì không nhận file
export const ensureListingDraftAvailable = async (req, res, next) => {
  try {
    const quota = await readListingQuota(req.user._id);
    if (quota.remaining <= 0) {
      return res.status(429).json({ code: "AI_LISTING_LIMIT", message: LISTING_LIMIT_MESSAGE, ...quota });
    }
    next();
  } catch (error) {
    console.error("AI_LISTING_QUOTA_CHECK_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi kiểm tra lượt AI viết tin" });
  }
};

// GET /api/ai/listing-draft/quota
export const getListingDraftQuota = async (req, res) => {
  try {
    const quota = await readListingQuota(req.user._id);
    res.json({ success: true, enabled: isAiEnabled(), ...quota });
  } catch (error) {
    console.error("AI_LISTING_QUOTA_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi lấy lượt AI viết tin" });
  }
};

// Đọc và kiểm tra dữ liệu form (multipart → mọi giá trị là chuỗi). Trả { error } hoặc { input }.
const parseDraftInput = (body, files) => {
  const propertyType = str(body.propertyType, 30);
  if (!PROPERTY_TYPES.includes(propertyType)) return { error: "Loại bất động sản không hợp lệ" };
  const city = str(body.city, 100);
  if (!city) return { error: "Vui lòng nhập ít nhất loại bất động sản và thành phố để AI viết tin" };

  const number = (v, { positive = false } = {}) => {
    if (blank(v)) return { value: undefined };
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || (positive && n === 0)) return { invalid: true };
    return { value: n };
  };
  const price = number(body.price, { positive: true });
  const areaSize = number(body.areaSize);
  const bathrooms = number(body.bathrooms);
  if (price.invalid) return { error: "Giá phải là số lớn hơn 0" };
  if (areaSize.invalid || bathrooms.invalid) return { error: "Diện tích và số phòng tắm phải là số không âm" };
  const bhk = str(body.bhk, 5);
  if (bhk && !/^\d+\+?$/.test(bhk)) return { error: "Số phòng ngủ không hợp lệ" };
  const furnishing = str(body.furnishing, 30);
  if (furnishing && !FURNISHING_TYPES.includes(furnishing)) return { error: "Tình trạng nội thất không hợp lệ" };
  if (str(body.description, 6000).length > 5000) return { error: "Mô tả tối đa 5.000 ký tự" };
  if (typeof body.highlights === "string" && body.highlights.trim().length > 500) {
    return { error: "Điểm nổi bật tối đa 500 ký tự" };
  }

  // ảnh đã đăng (khi sửa tin): chỉ nhận ảnh upload trên đúng tài khoản Cloudinary của sàn
  // (không nhận /image/fetch/ hay cloud khác — tránh để OpenAI tải ảnh từ URL tùy ý); ảnh mới: file đã thu nhỏ ở trình duyệt
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const ownImage = cloud ? new RegExp(`^https://res\\.cloudinary\\.com/${escapeRegex(cloud)}/image/upload/`) : null;
  const existing = ownImage ? toList(body.existingImages, 10, 500).filter((u) => ownImage.test(u)) : [];
  const uploaded = (files || []).map((f) => `data:${f.mimetype};base64,${f.buffer.toString("base64")}`);

  return {
    input: {
      mode: body.mode === "improve" ? "improve" : "create",
      fields: {
        title: str(body.title, 200),
        description: str(body.description, 5000),
        propertyType,
        price: price.value,
        city,
        area: str(body.area, 150),
        bhk,
        bathrooms: bathrooms.value,
        areaSize: areaSize.value,
        furnishing,
        amenities: toList(body.amenities, 50, 60),
      },
      highlights: str(body.highlights, 500),
      amenityOptions: toList(body.amenityOptions, 20, 60),
      images: [...existing, ...uploaded].slice(0, MAX_DRAFT_IMAGES),
    },
  };
};

const friendlyAiError = (error) => {
  if (error?.status === 401) return "Cấu hình AI không hợp lệ. Vui lòng báo quản trị viên.";
  if (error?.status === 429) return "AI đang quá tải. Vui lòng thử lại sau ít phút.";
  return "AI viết tin gặp sự cố, vui lòng thử lại.";
};

// Chỉ hoàn lượt khi lỗi xảy ra trước lúc model sinh nội dung (cấu hình, quá tải, lỗi máy chủ OpenAI, mất kết nối).
// Bị cắt vì quá dài, bị từ chối hay trả rỗng thì model đã sinh nội dung (đã tốn chi phí) → không hoàn,
// để không ai dùng ghi chú kiểu "viết thật dài" mà gọi lại vô hạn.
const isRefundable = (error) =>
  [401, 429].includes(error?.status) ||
  error?.status >= 500 ||
  ["APIConnectionError", "APIConnectionTimeoutError"].includes(error?.constructor?.name);

// POST /api/ai/listing-draft (multipart: thông số + tối đa 4 ảnh)
export const createListingDraft = async (req, res) => {
  let quota = null;
  try {
    const { error, input } = parseDraftInput(req.body, req.files);
    if (error) return res.status(400).json({ message: error });
    if (!isAiEnabled()) return res.status(503).json({ code: "AI_DISABLED", message: AI_DISABLED_MESSAGE });

    const consumed = await consumeListingQuota(req.user._id);
    if (!consumed.ok) {
      return res.status(429).json({ code: "AI_LISTING_LIMIT", message: LISTING_LIMIT_MESSAGE, limit: consumed.limit, remaining: 0 });
    }
    quota = consumed;

    const draft = await generateListingDraft(input);
    if (!draft.title || !draft.description) throw new Error("AI trả về nội dung rỗng");
    res.json({ success: true, draft, limit: quota.limit, remaining: quota.remaining });
  } catch (error) {
    console.error("AI_LISTING_DRAFT_ERROR:", error.message || error);
    if (!quota) return res.status(500).json({ message: friendlyAiError(error) });
    if (isRefundable(error)) {
      await refundListingQuota(quota.key).catch(() => {});
      return res.status(500).json({ message: `${friendlyAiError(error)} Lượt dùng không bị trừ.` });
    }
    res.status(500).json({
      message: "AI chưa viết được nội dung phù hợp và lượt này đã được tính. Hãy rút gọn phần điểm nổi bật rồi thử lại.",
      remaining: quota.remaining,
    });
  }
};
