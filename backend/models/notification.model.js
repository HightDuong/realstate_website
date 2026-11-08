import mongoose from "mongoose";

// Thông báo trong ứng dụng (chuông thông báo). Tự xóa sau 90 ngày.
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // property_approved | property_rejected | property_submitted ...
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, default: "" },
    // đường dẫn frontend khi bấm vào thông báo, vd "/my-properties"
    link: { type: String, default: "" },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true },
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;
