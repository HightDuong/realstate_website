import mongoose from "mongoose";

// Lịch sử hội thoại với chatbot tìm nhà
const aiMessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, default: "" },
    // Các tin BĐS đã hiển thị kèm câu trả lời (để vẽ lại thẻ khi mở lại hội thoại)
    propertyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Property" }],
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const aiConversationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // Mã ngẫu nhiên phía trình duyệt, chỉ dùng cho khách chưa đăng nhập
    guestId: { type: String, default: null },
    messages: [aiMessageSchema],
    // Tự xóa hội thoại không hoạt động: khách sau 7 ngày, người dùng sau 90 ngày
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

aiConversationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
aiConversationSchema.index({ user: 1, updatedAt: -1 });
aiConversationSchema.index({ guestId: 1, updatedAt: -1 });

const AiConversation = mongoose.model("AiConversation", aiConversationSchema);
export default AiConversation;
