import mongoose from "mongoose";

// Hồ sơ nhu cầu của người dùng, rút ra từ các lần chatbot tìm kiếm cho họ.
// Dùng để hiển thị "Có thể bạn quan tâm" ở trang /properties.
const userInterestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    // Mô tả nhu cầu bằng lời (do chatbot tóm tắt), vd "căn hộ yên tĩnh gần biển cho gia đình"
    query: { type: String, default: "" },
    // Bộ lọc cứng gần nhất: city, propertyType, bhk, minPrice, maxPrice...
    filters: { type: Object, default: {} },
    embedding: { type: [Number], select: false, default: undefined },
    // Phiên chat sinh ra hồ sơ này. Gợi ý chỉ dựa trên phiên hiện tại.
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "AiConversation" },
    // Tin chatbot tìm được ở lần tìm kiếm gần nhất của phiên (đã lọc theo độ liên quan, theo thứ tự)
    propertyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Property" }],
  },
  { timestamps: true },
);

const UserInterest = mongoose.model("UserInterest", userInterestSchema);
export default UserInterest;
