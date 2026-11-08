import Property from "../models/property.model.js";
import { PUBLIC_VISIBILITY } from "./propertyQuery.js";

// "Gợi ý nổi bật" khi người dùng chưa trò chuyện với chatbot.
// Mỗi tin đang bán được chấm điểm 0..1 theo nhiều yếu tố rồi lấy các tin cao điểm nhất,
// hạn chế trùng thành phố / loại hình để danh sách đa dạng.

const CARD_FIELDS =
  "title price city area propertyType bhk bathrooms areaSize furnishing amenities images status views createdAt isVerified description";

const WEIGHTS = {
  value: 0.35, // giá/m² so với mặt bằng cùng thành phố
  quality: 0.2, // tin đăng đầy đủ: ảnh, tiện ích, mô tả, thông số
  popularity: 0.2, // lượt xem
  recency: 0.15, // độ mới
  verified: 0.1, // đã được admin kiểm duyệt
};
const MAX_PER_GROUP = 2; // tối đa 2 tin cùng thành phố + loại hình
const DAY_MS = 24 * 60 * 60 * 1000;

const median = (nums) => {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const normCity = (c) => String(c || "").trim().toLowerCase();

// Câu giải thích ngắn cho yếu tố nổi bật nhất của tin
const describe = (factor, p, ctx) => {
  switch (factor) {
    case "value":
      return `Giá/m² thấp hơn ${ctx.discountPct}% so với mặt bằng ${ctx.scope}`;
    case "popularity":
      return `Được quan tâm nhiều (${p.views} lượt xem)`;
    case "recency": {
      const days = Math.max(1, Math.round((Date.now() - new Date(p.createdAt)) / DAY_MS));
      return `Mới đăng ${days} ngày trước`;
    }
    case "verified":
      return "Tin đã được kiểm duyệt";
    default:
      return `Tin đầy đủ: ${p.images?.length || 0} ảnh, ${p.amenities?.length || 0} tiện ích`;
  }
};

export const getFeaturedProperties = async ({ limit = 5, excludeSeller } = {}) => {
  const query = { status: "sale", ...PUBLIC_VISIBILITY };
  if (excludeSeller) query.seller = { $ne: excludeSeller };
  const candidates = await Property.find(query).select(CARD_FIELDS).limit(1000).lean();
  if (!candidates.length) return [];

  // mặt bằng giá/m²: ưu tiên cùng thành phố + loại hình (≥3 tin), không đủ thì cùng thành phố (≥2 tin)
  const ppmGroups = {};
  for (const p of candidates) {
    if (p.areaSize > 0 && p.price > 0) {
      const ppm = p.price / p.areaSize;
      (ppmGroups[`${normCity(p.city)}|${p.propertyType}`] ||= []).push(ppm);
      (ppmGroups[normCity(p.city)] ||= []).push(ppm);
    }
  }
  const benchmark = (p) => {
    const byType = ppmGroups[`${normCity(p.city)}|${p.propertyType}`];
    if (byType?.length >= 3) return { med: median(byType), scope: `${p.city} (cùng loại hình)` };
    const byCity = ppmGroups[normCity(p.city)];
    if (byCity?.length >= 2) return { med: median(byCity), scope: p.city };
    return null;
  };
  const maxViews = Math.max(1, ...candidates.map((p) => p.views || 0));

  const scored = candidates.map((p) => {
    const ctx = {};
    // 1. giá trị: rẻ hơn mặt bằng → điểm cao (rẻ hơn 30% trở lên = 1, đắt hơn 30% = 0)
    let value = 0.5;
    const bench = benchmark(p);
    if (bench && p.areaSize > 0) {
      const diff = (bench.med - p.price / p.areaSize) / bench.med;
      // lệch quá 60% so với mặt bằng → nhiều khả năng nhập sai diện tích/giá: giữ trung tính, không khen
      if (Math.abs(diff) <= 0.6) {
        value = clamp01(0.5 + diff / 0.6);
        ctx.discountPct = Math.round(diff * 100);
        ctx.scope = bench.scope;
      }
    }
    // 2. độ hoàn thiện tin
    const quality =
      clamp01((p.images?.length || 0) / 5) * 0.4 +
      clamp01((p.amenities?.length || 0) / 6) * 0.2 +
      clamp01(String(p.description || "").length / 300) * 0.2 +
      (p.areaSize && p.bhk ? 0.2 : 0);
    // 3. lượt xem (thang log để tin quá nhiều lượt không áp đảo)
    const popularity = Math.log1p(p.views || 0) / Math.log1p(maxViews);
    // 4. độ mới: giảm một nửa sau mỗi 30 ngày
    const ageDays = (Date.now() - new Date(p.createdAt)) / DAY_MS;
    const recency = Math.pow(0.5, ageDays / 30);
    // 5. đã kiểm duyệt
    const verified = p.isVerified ? 1 : 0;

    const factors = { value, quality, popularity, recency, verified };
    const score = Object.entries(WEIGHTS).reduce((sum, [k, w]) => sum + w * factors[k], 0);

    // lý do hiển thị: yếu tố đóng góp nhiều nhất và có ý nghĩa
    const candidatesReason = Object.entries(WEIGHTS)
      .map(([k, w]) => [k, w * factors[k]])
      .filter(([k]) => {
        if (k === "value") return ctx.discountPct >= 5;
        if (k === "popularity") return (p.views || 0) >= 3;
        if (k === "recency") return ageDays <= 14;
        if (k === "verified") return verified === 1;
        return true;
      })
      .sort((a, b) => b[1] - a[1]);
    const reasonFactor = candidatesReason[0]?.[0] || "quality";

    const { description, ...card } = p;
    return { property: card, score, highlight: describe(reasonFactor, p, ctx) };
  });

  scored.sort((a, b) => b.score - a.score);

  // đa dạng: tối đa MAX_PER_GROUP tin cùng (thành phố, loại hình)
  const picked = [];
  const groupCount = {};
  for (const item of scored) {
    const key = `${normCity(item.property.city)}|${item.property.propertyType}`;
    if ((groupCount[key] || 0) >= MAX_PER_GROUP) continue;
    groupCount[key] = (groupCount[key] || 0) + 1;
    picked.push(item);
    if (picked.length >= limit) break;
  }
  return picked;
};
