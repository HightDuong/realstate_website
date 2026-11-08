// Hạn mức "AI viết tin" của người bán (spec mục 11.6): 20 lượt/ngày (giờ Việt Nam) + lượt admin cấp thêm trong ngày.
// Dùng collection AiQuota sẵn có:
//   "listing:<userId>:<YYYY-MM-DD>"       số lượt đã dùng
//   "listingbonus:<userId>:<YYYY-MM-DD>"  số lượt admin cấp thêm
import AiQuota from "../models/aiQuota.model.js";

export const LISTING_DRAFT_DAILY_LIMIT = 20;
export const LISTING_DRAFT_GRANT = 20; // mỗi lần admin bấm "cấp thêm"
const TTL_MS = 2 * 24 * 60 * 60 * 1000;

const todayVN = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const usedKey = (userId, day = todayVN()) => `listing:${userId}:${day}`;
const bonusKey = (userId, day = todayVN()) => `listingbonus:${userId}:${day}`;

const bump = (key, delta) =>
  AiQuota.findOneAndUpdate(
    { key },
    { $inc: { count: delta }, $setOnInsert: { expiresAt: new Date(Date.now() + TTL_MS) } },
    { upsert: true, returnDocument: "after" },
  );

export const readListingQuota = async (userId, day = todayVN()) => {
  const used = usedKey(userId, day);
  const bonus = bonusKey(userId, day);
  const docs = await AiQuota.find({ key: { $in: [used, bonus] } }).select("key count").lean();
  const count = (key) => docs.find((d) => d.key === key)?.count || 0;
  const limit = LISTING_DRAFT_DAILY_LIMIT + count(bonus);
  return { limit, used: count(used), remaining: Math.max(limit - count(used), 0) };
};

// Trừ một lượt. Tăng trước rồi mới so với hạn mức để hai request đồng thời không cùng lọt qua.
// Trả về `key` để hoàn lượt đúng ngày đã trừ (request có thể kéo dài qua nửa đêm).
export const consumeListingQuota = async (userId) => {
  const day = todayVN();
  const key = usedKey(userId, day);
  const doc = await bump(key, 1);
  const { limit } = await readListingQuota(userId, day);
  if (doc.count > limit) {
    await bump(key, -1);
    return { ok: false, limit, remaining: 0, key };
  }
  return { ok: true, limit, remaining: limit - doc.count, key };
};

// Hoàn lượt khi AI lỗi trước khi sinh nội dung (người bán không nhận được bản nháp)
export const refundListingQuota = (key) => bump(key, -1);

export const grantListingQuota = async (userId, amount = LISTING_DRAFT_GRANT) => {
  await bump(bonusKey(userId), amount);
  return readListingQuota(userId);
};

export const LISTING_LIMIT_MESSAGE =
  "Bạn đã dùng hết lượt AI viết tin hôm nay. Vui lòng liên hệ quản trị viên để được cấp thêm lượt.";
