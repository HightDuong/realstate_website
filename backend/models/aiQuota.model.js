import mongoose from "mongoose";

// Đếm số câu hỏi gửi chatbot theo khóa:
//   "guest:<guestId>"        khách: tổng cộng, không reset theo ngày
//   "guestip:<ip>"           chặn khách xóa localStorage để hỏi tiếp
//   "user:<id>:<YYYY-MM-DD>" người đăng nhập: theo ngày (giới hạn chi phí)
const aiQuotaSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});

aiQuotaSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AiQuota = mongoose.model("AiQuota", aiQuotaSchema);
export default AiQuota;
