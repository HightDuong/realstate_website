// Lớp 1 + một phần lớp 2 của AI hỗ trợ kiểm duyệt (spec mục 11.5): các kiểm tra bằng code.
// Toàn hàm thuần (không gọi DB / OpenAI) để dễ kiểm thử và luôn chạy được kể cả khi tắt AI.
import crypto from "node:crypto";

// ---------- Danh mục cảnh báo ----------
// Mức độ do code quyết định theo mã cảnh báo; AI chỉ báo mã + lý do + bằng chứng, không tự chấm điểm.
export const FLAG_DEFS = {
  // kiểm tra bằng code
  contact_info: {
    severity: "medium",
    label: "Có thông tin liên hệ ngoài sàn",
    rejectText: "xóa số điện thoại/Zalo/liên kết khỏi tin, người mua sẽ liên hệ qua chat hoặc yêu cầu tư vấn trên sàn",
  },
  price_too_low: {
    severity: "high",
    label: "Giá rẻ bất thường",
    rejectText: "kiểm tra lại giá và diện tích, giá đăng đang thấp bất thường so với mặt bằng khu vực",
  },
  price_too_high: {
    severity: "low",
    label: "Giá cao bất thường",
    rejectText: "kiểm tra lại giá và diện tích, giá/m² đang cao bất thường so với mặt bằng khu vực",
  },
  price_unit: {
    severity: "medium",
    label: "Giá có thể nhập sai đơn vị",
    rejectText: "kiểm tra lại giá (giá tính bằng đồng, ví dụ 3,5 tỷ = 3500000000)",
  },
  implausible_specs: {
    severity: "medium",
    label: "Thông số không hợp lý",
    rejectText: "kiểm tra lại số phòng và diện tích",
  },
  low_quality: {
    severity: "low",
    label: "Tin đăng sơ sài",
    rejectText: "bổ sung ít nhất 2 ảnh thực tế và mô tả chi tiết hơn (vị trí, pháp lý, hiện trạng)",
  },
  prompt_injection: {
    severity: "high",
    label: "Nội dung cố tình điều khiển hệ thống kiểm duyệt",
    rejectText: "xóa các nội dung không liên quan đến bất động sản khỏi mô tả",
  },
  // so trùng
  duplicate_other_seller: {
    severity: "high",
    label: "Trùng nội dung với tin của người bán khác",
    rejectText: "nội dung trùng với một tin đăng khác trên sàn, vui lòng dùng mô tả và hình ảnh của chính bất động sản bạn bán",
  },
  duplicate_same_seller: {
    severity: "medium",
    label: "Đăng lặp tin đã có",
    rejectText: "tin trùng với một tin bạn đã đăng, vui lòng cập nhật tin cũ thay vì đăng lại",
  },
  // AI đọc nội dung và ảnh
  scam_signal: {
    severity: "high",
    label: "Dấu hiệu lừa đảo",
    rejectText: "không yêu cầu người mua chuyển tiền hoặc đặt cọc trước khi xem nhà",
  },
  inconsistent_info: {
    severity: "medium",
    label: "Mô tả mâu thuẫn với thông số",
    rejectText: "sửa mô tả cho khớp với thông số đã nhập (số phòng, diện tích, vị trí, nội thất)",
  },
  misleading_claim: {
    severity: "low",
    label: "Cam kết thiếu căn cứ",
    rejectText: "bỏ các cam kết khó kiểm chứng (lợi nhuận, tăng giá…)",
  },
  offensive_content: {
    severity: "high",
    label: "Ngôn từ không phù hợp",
    rejectText: "bỏ các từ ngữ không phù hợp khỏi tin đăng",
  },
  non_property_image: {
    severity: "medium",
    label: "Ảnh không phải bất động sản",
    rejectText: "thay bằng ảnh chụp thực tế của bất động sản",
  },
  image_contact_info: {
    severity: "medium",
    label: "Ảnh chứa thông tin liên hệ hoặc quảng cáo",
    rejectText: "dùng ảnh không chèn số điện thoại, mã QR hay logo của đơn vị khác",
  },
  image_mismatch: {
    severity: "low",
    label: "Ảnh không khớp loại bất động sản",
    rejectText: "dùng ảnh đúng với loại bất động sản đang bán",
  },
};

