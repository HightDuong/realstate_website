import mongoose from "mongoose";

const propertySchema = new mongoose.Schema({
    
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    city: {
      type: String,
      required: true,
    },
    area: {
      type: String,
      required: true,
    },
    pincode: {
      type: String,
      required: true,
    },
    propertyType: {
      type: String,
      enum: [
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
      ],
      required: true,
    },
    bhk: {
      type: String,
    },
    bathrooms: {
      type: Number,
    },
    areaSize: {
      type: Number,
    },
    furnishing: {
      type: String,
      enum: ["furnished", "semi-furnished", "unfurnished"],
    },
    amenities: [
      {
        type: String,
      },
    ],
    status: {
      type: String,
      enum: ["sale", "sold"],
      default: "sale",
    },
    images: [{ type: String }],
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Đồng bộ với moderationStatus === "approved" (nhãn "Đã kiểm duyệt" trên thẻ BĐS)
    isVerified: {
      type: Boolean,
      default: false,
    },
    // Kiểm duyệt tin: pending (chờ duyệt, ẩn khỏi trang công khai) | approved | rejected.
    // Không có default: tin cũ (tạo trước khi có kiểm duyệt) không có field này và vẫn hiển thị công khai.
    moderationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
    },
    rejectionReason: { type: String },
    moderatedAt: { type: Date },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    views: {
      type: Number,
      default: 0,
    },
    // IP / id người đã xem (đếm lượt xem duy nhất). select: false → không bao giờ trả về client.
    viewedBy: { type: [String], select: false },
    // Vector ngữ nghĩa (OpenAI text-embedding-3-small) cho chatbot tìm nhà.
    // select: false → không bao giờ gửi về client, chỉ lấy khi gọi .select("+embedding")
    embedding: { type: [Number], select: false, default: undefined },
    embeddingModel: { type: String, select: false },
    embeddedAt: { type: Date, select: false },
 
},{ timestamps: true });

const Property = mongoose.model("Property", propertySchema);
export default Property;