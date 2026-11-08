// AI hỗ trợ admin kiểm duyệt tin (spec mục 11.5): điều phối 3 lớp kiểm tra và lưu ModerationReview.
//   Lớp 1 – quy tắc bằng code (luôn chạy, kể cả khi tắt AI)
//   Lớp 2 – so trùng với tin khác (câu chữ + embedding)
//   Lớp 3 – AI đọc nội dung và ảnh (chỉ khi bật AI)
// Kết quả chỉ để admin tham khảo: không có đường nào tự duyệt / từ chối tin.
import Property from "../models/property.model.js";
import ModerationReview from "../models/moderationReview.model.js";
import { PUBLIC_VISIBILITY, escapeRegex } from "./propertyQuery.js";
import { isAiEnabled } from "../ai/openaiClient.js";
import { cosineSimilarity, embedProperty } from "../ai/embeddings.js";
import { reviewWithAi } from "../ai/moderationAi.js";
import {
  EMBEDDING_DUPLICATE_THRESHOLD,
  TEXT_DUPLICATE_THRESHOLD,
  buildRejectionReason,
  checkContactInfo,
  checkPrice,
  checkPromptInjection,
  checkQuality,
  checkSpecs,
  computeRisk,
  duplicateFlag,
  duplicateNote,
  listingText,
  makeFlag,
  moderationContentHash,
  shingles,
  sortFlags,
  textSimilarity,
} from "./moderationRules.js";

const KEEP_REVIEWS = 5; // số bản phân tích giữ lại cho mỗi tin
// "running" quá lâu (server khởi động lại giữa chừng) → coi như lỗi. Phải lớn hơn tổng thời gian chờ tối đa
// của embedding (20s × 2 lần) + AI (40s × 2 lần, × 2 nếu phải gọi lại không kèm ảnh).
const RUNNING_TIMEOUT_MS = 5 * 60 * 1000;
const EMBED_REQUEST_OPTIONS = { timeout: 20_000, maxRetries: 1 };
const MAX_CANDIDATES = 2000;

export const LEVEL_LABELS = { low: "Rủi ro thấp", medium: "Rủi ro trung bình", high: "Rủi ro cao" };

// Tin cùng thành phố (không phân biệt hoa thường, bỏ khoảng trắng thừa) — dùng chung cho so giá và so trùng
const sameCity = (city) => new RegExp(`^\\s*${escapeRegex(String(city || "").trim())}\\s*$`, "i");

// ---------- Lớp 2: trùng lặp ----------
const findDuplicates = async (property) => {
  const candidates = await Property.find({ _id: { $ne: property._id }, city: sameCity(property.city) })
    .select("+embedding title description seller moderationStatus createdAt")
    .limit(MAX_CANDIDATES)
    .lean();

  const own = shingles(listingText(property)); // tính một lần cho tin đang xét
  const best = { same: null, other: null };
  for (const c of candidates) {
    const textSim = textSimilarity(own, listingText(c));
    const embeddingSim = cosineSimilarity(property.embedding, c.embedding);
    if (textSim < TEXT_DUPLICATE_THRESHOLD && embeddingSim < EMBEDDING_DUPLICATE_THRESHOLD) continue;
    const key = String(c.seller) === String(property.seller) ? "same" : "other";
    const strength = Math.max(textSim, embeddingSim);
    if (!best[key] || strength > best[key].strength) {
      best[key] = { property: c, textSim, embeddingSim, strength };
    }
  }

  const flags = [];
  const notes = [];
  if (best.other) {
    // người bán khác đăng trước → nghi chép tin; đăng sau → tin này mới là bản gốc
    if (new Date(best.other.property.createdAt) <= new Date(property.createdAt)) {
      flags.push(duplicateFlag(best.other, { sameSeller: false }));
    } else {
      notes.push(duplicateNote(best.other));
    }
  }
  if (best.same) flags.push(duplicateFlag(best.same, { sameSeller: true }));
  return { flags, notes };
};