// Các mã AI được phép trả về (các mã còn lại do code tự kiểm tra chính xác hơn)
export const AI_FLAG_CODES = [
  "scam_signal",
  "inconsistent_info",
  "misleading_claim",
  "offensive_content",
  "prompt_injection",
  "non_property_image",
  "image_contact_info",
  "image_mismatch",
];

// Điểm theo mức; mức rủi ro suy ra từ tổng điểm nên một cảnh báo Cao luôn cho kết quả "Rủi ro cao"
export const SEVERITY_POINTS = { high: 60, medium: 25, low: 10 };
const SEVERITY_RANK = { high: 3, medium: 2, low: 1 };

export const makeFlag = (code, { source = "rule", reason, evidence = "", relatedProperty } = {}) => {
  const def = FLAG_DEFS[code];
  if (!def) return null;
  return {
    code,
    source,
    severity: def.severity,
    label: def.label,
    reason: String(reason || def.label).slice(0, 400),
    evidence: String(evidence || "").slice(0, 300),
    ...(relatedProperty ? { relatedProperty } : {}),
  };
};

export const computeRisk = (flags = []) => {
  const score = Math.min(
    100,
    flags.reduce((sum, f) => sum + (SEVERITY_POINTS[f.severity] || 0), 0),
  );
  const level = score >= 60 ? "high" : score >= 25 ? "medium" : "low";
  return { score, level };
};

export const sortFlags = (flags) =>
  [...flags].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);

// ---------- Tiện ích văn bản ----------
// Chữ thường + bỏ dấu để so khớp từ khóa tiếng Việt (kể cả khi người đăng gõ không dấu)
export const normalizeText = (s = "") =>
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");

const unique = (list) => [...new Set(list)];
const quote = (list, max = 4) => list.slice(0, max).map((s) => `"${s.trim()}"`).join(", ");

