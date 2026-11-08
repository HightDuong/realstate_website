import cloudinary from "../config/cloudinary.js";
import Property from "../models/property.model.js";
import Wishlist from "../models/wishlist.model.js";
import Inquiry from "../models/inquiry.model.js";
import PropertyView from "../models/propertyView.model.js";
import ModerationReview from "../models/moderationReview.model.js";

// ".../image/upload/v1793129456/properties/abc123.jpg" → "properties/abc123"
// (đúng với mọi folder, kể cả ảnh cũ nằm trong "general")
export const getCloudinaryPublicId = (url) => {
  const match = String(url || "").match(/\/upload\/(?:[^/]+\/)*?v\d+\/(.+?)(?:\.[a-z0-9]+)?$/i);
  return match ? match[1] : null;
};

// Xóa ảnh trên Cloudinary; lỗi từng ảnh chỉ ghi log, không làm hỏng thao tác chính
export const destroyImages = async (urls = []) => {
  await Promise.all(
    urls.map(async (url) => {
      const publicId = getCloudinaryPublicId(url);
      if (!publicId) return;
      try {
        // invalidate: xóa luôn bản cache trên CDN, link ảnh cũ ngừng hoạt động
        await cloudinary.uploader.destroy(publicId, { invalidate: true });
      } catch (error) {
        console.error("DESTROY_IMAGE_ERROR:", publicId, error.message);
      }
    }),
  );
};

// Xóa tin cùng dữ liệu phụ thuộc: ảnh, wishlist, yêu cầu tư vấn, lượt xem, kết quả AI kiểm duyệt.
// Chat được giữ lại để hai bên còn xem được lịch sử trao đổi (giao diện hiển thị "Tin đã bị xóa").
export const deletePropertyCascade = async (property) => {
  await Promise.all([
    Wishlist.deleteMany({ property: property._id }),
    Inquiry.deleteMany({ property: property._id }),
    PropertyView.deleteMany({ property: property._id }),
    ModerationReview.deleteMany({ property: property._id }),
  ]);
  await Property.deleteOne({ _id: property._id });
  await destroyImages(property.images);
};