// ---------- Chạy một lần phân tích ----------
const doReview = async (propertyId, force) => {
  const started = Date.now();
  let property = await Property.findById(propertyId).select("+embedding");
  if (!property) return null;

  if (!force) {
    const latest = await ModerationReview.findOne({ property: property._id }).sort({ createdAt: -1 });
    if (latest?.status === "done" && latest.contentHash === moderationContentHash(property)) return latest;
  }

  const review = await ModerationReview.create({
    property: property._id,
    seller: property.seller,
    status: "running",
    contentHash: moderationContentHash(property),
  });

  try {
    const aiOn = isAiEnabled();
    const notes = [];

    // embedding mới nhất cho nội dung hiện tại (dùng để so trùng theo ngữ nghĩa)
    if (aiOn) {
      try {
        await embedProperty(property._id, EMBED_REQUEST_OPTIONS);
      } catch (error) {
        console.error("MODERATION_EMBED_ERROR:", String(property._id), error.message);
        notes.push("Không tạo được embedding nên chỉ so trùng theo câu chữ.");
      }
    } else {
      notes.push("AI đang tắt: chỉ có kết quả kiểm tra tự động, chưa đọc ngữ nghĩa và hình ảnh.");
    }
    // đọc lại: mọi kiểm tra và mã băm dùng cùng một bản nội dung
    property = await Property.findById(property._id).select("+embedding");
    if (!property) {
      await review.deleteOne(); // tin vừa bị xóa trong lúc phân tích
      return null;
    }
    review.contentHash = moderationContentHash(property);

    // Lớp 1
    const flags = [
      ...checkContactInfo(property),
      ...checkPromptInjection(property),
      ...checkSpecs(property),
      ...checkQuality(property),
    ];
    // giá nghi nhập sai đơn vị thì không so với mặt bằng nữa (tránh tính một lỗi hai lần)
    if (!flags.some((f) => f.code === "price_unit")) {
      const comparables = await Property.find({
        _id: { $ne: property._id },
        ...PUBLIC_VISIBILITY,
        city: sameCity(property.city),
        price: { $gt: 0 },
        areaSize: { $gt: 0 },
      })
        .select("price areaSize city propertyType")
        .limit(5000)
        .lean();
      const price = checkPrice(property, comparables);
      flags.push(...price.flags);
      if (price.note) notes.push(price.note);
    }

    // Lớp 2
    const duplicates = await findDuplicates(property);
    flags.push(...duplicates.flags);
    notes.push(...duplicates.notes);

    // Lớp 3
    let ai = { status: "disabled" };
    let aiSuggestion = null;
    if (aiOn) {
      try {
        const r = await reviewWithAi(property, flags);
        const existing = new Set(flags.map((f) => f.code));
        for (const f of r.flags) {
          if (existing.has(f.code)) continue; // code đã phát hiện chính xác hơn
          const flag = makeFlag(f.code, { source: "ai", reason: f.reason, evidence: f.evidence });
          if (flag) flags.push(flag);
        }
        if (r.imageError) notes.push("AI không tải được ảnh của tin nên chỉ đọc phần văn bản.");
        if (!property.images?.length) notes.push("Tin không có ảnh để AI kiểm tra.");
        aiSuggestion = r.suggestedReason;
        ai = {
          status: "done",
          model: r.model,
          summary: r.summary,
          imageSummary: r.imageSummary,
          imagesChecked: r.imagesChecked,
          ...r.usage,
        };
      } catch (error) {
        console.error("MODERATION_AI_ERROR:", String(property._id), error.message);
        ai = { status: "error", error: String(error.message || error).slice(0, 300) };
        notes.push("AI tạm thời không phân tích được, kết quả chỉ gồm các kiểm tra tự động.");
      }
    }

    const sorted = sortFlags(flags);
    const { score, level } = computeRisk(sorted);
    Object.assign(review, {
      status: "done",
      flags: sorted,
      notes,
      score,
      level,
      ai,
      suggestedReason: sorted.length ? aiSuggestion || buildRejectionReason(sorted) : undefined,
      durationMs: Date.now() - started,
      finishedAt: new Date(),
    });
    await review.save();

    // tin bị xóa trong lúc chờ AI → không để lại bản phân tích mồ côi
    if (!(await Property.exists({ _id: property._id }))) {
      await ModerationReview.deleteMany({ property: property._id });
      return null;
    }

    // giữ lại vài bản gần nhất
    const old = await ModerationReview.find({ property: property._id })
      .sort({ createdAt: -1 })
      .skip(KEEP_REVIEWS)
      .select("_id")
      .lean();
    if (old.length) await ModerationReview.deleteMany({ _id: { $in: old.map((o) => o._id) } });
    return review;
  } catch (error) {
    console.error("MODERATION_REVIEW_ERROR:", String(propertyId), error);
    review.status = "failed";
    review.durationMs = Date.now() - started;
    review.finishedAt = new Date();
    await review.save().catch(() => {});
    return review;
  }
};