export const formatVnd = (n) => {
  if (!Number.isFinite(n)) return "";
  if (n >= 1e9) return `${(n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`;
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} triệu`;
  return `${n.toLocaleString("vi-VN")} đồng`;
};
const formatPpm = (ppm) =>
  `${(ppm / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} triệu/m²`;

// Nhãn ngắn dùng trong câu giải thích (frontend có bản đầy đủ trong utils/propertyLabels.js)
const TYPE_LABELS = {
  flat: "căn hộ chung cư",
  apartment: "căn hộ",
  villa: "biệt thự",
  house: "nhà riêng",
  studio: "căn hộ studio",
  penthouse: "penthouse",
  office: "văn phòng",
  townhouse: "nhà phố",
  plot: "đất nền",
  commercial: "mặt bằng thương mại",
};
export const typeLabel = (t) => TYPE_LABELS[t] || t || "bất động sản";

// ---------- Thông tin liên hệ ----------
// Số di động/cố định VN: 0xxxxxxxxx (10–11 số), +84…, "(028) …", "(+84) …"; cho phép cách bằng dấu cách, chấm, gạch.
// Đầu "84" không có "+" phải có dấu cách/chấm/gạch ngay sau, để không nhầm giá như 84500000000 đồng.
const PHONE_RE = /(?<!\d)(?:\(\+?84\)|\+84|\(0\d{1,3}\)|0|84(?=[\s.-]))(?:[\s.-]?\d){6,10}(?!\d)/g;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
// Tên miền phải đứng riêng (không dính vào chữ tiếng Việt phía trước/sau) và có ít nhất 1 chữ cái:
// tránh bắt nhầm "nhà ga.Metro", "rộng.Combo", "5.200.000.000.VNĐ"
const URL_RE =
  /(?:https?:\/\/|www\.)\S+|(?<![\p{L}\p{N}.@-])[a-z0-9-]*[a-z][a-z0-9-]*\.(?:com|vn|net|org|info|me|link|xyz)(?:\.vn)?(?:\/\S*)?(?![\p{L}\p{N}-])/giu;
const SOCIAL_RE = /\b(zalo|facebook|fb|messenger|telegram|viber|whatsapp|tiktok)\b/g;

const isVnPhone = (match) => {
  const d = match.replace(/\D/g, "");
  if (d.startsWith("84")) return d.length === 11 || d.length === 12;
  return d.startsWith("0") && (d.length === 10 || d.length === 11);
};

// Mọi ô chữ người bán tự nhập (khu vực và tiện ích cũng là ô tự do, hiển thị công khai)
export const sellerText = (p) =>
  [p.title, p.description, p.area, ...(p.amenities || [])].filter(Boolean).join("\n");

export const findContactInfo = (text = "") => {
  const s = String(text);
  const phones = unique((s.match(PHONE_RE) || []).filter(isVnPhone));
  const emails = unique(s.match(EMAIL_RE) || []);
  const withoutEmails = s.replace(EMAIL_RE, " ");
  const links = unique(withoutEmails.match(URL_RE) || []);
  const socials = unique(normalizeText(s).match(SOCIAL_RE) || []);
  return { phones, emails, links, socials };
};

// Che thông tin liên hệ trước khi gửi nội dung cho AI (spec 11.1, nguyên tắc 5)
export const maskContactInfo = (text = "") =>
  String(text)
    .replace(EMAIL_RE, "[EMAIL]")
    .replace(URL_RE, "[LINK]")
    .replace(PHONE_RE, (m) => (isVnPhone(m) ? "[SĐT]" : m));

// Xóa hẳn thông tin liên hệ (dùng cho nội dung AI viết hộ người bán): SĐT, email, link, tên mạng xã hội.
// Giữ nguyên xuống dòng để không phá các đoạn của mô tả.
export const stripContactInfo = (text = "") =>
  maskContactInfo(text)
    .replace(/\[(SĐT|EMAIL|LINK)\]/g, "")
    .replace(/\b(zalo|facebook|fb|messenger|telegram|viber|whatsapp|tiktok)\b/gi, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.;:!?)])/g, "$1").replace(/\(\s*\)/g, "").trim())
    .join("\n");

export const checkContactInfo = (property) => {
  const { phones, emails, links, socials } = findContactInfo(sellerText(property));
  const kinds = [];
  if (phones.length) kinds.push("số điện thoại");
  if (socials.length) kinds.push(`tài khoản mạng xã hội (${socials.map((x) => x[0].toUpperCase() + x.slice(1)).join(", ")})`);
  if (emails.length) kinds.push("email");
  if (links.length) kinds.push("liên kết ngoài");
  if (!kinds.length) return [];
  return [
    makeFlag("contact_info", {
      reason: `Tin đăng ghi ${kinds.join(", ")}. Theo quy định của sàn, người mua liên hệ qua chat hoặc yêu cầu tư vấn, không ghi thông tin liên hệ trong tin.`,
      evidence: `Tìm thấy: ${quote([...phones, ...emails, ...links, ...socials])}`,
    }),
  ];
};

// ---------- Câu lệnh nhắm vào AI (prompt injection) ----------
// Viết chặt để tránh bắt nhầm câu quảng cáo bình thường như "khu vực được đánh giá an toàn",
// "đừng bỏ qua cơ hội… chúng tôi hướng dẫn thủ tục", "nhà thông minh với hệ thống AI… an toàn tuyệt đối"
const INJECTION_PATTERNS = [
  // "bỏ qua (mọi/tất cả…) hướng dẫn": tân ngữ phải đi liền sau động từ
  /\b(bo qua|phot lo|ignore|disregard)\s+(?:(?:het|moi|tat ca|cac|nhung|toan bo|all|any|the|previous|prior|above)\s+){0,3}(huong dan|chi dan|chi thi|quy tac|instructions?|prompts?|rules?)\b/,
  /\b(system prompt|developer message|prompt he thong)\b/,
  // câu mệnh lệnh yêu cầu chấm chính tin này là an toàn
  /\b(hay|phai|vui long)\b.{0,60}\b(danh gia|cham|xep|ket luan|duyet)\b.{0,20}\b(tin nay|bai nay|tin dang nay)\b.{0,40}\b(an toan|hop le|khong vi pham|rui ro thap|0 diem)\b/,
  // gọi thẳng AI / hệ thống kiểm duyệt rồi yêu cầu chấm tin này
  /\b(he thong ai|ai kiem duyet|tri tue nhan tao|chatbot|he thong kiem duyet|kiem duyet vien|gpt|openai)\b.{0,60}\b(danh gia|cham|xep|ket luan|duyet)\b.{0,20}\b(tin nay|bai nay|tin dang nay)\b/,
];

export const checkPromptInjection = (property) => {
  const original = sellerText(property);
  const text = normalizeText(original);
  for (const re of INJECTION_PATTERNS) {
    const m = text.match(re);
    if (m) {
      // trích đúng đoạn gốc (có dấu) tương ứng — bỏ dấu giữ nguyên độ dài chuỗi với tiếng Việt dựng sẵn
      const start = Math.max(0, m.index - 10);
      const snippet = original.normalize("NFC").slice(start, m.index + m[0].length + 10);
      return [
        makeFlag("prompt_injection", {
          reason: "Mô tả chứa câu ra lệnh cho hệ thống AI kiểm duyệt (ví dụ yêu cầu bỏ qua hướng dẫn hoặc tự chấm tin là an toàn). Đây là dấu hiệu cố tình lách kiểm duyệt.",
          evidence: `"…${snippet.trim()}…"`,
        }),
      ];
    }
  }
  return [];
};

// ---------- Thông số và chất lượng tin ----------
const NO_BEDROOM_TYPES = ["plot", "office", "commercial"];
const MIN_M2_PER_BEDROOM = 8;
const MIN_PRICE = 100_000_000; // dưới 100 triệu: gần như chắc chắn nhập sai đơn vị
const MIN_IMAGES = 2;
const MIN_DESCRIPTION = 100;

export const checkSpecs = (property) => {
  const flags = [];
  const bhk = parseInt(property.bhk, 10);
  const area = Number(property.areaSize);
  if (!NO_BEDROOM_TYPES.includes(property.propertyType) && bhk > 0 && area > 0 && area / bhk < MIN_M2_PER_BEDROOM) {
    flags.push(
      makeFlag("implausible_specs", {
        reason: `${bhk} phòng ngủ trên tổng diện tích ${area} m² (khoảng ${(area / bhk).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} m²/phòng) là không thực tế. Có thể nhập sai số phòng hoặc diện tích.`,
        evidence: `Số phòng ngủ: ${property.bhk} · Diện tích: ${area} m²`,
      }),
    );
  }
  const price = Number(property.price);
  if (price > 0 && price < MIN_PRICE) {
    flags.push(
      makeFlag("price_unit", {
        reason: `Giá ${formatVnd(price)} quá thấp đối với bất động sản rao bán, nhiều khả năng người bán nhập thiếu số 0 hoặc nhầm đơn vị.`,
        evidence: `Giá đã nhập: ${price.toLocaleString("vi-VN")} đồng`,
      }),
    );
  }
  return flags;
};

export const checkQuality = (property) => {
  const images = property.images?.length || 0;
  const descLength = String(property.description || "").trim().length;
  const problems = [];
  if (images < MIN_IMAGES) problems.push(images ? `chỉ có ${images} ảnh` : "không có ảnh");
  if (descLength < MIN_DESCRIPTION) problems.push(`mô tả chỉ có ${descLength} ký tự`);
  if (!problems.length) return [];
  return [
    makeFlag("low_quality", {
      reason: `Tin ${problems.join(" và ")}, người mua khó đánh giá được bất động sản. Tin sơ sài cũng thường là tin đăng thử hoặc tin không có thật.`,
      evidence: `${images} ảnh · mô tả ${descLength} ký tự (khuyến nghị ≥ ${MIN_IMAGES} ảnh, ≥ ${MIN_DESCRIPTION} ký tự)`,
    }),
  ];
};

// ---------- Giá so với mặt bằng ----------
// Không đủ tin cùng loại thì so với nhóm loại hình gần nhau trong cùng thành phố
const TYPE_FAMILY = {
  flat: "apartment",
  apartment: "apartment",
  studio: "apartment",
  penthouse: "apartment",
  house: "house",
  townhouse: "house",
  villa: "house",
  plot: "land",
  office: "commercial",
  commercial: "commercial",
};
const FAMILY_LABELS = {
  apartment: "căn hộ các loại",
  house: "nhà ở (nhà riêng, nhà phố, biệt thự)",
  land: "đất nền",
  commercial: "văn phòng, mặt bằng",
};
export const MIN_COMPARABLES = 3;
const LOW_PRICE_DIFF = -0.5; // rẻ hơn 50% mặt bằng → nghi tin "mồi"
const HIGH_PRICE_DIFF = 1.0; // đắt gấp đôi mặt bằng → nghi nhập sai

const normCity = (c) => normalizeText(c).trim();
export const median = (nums) => {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// comparables: các tin đang hiển thị công khai [{ price, areaSize, city, propertyType }]
export const findPriceBenchmark = (property, comparables = []) => {
  const city = normCity(property.city);
  const ppms = (filter) =>
    comparables
      .filter((c) => c.areaSize > 0 && c.price > 0 && normCity(c.city) === city && filter(c))
      .map((c) => c.price / c.areaSize);

  const sameType = ppms((c) => c.propertyType === property.propertyType);
  if (sameType.length >= MIN_COMPARABLES) {
    return { median: median(sameType), count: sameType.length, scope: `${typeLabel(property.propertyType)} ở ${property.city}` };
  }
  const family = TYPE_FAMILY[property.propertyType];
  const sameFamily = ppms((c) => TYPE_FAMILY[c.propertyType] === family);
  if (family && sameFamily.length >= MIN_COMPARABLES) {
    return { median: median(sameFamily), count: sameFamily.length, scope: `${FAMILY_LABELS[family]} ở ${property.city}` };
  }
  return null;
};

// Trả về { flags, note }: note là ghi chú khi không so sánh được (không tính điểm)
export const checkPrice = (property, comparables = []) => {
  const price = Number(property.price);
  const area = Number(property.areaSize);
  if (!(price > 0) || !(area > 0)) {
    return { flags: [], note: "Tin chưa có diện tích nên không so sánh được giá/m² với mặt bằng." };
  }
  const bench = findPriceBenchmark(property, comparables);
  if (!bench) {
    return {
      flags: [],
      note: `Chưa đủ ${MIN_COMPARABLES} tin tương tự ở ${property.city} để so sánh giá/m².`,
    };
  }
  const ppm = price / area;
  const diff = (ppm - bench.median) / bench.median;
  const evidence = `Tin này: ${formatPpm(ppm)} (${formatVnd(price)} / ${area} m²) · Trung vị: ${formatPpm(bench.median)} (${bench.count} tin ${bench.scope})`;
  if (diff <= LOW_PRICE_DIFF) {
    return {
      flags: [
        makeFlag("price_too_low", {
          reason: `Giá/m² thấp hơn ${Math.round(-diff * 100)}% so với mặt bằng. Đây là dấu hiệu thường gặp của tin "mồi" giá rẻ để dụ khách liên hệ, hoặc tin nhập sai giá/diện tích.`,
          evidence,
        }),
      ],
      note: null,
    };
  }
  if (diff >= HIGH_PRICE_DIFF) {
    return {
      flags: [
        makeFlag("price_too_high", {
          reason: `Giá/m² cao gấp ${(1 + diff).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} lần mặt bằng. Có thể người bán nhập sai giá hoặc diện tích.`,
          evidence,
        }),
      ],
      note: null,
    };
  }
  return {
    flags: [],
    note: `Giá/m² ${diff >= 0 ? "cao" : "thấp"} hơn ${Math.abs(Math.round(diff * 100))}% so với trung vị ${formatPpm(bench.median)} (${bench.count} tin ${bench.scope}), trong ngưỡng bình thường.`,
  };
};

// ---------- Trùng lặp ----------
export const EMBEDDING_DUPLICATE_THRESHOLD = 0.92; // dữ liệu thật: 2 tin khác nhau giống nhau tối đa ~0,83
export const TEXT_DUPLICATE_THRESHOLD = 0.6;

// Cắt độ dài để một mô tả cực dài không làm nghẽn vòng so trùng (chạy đồng bộ trên hàng nghìn tin)
const MAX_COMPARE_LENGTH = 5000;
export const listingText = (p) => `${p.title || ""}. ${p.description || ""}`.slice(0, MAX_COMPARE_LENGTH);

// Tập cụm 3 từ liên tiếp (đã bỏ dấu, bỏ ký tự đặc biệt)
export const shingles = (text, n = 3) => {
  const words = normalizeText(text).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const set = new Set();
  for (let i = 0; i + n <= words.length; i++) set.add(words.slice(i, i + n).join(" "));
  return set;
};

// Độ trùng câu chữ (Jaccard trên cụm 3 từ), 0..1. Nhận chuỗi hoặc tập cụm từ đã tính sẵn.
export const textSimilarity = (a, b) => {
  const A = a instanceof Set ? a : shingles(a);
  const B = b instanceof Set ? b : shingles(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
};

const describeMatch = (match) => {
  const byText = match.textSim >= TEXT_DUPLICATE_THRESHOLD;
  const pct = Math.round((byText ? match.textSim : match.embeddingSim) * 100);
  return byText ? `trùng ${pct}% câu chữ` : `giống ${pct}% về nội dung (so khớp ngữ nghĩa)`;
};

// Tin của người bán khác nhưng đăng SAU tin này: tin này nhiều khả năng là bản gốc → chỉ ghi chú, không trừ điểm
export const duplicateNote = (match) =>
  `Tin "${match.property.title}" của người bán khác (đăng sau tin này) ${describeMatch(match)}. Có thể tin này đã bị người khác sao chép.`;

// match: { property, textSim, embeddingSim }
export const duplicateFlag = (match, { sameSeller }) => {
  const other = match.property;
  const how = describeMatch(match);
  const otherStatus =
    other.moderationStatus === "rejected" ? " (tin đó đã bị từ chối)" : other.moderationStatus === "pending" ? " (tin đó đang chờ duyệt)" : "";
  return makeFlag(sameSeller ? "duplicate_same_seller" : "duplicate_other_seller", {
    source: "duplicate",
    reason: sameSeller
      ? `Tin ${how} với một tin khác của chính người bán này${otherStatus}. Đăng lặp làm loãng kết quả tìm kiếm.`
      : `Tin ${how} với tin của một người bán khác, đăng trước tin này${otherStatus}. Có thể tin bị sao chép từ người khác.`,
    evidence: `Tin trùng: "${other.title}"`,
    relatedProperty: other._id,
  });
};

// ---------- Lý do từ chối gợi ý (dùng khi AI tắt hoặc lỗi) ----------
export const buildRejectionReason = (flags = []) => {
  const texts = unique(sortFlags(flags).map((f) => FLAG_DEFS[f.code]?.rejectText).filter(Boolean));
  if (!texts.length) return null;
  const body = texts.map((t, i) => `(${i + 1}) ${t}`).join("; ");
  const reason = `Tin đăng chưa đạt yêu cầu, bạn vui lòng chỉnh sửa: ${body}.`;
  return reason.length > 480 ? `${reason.slice(0, 477)}…` : reason;
};

// Băm các trường ảnh hưởng tới kết quả kiểm duyệt: nội dung không đổi thì không phân tích lại
export const moderationContentHash = (p) =>
  crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        p.title, p.description, p.price, p.areaSize, p.bhk, p.bathrooms,
        p.city, p.area, p.propertyType, p.furnishing, p.amenities || [], p.images || [],
      ]),
    )
    .digest("hex");
