import mongoose from "mongoose";

// Ghi nhận lượt xem theo ngày: mỗi visitor chỉ tính 1 lượt / BĐS / ngày.
// Dùng cho thống kê "được quan tâm hôm nay" của seller.
const propertyViewSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property",
    required: true,
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  visitorId: { type: String, required: true },
  // Ngày theo giờ Việt Nam, dạng "YYYY-MM-DD"
  date: { type: String, required: true },
  // Tự xóa sau 35 ngày để collection không phình to
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 35 },
});

propertyViewSchema.index(
  { property: 1, visitorId: 1, date: 1 },
  { unique: true },
);
propertyViewSchema.index({ seller: 1, date: 1 });

const PropertyView = mongoose.model("PropertyView", propertyViewSchema);
export default PropertyView;
