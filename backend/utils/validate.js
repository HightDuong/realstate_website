import mongoose from "mongoose";

export const isValidId = (id) =>
  typeof id === "string" && mongoose.Types.ObjectId.isValid(id) && /^[a-f0-9]{24}$/i.test(id);

// Middleware: kiểm tra các tham số /:param là ObjectId hợp lệ, tránh lỗi CastError → 500
export const validateIdParams =
  (...params) =>
  (req, res, next) => {
    for (const p of params) {
      if (!isValidId(req.params[p])) {
        return res.status(400).json({ message: "Mã định danh không hợp lệ" });
      }
    }
    next();
  };

export const isEmail = (value) =>
  typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export const normalizeEmail = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : value;

export const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const PROPERTY_TYPES = [
  "flat",
  "apartment",
  "villa",
  "house",
  "studio",
  "penthouse",
  "office",
  "townhouse",
  "plot",
  "commercial",
];
export const FURNISHING_TYPES = ["furnished", "semi-furnished", "unfurnished"];
export const PROPERTY_STATUSES = ["sale", "sold"];

const REQUIRED_PROPERTY_FIELDS = {
  title: "tiêu đề",
  description: "mô tả",
  price: "giá",
  city: "thành phố",
  area: "khu vực",
  pincode: "mã bưu chính",
  propertyType: "loại bất động sản",
};

const isBlank = (v) => v === undefined || v === null || String(v).trim() === "";

// Kiểm tra dữ liệu tin đăng (form multipart → mọi giá trị là chuỗi).
// partial = true khi cập nhật: chỉ kiểm tra các trường được gửi lên.
// Trả về chuỗi lỗi tiếng Việt, hoặc null nếu hợp lệ.
export const validatePropertyInput = (body, { partial = false } = {}) => {
  for (const [field, label] of Object.entries(REQUIRED_PROPERTY_FIELDS)) {
    const sent = body[field] !== undefined;
    if ((!partial || sent) && isBlank(body[field])) {
      return `Vui lòng nhập ${label}`;
    }
  }
  if (body.title !== undefined && String(body.title).trim().length > 200) {
    return "Tiêu đề tối đa 200 ký tự";
  }
  // giới hạn để mô tả cực dài không làm nghẽn bước so trùng của AI hỗ trợ kiểm duyệt
  if (body.description !== undefined && String(body.description).trim().length > 5000) {
    return "Mô tả tối đa 5.000 ký tự";
  }
  if (body.price !== undefined) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price <= 0) return "Giá phải là số lớn hơn 0";
  }
  for (const [field, label] of [
    ["bathrooms", "số phòng tắm"],
    ["areaSize", "diện tích"],
  ]) {
    if (!isBlank(body[field])) {
      const n = Number(body[field]);
      if (!Number.isFinite(n) || n < 0) return `${label[0].toUpperCase()}${label.slice(1)} phải là số không âm`;
    }
  }
  if (!isBlank(body.bhk) && !/^\d+\+?$/.test(String(body.bhk).trim())) {
    return "Số phòng ngủ không hợp lệ";
  }
  if (body.propertyType !== undefined && !PROPERTY_TYPES.includes(body.propertyType)) {
    return "Loại bất động sản không hợp lệ";
  }
  if (!isBlank(body.furnishing) && !FURNISHING_TYPES.includes(body.furnishing)) {
    return "Tình trạng nội thất không hợp lệ";
  }
  if (!isBlank(body.status) && !PROPERTY_STATUSES.includes(body.status)) {
    return "Trạng thái không hợp lệ";
  }
  return null;
};

// amenities từ form: mảng, chuỗi JSON hoặc chuỗi phân tách bằng dấu phẩy
export const parseAmenities = (value) => {
  if (value === undefined || value === null || value === "") return [];
  let list = value;
  if (!Array.isArray(value)) {
    try {
      list = JSON.parse(value);
    } catch {
      list = String(value).split(",");
    }
  }
  if (!Array.isArray(list)) list = [list];
  return list.map((a) => String(a).trim()).filter(Boolean).slice(0, 50);
};
