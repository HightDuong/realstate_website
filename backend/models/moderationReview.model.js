import mongoose from "mongoose";

// Kết quả rà soát tự động một tin đăng chờ duyệt (spec mục 11.5).
// Chỉ admin xem được; buyer/seller không bao giờ nhận dữ liệu này.
// Mỗi lần phân tích tạo một bản ghi mới (giữ tối đa 5 bản gần nhất mỗi tin).

const flagSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    // rule: kiểm tra bằng code · duplicate: so trùng tin khác · ai: AI đọc nội dung / ảnh
    source: { type: String, enum: ["rule", "duplicate", "ai"], required: true },
    severity: { type: String, enum: ["high", "medium", "low"], required: true },
    label: { type: String, required: true }, // tên cảnh báo
    reason: { type: String, required: true }, // vì sao đây là vấn đề
    evidence: { type: String, default: "" }, // bằng chứng: trích đoạn, số liệu, ảnh số mấy
    relatedProperty: { type: mongoose.Schema.Types.ObjectId, ref: "Property" },
  },
  { _id: false },
);

const moderationReviewSchema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: ["running", "done", "failed"], default: "running" },
    // băm nội dung tin lúc phân tích: nội dung không đổi thì không phân tích lại
    contentHash: { type: String },
    score: { type: Number, default: 0 }, // 0–100
    level: { type: String, enum: ["low", "medium", "high"], default: "low" },
    flags: { type: [flagSchema], default: [] },
    notes: { type: [String], default: [] }, // ghi chú không tính điểm (vd không đủ dữ liệu so giá)
    suggestedReason: { type: String },
    ai: {
      status: { type: String, enum: ["done", "disabled", "error"] },
      model: { type: String },
      summary: { type: String },
      imageSummary: { type: String },
      imagesChecked: { type: Number, default: 0 },
      error: { type: String }, // chỉ để ghi log, không trả về client
      promptTokens: { type: Number },
      completionTokens: { type: Number },
    },
    durationMs: { type: Number },
    finishedAt: { type: Date }, // lúc phân tích xong ("Phân tích lúc" trên giao diện)
    // các quyết định của admin sau lần phân tích này (thêm vào, không ghi đè), để đối chiếu AI với con người
    adminDecisions: {
      type: [
        {
          _id: false,
          decision: { type: String, enum: ["approved", "rejected"] },
          at: { type: Date },
          by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

moderationReviewSchema.index({ property: 1, createdAt: -1 });

const ModerationReview = mongoose.model("ModerationReview", moderationReviewSchema);
export default ModerationReview;
