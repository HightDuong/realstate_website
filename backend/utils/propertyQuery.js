// Dựng điều kiện lọc bất động sản dùng chung cho API /api/property và chatbot AI.

// Escape ký tự đặc biệt để chuỗi người dùng nhập không phá vỡ RegExp
export const escapeRegex = (str = "") =>
  String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Nhận chuỗi "a,b" hoặc mảng ["a","b"] → mảng đã trim, bỏ phần tử rỗng
const toList = (value) => {
  if (value === undefined || value === null || value === "") return [];
  const arr = Array.isArray(value) ? value : String(value).split(",");
  return arr.map((v) => String(v).trim()).filter(Boolean);
};

const toNumber = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

// Điều kiện tin được hiển thị công khai: đã duyệt, hoặc tin cũ chưa có moderationStatus.
// Tin "pending" / "rejected" chỉ chủ tin và admin xem được.
export const PUBLIC_VISIBILITY = { moderationStatus: { $nin: ["pending", "rejected"] } };

export const isPubliclyVisible = (property) =>
  !["pending", "rejected"].includes(property?.moderationStatus);

/**
 * filters: { city, area, pincode, propertyType, bhk, furnishing, status,
 *            minPrice, maxPrice, amenities, seller }
 * Mặc định chỉ lấy tin đang bán (status: "sale") và đang hiển thị công khai.
 */
export const buildPropertyQuery = (filters = {}) => {
  const {
    city,
    area,
    pincode,
    propertyType,
    bhk,
    furnishing,
    status,
    minPrice,
    maxPrice,
    amenities,
    seller,
  } = filters;

  const query = { status: status || "sale", ...PUBLIC_VISIBILITY };

  if (seller) query.seller = seller;
  if (city) query.city = new RegExp(escapeRegex(city), "i");
  if (area) query.area = new RegExp(escapeRegex(area), "i");
  if (pincode) query.pincode = String(pincode);

  const types = toList(propertyType).map((t) => t.toLowerCase());
  if (types.length) query.propertyType = { $in: types };

  if (bhk !== undefined && bhk !== null && bhk !== "") {
    query.bhk = String(bhk) === "5+" ? { $gte: "5" } : String(bhk);
  }

  const furnishingList = toList(furnishing);
  if (furnishingList.length) {
    query.furnishing = {
      $in: furnishingList.map((f) => new RegExp(`^${escapeRegex(f)}$`, "i")),
    };
  }

  const min = toNumber(minPrice);
  const max = toNumber(maxPrice);
  if (min !== undefined || max !== undefined) {
    query.price = {};
    if (min !== undefined) query.price.$gte = min;
    if (max !== undefined) query.price.$lte = max;
  }

  const amenityList = toList(amenities);
  if (amenityList.length) query.amenities = { $in: amenityList };

  return query;
};

export const buildPropertySort = (sort) => {
  let sortOption = { createdAt: -1 };
  if (sort === "priceLow") sortOption = { price: 1 };
  if (sort === "priceHigh") sortOption = { price: -1 };
  // thêm _id để thứ tự ổn định khi nhiều tin trùng giá/ngày, tránh lặp/sót giữa các trang
  sortOption._id = -1;
  return sortOption;
};
