import Property from "../models/property.model.js";
import { EMBEDDING_MODEL, getOpenAI, isAiEnabled } from "./openaiClient.js";

const TYPE_LABELS = {
  flat: "căn hộ chung cư",
  apartment: "căn hộ",
  villa: "biệt thự",
  house: "nhà riêng",
  studio: "căn hộ studio",
  penthouse: "penthouse",
  office: "văn phòng",
  townhouse: "nhà phố",
  plot: "đất nền, lô đất",
  commercial: "mặt bằng thương mại",
};

const FURNISHING_LABELS = {
  furnished: "nội thất đầy đủ",
  "semi-furnished": "nội thất cơ bản",
  unfurnished: "nhà trống, chưa có nội thất",
};

// Ghép các thông tin có ý nghĩa của tin đăng thành 1 đoạn văn để tạo embedding
export const buildPropertyText = (p) =>
  [
    p.title,
    `Loại hình: ${TYPE_LABELS[p.propertyType] || p.propertyType}`,
    `Vị trí: ${[p.area, p.city].filter(Boolean).join(", ")}`,
    p.bhk ? `${p.bhk} phòng ngủ` : null,
    p.bathrooms ? `${p.bathrooms} phòng tắm` : null,
    p.areaSize ? `Diện tích ${p.areaSize} m²` : null,
    p.furnishing ? FURNISHING_LABELS[p.furnishing] || p.furnishing : null,
    p.amenities?.length ? `Tiện ích: ${p.amenities.join(", ")}` : null,
    p.description ? String(p.description).slice(0, 2000) : null,
  ]
    .filter(Boolean)
    .join(". ");

// Tạo embedding cho 1 hoặc nhiều đoạn văn.
// requestOptions (tùy chọn): { timeout, maxRetries } của SDK, vd khi cần giới hạn thời gian chờ
export const embedTexts = async (texts, requestOptions) => {
  const input = texts.map((t) => String(t).slice(0, 8000));
  const res = await getOpenAI().embeddings.create(
    {
      model: EMBEDDING_MODEL,
      input,
    },
    requestOptions,
  );
  return res.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
};

export const embedText = async (text, requestOptions) => (await embedTexts([text], requestOptions))[0];

export const embedProperty = async (propertyId, requestOptions) => {
  const property = await Property.findById(propertyId).lean();
  if (!property) return;
  const embedding = await embedText(buildPropertyText(property), requestOptions);
  // updateOne để không chạm vào các trường khác và không kích hoạt validate toàn document
  await Property.updateOne(
    { _id: propertyId },
    { $set: { embedding, embeddingModel: EMBEDDING_MODEL, embeddedAt: new Date() } },
  );
};

// Gọi sau khi tạo/sửa tin: chạy nền, lỗi chỉ ghi log
export const scheduleEmbedProperty = (propertyId) => {
  if (!isAiEnabled()) return;
  embedProperty(propertyId).catch((error) =>
    console.error("EMBED_PROPERTY_ERROR:", propertyId?.toString(), error.message),
  );
};

export const cosineSimilarity = (a, b) => {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
};
