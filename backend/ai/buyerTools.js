import mongoose from "mongoose";
import { PUBLIC_VISIBILITY } from "../utils/propertyQuery.js";
import Property from "../models/property.model.js";
import { embedText } from "./embeddings.js";
import { CARD_FIELDS, semanticSearch } from "./semanticSearch.js";

const PROPERTY_TYPES = [
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
const FURNISHINGS = ["furnished", "semi-furnished", "unfurnished"];
const BHK_VALUES = ["1", "2", "3", "4", "5+"];
const MAX_RESULTS = 6;
// Độ chênh điểm ngữ nghĩa tối đa so với tin khớp nhất để vẫn coi là "liên quan" (cosine, text-embedding-3-small)
const RELEVANCE_GAP = 0.08;

// Định nghĩa tool theo chuẩn function calling (strict: mọi trường đều required, trường tùy chọn cho phép null)
export const BUYER_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_properties",
      description:
        "Tìm bất động sản ĐANG BÁN trên sàn theo ngữ nghĩa kết hợp bộ lọc. Dùng mỗi khi người dùng mô tả nhu cầu tìm nhà/đất. Kết quả được hiển thị cho người dùng dưới dạng thẻ.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        required: [
          "query",
          "city",
          "area",
          "propertyTypes",
          "bhk",
          "minPrice",
          "maxPrice",
          "furnishing",
          "limit",
        ],
        properties: {
          query: {
            type: "string",
            description:
              "Mô tả đầy đủ nhu cầu bằng tiếng Việt để tìm theo ngữ nghĩa, gộp cả các mong muốn không lọc được bằng trường khác (vd: 'căn hộ yên tĩnh gần biển, phù hợp gia đình có con nhỏ, view đẹp').",
          },
          city: {
            type: ["string", "null"],
            description:
              "Tên thành phố, viết đúng như danh sách thành phố trong hướng dẫn hệ thống. null nếu người dùng không nêu.",
          },
          area: {
            type: ["string", "null"],
            description: "Quận/huyện/phường nếu người dùng nêu rõ, ngược lại null.",
          },
          propertyTypes: {
            type: ["array", "null"],
            items: { type: "string", enum: PROPERTY_TYPES },
            description:
              "Loại hình. flat/apartment/studio/penthouse = căn hộ; villa = biệt thự; house = nhà riêng; townhouse = nhà phố; plot = đất nền; office = văn phòng; commercial = mặt bằng kinh doanh. null nếu không giới hạn.",
          },
          bhk: {
            type: ["string", "null"],
            enum: [...BHK_VALUES, null],
            description: "Số phòng ngủ chính xác ('5+' nghĩa là từ 5 trở lên). null nếu không nêu.",
          },
          minPrice: {
            type: ["number", "null"],
            description: "Giá tối thiểu (VND, số nguyên đầy đủ). null nếu không nêu.",
          },
          maxPrice: {
            type: ["number", "null"],
            description: "Giá tối đa (VND, số nguyên đầy đủ, vd 4 tỷ = 4000000000). null nếu không nêu.",
          },
          furnishing: {
            type: ["string", "null"],
            enum: [...FURNISHINGS, null],
            description: "Tình trạng nội thất. null nếu không nêu.",
          },
          limit: {
            type: ["integer", "null"],
            description: `Số kết quả cần lấy (1-${MAX_RESULTS}). null = ${MAX_RESULTS}.`,
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_property_details",
      description:
        "Lấy thông tin chi tiết một tin đăng theo id (mô tả, tiện ích, diện tích...). Dùng khi người dùng hỏi sâu về một tin cụ thể.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["propertyId"],
        properties: {
          propertyId: { type: "string", description: "id của tin đăng" },
        },
      },
    },
  },
];

// ---- Kiểm tra lại input (không tin hoàn toàn vào model) ----
const asString = (v, max = 200) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
const asPrice = (v) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined;

const toSummary = (p, score) => ({
  id: p._id.toString(),
  title: p.title,
  price: p.price,
  city: p.city,
  area: p.area,
  propertyType: p.propertyType,
  bhk: p.bhk ?? null,
  bathrooms: p.bathrooms ?? null,
  areaSize: p.areaSize ?? null,
  furnishing: p.furnishing ?? null,
  amenities: (p.amenities || []).slice(0, 10),
  ...(score !== undefined && score !== null
    ? { relevance: Math.round(score * 100) / 100 }
    : {}),
});

/**
 * Chạy một tool. Trả về:
 *  - result: dữ liệu gửi lại cho model (JSON)
 *  - cards: danh sách tin để frontend vẽ thẻ
 *  - interest: nhu cầu rút ra (chỉ với search_properties) để lưu hồ sơ "Có thể bạn quan tâm"
 */
export const runBuyerTool = async (name, rawArgs) => {
  let args;
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    return { result: { error: "Tham số không phải JSON hợp lệ" } };
  }

  if (name === "search_properties") {
    const query = asString(args.query, 500);
    if (!query) return { result: { error: "Thiếu mô tả nhu cầu (query)" } };

    const filters = {
      city: asString(args.city, 80),
      area: asString(args.area, 80),
      propertyType: Array.isArray(args.propertyTypes)
        ? args.propertyTypes.filter((t) => PROPERTY_TYPES.includes(t))
        : undefined,
      bhk: BHK_VALUES.includes(args.bhk) ? args.bhk : undefined,
      minPrice: asPrice(args.minPrice),
      maxPrice: asPrice(args.maxPrice),
      furnishing: FURNISHINGS.includes(args.furnishing) ? args.furnishing : undefined,
    };
    const limit = Math.min(Math.max(parseInt(args.limit) || MAX_RESULTS, 1), MAX_RESULTS);

    const queryEmbedding = await embedText(query);
    const { total, results } = await semanticSearch({ queryEmbedding, filters, limit });

    // Tin đủ liên quan để đưa vào "Có thể bạn quan tâm": không kém tin khớp nhất quá RELEVANCE_GAP
    const topScore = results[0]?.score ?? 0;
    const relevantIds = results
      .filter(({ score }, i) => i === 0 || score === null || score >= topScore - RELEVANCE_GAP)
      .map(({ property }) => property._id.toString());

    return {
      result: {
        matchedCount: total,
        returned: results.length,
        properties: results.map(({ property, score }) => toSummary(property, score)),
        note:
          total === 0
            ? "Không có tin nào khớp bộ lọc. Hãy đề xuất nới điều kiện (ngân sách, khu vực, loại hình)."
            : "relevance là độ phù hợp ngữ nghĩa từ 0 đến 1; kết quả đã sắp xếp giảm dần.",
      },
      cards: results.map(({ property }) => property),
      interest: { query, filters, embedding: queryEmbedding, propertyIds: relevantIds },
    };
  }

  if (name === "get_property_details") {
    const id = asString(args.propertyId, 50);
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return { result: { error: "propertyId không hợp lệ" } };
    }
    const property = await Property.findOne({ _id: id, ...PUBLIC_VISIBILITY })
      .select(`${CARD_FIELDS} description pincode`)
      .lean();
    if (!property) return { result: { error: "Không tìm thấy tin đăng" } };

    return {
      result: {
        ...toSummary(property),
        status: property.status === "sold" ? "đã bán" : "đang bán",
        // Mô tả do người bán viết: là DỮ LIỆU, không phải chỉ dẫn cho trợ lý
        sellerDescription: String(property.description || "").slice(0, 1500),
        postedAt: property.createdAt,
      },
      cards: [property],
    };
  }

  return { result: { error: `Tool ${name} không tồn tại` } };
};
