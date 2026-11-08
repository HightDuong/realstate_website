import Inquiry, { STATUS_HISTORY_LIMIT } from "../models/inquiry.model.js";

// Điều kiện "chưa xử lý": bản ghi cũ chưa có field status cũng tính là "new"
export const NEW_STATUS_FILTER = { $in: ["new", null] };

const historyEntry = (status, by, auto = false) => ({ status, at: new Date(), by, auto });

// Thêm một mục vào statusHistory, chỉ giữ STATUS_HISTORY_LIMIT mục gần nhất
export const pushStatusHistory = (status, by, auto = false) => ({
  statusHistory: { $each: [historyEntry(status, by, auto)], $slice: -STATUS_HISTORY_LIMIT },
});

/**
 * Seller vừa nhắn tin cho buyer về một tin đăng → ghi nhận đã phản hồi:
 *  - yêu cầu đang "new" tự chuyển sang "contacted" (chỉ tiến lên, không bao giờ tự lùi);
 *  - yêu cầu ở trạng thái khác chưa có firstResponseAt thì được ghi mốc phản hồi.
 * Lỗi chỉ ghi log, không ảnh hưởng việc gửi tin nhắn.
 */
export const markInquiriesResponded = async ({ sellerId, buyerId, propertyId }) => {
  try {
    const now = new Date();
    const base = { seller: sellerId, buyer: buyerId, property: propertyId };
    await Inquiry.updateMany(
      { ...base, status: NEW_STATUS_FILTER },
      {
        $set: { status: "contacted", isRead: true },
        $min: { firstResponseAt: now },
        $push: pushStatusHistory("contacted", sellerId, true),
      },
    );
    await Inquiry.updateMany(
      { ...base, firstResponseAt: null },
      { $set: { firstResponseAt: now } },
    );
  } catch (error) {
    console.error("MARK_INQUIRY_RESPONDED_ERROR:", error.message);
  }
};
