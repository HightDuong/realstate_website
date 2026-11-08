// Đánh giá "AI viết tin" (spec mục 11.6) bằng chính AI hỗ trợ kiểm duyệt (mục 11.5):
// AI viết bản nháp cho các bộ thông số mẫu → chạy bản nháp qua lớp kiểm tra bằng code + AI kiểm duyệt
// → in mức rủi ro của từng bản nháp. Mục tiêu: mọi bản nháp đạt "Rủi ro thấp", không có SĐT,
// không mâu thuẫn với thông số.
//
//   node scripts/eval-listing-writer.js
//
// Chỉ ĐỌC database (lấy ảnh mẫu và mặt bằng giá), không ghi gì. Cần OPENAI_API_KEY.
// Database: MONGODB_DB_NAME, mặc định realestate_dev.
import "dotenv/config";
import mongoose from "mongoose";
import Property from "../models/property.model.js";
import { isAiEnabled } from "../ai/openaiClient.js";
import { generateListingDraft } from "../ai/listingWriter.js";
import { reviewWithAi } from "../ai/moderationAi.js";
import { PUBLIC_VISIBILITY } from "../utils/propertyQuery.js";
import {
  checkContactInfo,
  checkPrice,
  checkPromptInjection,
  checkQuality,
  checkSpecs,
  computeRisk,
  makeFlag,
} from "../utils/moderationRules.js";
import { buildModerationDemo } from "./demo-moderation-cases.js";

const DB_NAME = process.env.MONGODB_DB_NAME || "realestate_dev";
const AMENITY_OPTIONS = ["Chỗ để xe", "Hồ bơi", "Phòng tập Gym", "An ninh 24/7", "Wifi / Internet", "Điện dự phòng", "Khu sinh hoạt chung", "Sân vườn / Cảnh quan"];
const FAMILY = { flat: "apt", apartment: "apt", studio: "apt", penthouse: "apt", house: "house", townhouse: "house", villa: "house", plot: "land", office: "biz", commercial: "biz" };
const LEVEL_LABELS = { low: "Rủi ro thấp", medium: "Rủi ro trung bình", high: "Rủi ro cao" };
// Cảnh báo về chữ do AI viết (trách nhiệm của AI viết tin). Cảnh báo về ảnh, thông số, giá đến từ dữ liệu người bán nhập.
const TEXT_CODES = ["contact_info", "prompt_injection", "scam_signal", "misleading_claim", "offensive_content", "inconsistent_info"];
const words = (s) => String(s).split(/\s+/).filter(Boolean).length;

const main = async () => {
  if (!isAiEnabled()) throw new Error("Cần OPENAI_API_KEY và AI_ENABLED khác false");
  await mongoose.connect(process.env.MONGODB_URI, { dbName: DB_NAME });
  console.log(`Database: ${mongoose.connection.name} (chỉ đọc)`);

  // bộ thông số mẫu: 8 tin mẫu + 2 tình huống của demo kiểm duyệt; ghi chú người bán = câu đầu của mô tả mẫu
  const ago = () => new Date();
  const { comparables, cases } = buildModerationDemo({ ago, MIN: 0, HOUR: 0, original: { title: "", description: "" } });
  const specs = [
    ...comparables.map((c) => ({ ...c, highlights: c.description.split(". ")[0] })),
    { ...cases[5], label: "Biệt thự Đà Lạt (thông số lạ)", highlights: "Giữa rừng thông, sân vườn trồng hoa" },
    { ...cases[1], label: "Ghi chú có SĐT/Zalo", highlights: "Hẻm xe hơi, gần chợ Bến Thành. Gọi 0909.123.456 (Zalo)" },
  ];

  const imagePool = await Property.find({ "images.0": { $exists: true }, ...PUBLIC_VISIBILITY })
    .select("images propertyType").limit(80).lean();
  const comparablesDb = await Property.find({ ...PUBLIC_VISIBILITY, price: { $gt: 0 }, areaSize: { $gt: 0 } })
    .select("price areaSize city propertyType").limit(5000).lean();

  let low = 0;
  let cleanText = 0;
  for (const [i, spec] of specs.entries()) {
    const src = imagePool.filter((p) => FAMILY[p.propertyType] === FAMILY[spec.propertyType])[i % 3] || imagePool[i];
    const images = (src?.images || []).slice(0, 2);
    const fields = {
      title: "", description: "", propertyType: spec.propertyType, price: spec.price, city: spec.city, area: spec.area,
      bhk: spec.bhk, bathrooms: spec.bathrooms, areaSize: spec.areaSize, furnishing: spec.furnishing, amenities: [],
    };
    const draft = await generateListingDraft({ mode: "create", fields, highlights: spec.highlights, amenityOptions: AMENITY_OPTIONS, images });

    // chạy bản nháp qua kiểm duyệt như một tin thật
    const listing = { ...fields, title: draft.title, description: draft.description, images, amenities: draft.suggestedAmenities };
    const flags = [
      ...checkContactInfo(listing), ...checkPromptInjection(listing), ...checkSpecs(listing), ...checkQuality(listing),
      ...checkPrice(listing, comparablesDb).flags,
    ];
    const ai = await reviewWithAi(listing, flags);
    for (const f of ai.flags) if (!flags.some((x) => x.code === f.code)) flags.push(makeFlag(f.code, { source: "ai", ...f }));
    const { score, level } = computeRisk(flags);
    if (level === "low") low++;
    const textFlags = flags.filter((f) => TEXT_CODES.includes(f.code));
    if (!textFlags.length) cleanText++;

    console.log(`\n${i + 1}. ${spec.label || spec.title}`);
    console.log(`   Tiêu đề: ${draft.title}`);
    console.log(`   Mô tả: ${words(draft.description)} từ, ${draft.description.split(/\n\n/).length} đoạn · ảnh AI xem: ${draft.imagesUsed}`);
    console.log(`   Nên bổ sung: ${draft.missingInfo.join(" | ") || "—"}`);
    console.log(`   Tiện ích gợi ý từ ảnh: ${draft.suggestedAmenities.join(", ") || "—"}`);
    console.log(`   Kiểm duyệt: ${LEVEL_LABELS[level]} · ${score} điểm${flags.length ? ` (${flags.map((f) => f.code).join(", ")})` : ""}`);
    for (const f of flags) console.log(`     - ${TEXT_CODES.includes(f.code) ? "[chữ]" : "[ảnh/thông số]"} ${f.label}: ${f.reason} | ${f.evidence}`);
    if (process.argv.includes("--verbose")) console.log(`   ---\n${draft.description.replace(/^/gm, "   ")}`);
  }
  console.log(`\n→ ${cleanText}/${specs.length} bản nháp không có cảnh báo nào về nội dung chữ (SĐT, lừa đảo, cam kết, mâu thuẫn thông số…)`);
  console.log(`→ ${low}/${specs.length} bản nháp đạt "Rủi ro thấp" tính cả cảnh báo về ảnh/thông số do người bán nhập`);
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error("EVAL_LISTING_WRITER_ERROR:", error);
  await mongoose.disconnect();
  process.exit(1);
});