// Một tin chỉ chạy một phân tích tại một thời điểm (bộ nhớ trong, 1 instance — giống rateLimit.js).
// Có yêu cầu mới trong lúc đang chạy (seller vừa sửa tin, admin bấm "Phân tích lại") → xếp thêm đúng một lượt
// sau lượt hiện tại. Lượt sau so mã băm: nội dung đã đổi thì phân tích lại, không đổi thì dùng luôn kết quả vừa có.
const inFlight = new Map(); // propertyId → { promise, next }

const startReview = (key, force) => {
  const entry = { next: null };
  entry.promise = doReview(key, force).finally(() => {
    if (inFlight.get(key) === entry) inFlight.delete(key);
  });
  inFlight.set(key, entry);
  return entry.promise;
};

/** Phân tích tin. force = true: chạy lại kể cả khi nội dung chưa đổi (admin bấm "Phân tích lại"). */
export const runModerationReview = (propertyId, { force = false } = {}) => {
  const key = String(propertyId);
  const entry = inFlight.get(key);
  if (!entry) return startReview(key, force);
  entry.next ||= entry.promise.catch(() => {}).then(() => runModerationReview(key));
  return entry.next;
};

// Gọi sau khi tin chuyển sang chờ duyệt: chạy nền (đã gồm tạo embedding), lỗi chỉ ghi log
export const scheduleModerationReview = (propertyId) => {
  runModerationReview(propertyId).catch((error) =>
    console.error("SCHEDULE_MODERATION_REVIEW_ERROR:", String(propertyId), error.message),
  );
};

// Bản phân tích mới nhất của nhiều tin: Map<propertyId, review>
export const getLatestReviews = async (propertyIds = []) => {
  if (!propertyIds.length) return new Map();
  const rows = await ModerationReview.aggregate([
    { $match: { property: { $in: propertyIds } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$property", doc: { $first: "$$ROOT" } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.doc]));
};

export const getLatestReview = (propertyId) =>
  ModerationReview.findOne({ property: propertyId }).sort({ createdAt: -1 }).lean();

// Thêm quyết định của admin vào bản phân tích mới nhất (để đối chiếu AI với con người).
// $push để không ghi đè quyết định của vòng duyệt trước; không đổi updatedAt.
export const recordAdminDecision = async (propertyId, decision, adminId) => {
  try {
    await ModerationReview.findOneAndUpdate(
      { property: propertyId, status: "done" },
      { $push: { adminDecisions: { decision, at: new Date(), by: adminId } } },
      { sort: { createdAt: -1 }, timestamps: false },
    );
  } catch (error) {
    console.error("RECORD_ADMIN_DECISION_ERROR:", String(propertyId), error.message);
  }
};

/**
 * Dữ liệu trả cho admin (bỏ lỗi kỹ thuật, số token, mã băm).
 * property (tùy chọn): tin hiện tại, để báo kết quả đã cũ khi nội dung tin đổi sau lần phân tích.
 */
export const reviewView = (r, property) => {
  if (!r) return null;
  const stale = r.status === "running" && Date.now() - new Date(r.createdAt).getTime() > RUNNING_TIMEOUT_MS;
  const status = stale ? "failed" : r.status;
  const decisions = r.adminDecisions || [];
  return {
    _id: r._id,
    status,
    score: r.score,
    level: r.level,
    levelLabel: LEVEL_LABELS[r.level],
    flags: (r.flags || []).map((f) => ({
      code: f.code,
      source: f.source,
      severity: f.severity,
      label: f.label,
      reason: f.reason,
      evidence: f.evidence,
      relatedProperty: f.relatedProperty || null,
    })),
    notes: r.notes || [],
    suggestedReason: r.suggestedReason || null,
    ai: {
      status: r.ai?.status || null,
      model: r.ai?.model || null,
      summary: r.ai?.summary || "",
      imageSummary: r.ai?.imageSummary || "",
      imagesChecked: r.ai?.imagesChecked || 0,
    },
    outdated: Boolean(property && status === "done" && r.contentHash !== moderationContentHash(property)),
    adminDecision: decisions.length ? decisions[decisions.length - 1].decision : null,
    reviewedAt: r.finishedAt || r.updatedAt,
  };
};
