import mongoose from "mongoose";
import Property from "../models/property.model.js";
import { buildPropertyQuery } from "../utils/propertyQuery.js";
import { cosineSimilarity } from "./embeddings.js";

// Các trường đủ để vẽ PropertyCard và để model trả lời (không có thông tin liên hệ)
export const CARD_FIELDS =
  "title price city area propertyType bhk bathrooms areaSize furnishing amenities images status views createdAt isVerified";

// Số tin tối đa đem ra so vector trong bộ nhớ. Khi dữ liệu lớn hơn nhiều,
// chuyển sang MongoDB Atlas Vector Search thay cho cách này.
const CANDIDATE_LIMIT = 1000;

/**
 * Lọc cứng bằng bộ lọc sẵn có, rồi xếp hạng theo độ tương đồng ngữ nghĩa.
 * Không có queryEmbedding → trả theo thứ tự mới nhất.
 */
export const semanticSearch = async ({
  queryEmbedding,
  filters = {},
  limit = 6,
  excludeIds = [],
  excludeSeller,
}) => {
  const query = buildPropertyQuery(filters);

  const validExclude = excludeIds.filter((id) =>
    mongoose.Types.ObjectId.isValid(id),
  );
  if (validExclude.length) query._id = { $nin: validExclude };
  if (excludeSeller && !query.seller) query.seller = { $ne: excludeSeller };

  const candidates = await Property.find(query)
    .select(`+embedding ${CARD_FIELDS}`)
    .sort({ createdAt: -1, _id: -1 })
    .limit(CANDIDATE_LIMIT)
    .lean();

  const scored = candidates.map(({ embedding, ...property }) => ({
    property,
    score: queryEmbedding ? cosineSimilarity(queryEmbedding, embedding) : null,
  }));

  if (queryEmbedding) {
    // Tin chưa có embedding (score 0) tự xuống cuối danh sách
    scored.sort((a, b) => b.score - a.score);
  }

  return { total: candidates.length, results: scored.slice(0, limit) };
};
