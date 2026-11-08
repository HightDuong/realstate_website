import Notification from "../models/notification.model.js";

// 30 thông báo mới nhất + số chưa đọc
export const getNotifications = async (req, res) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(30),
      Notification.countDocuments({ user: req.user._id, isRead: false }),
    ]);
    res.json({ success: true, unreadCount, notifications });
  } catch (error) {
    console.error("GET_NOTIFICATIONS_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi lấy thông báo" });
  }
};

export const markNotificationRead = async (req, res) => {
  try {
    const result = await Notification.updateOne(
      { _id: req.params.id, user: req.user._id },
      { $set: { isRead: true } },
    );
    if (!result.matchedCount) {
      return res.status(404).json({ message: "Thông báo không tồn tại" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("MARK_NOTIFICATION_READ_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
};

export const markAllNotificationsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, isRead: false },
      { $set: { isRead: true } },
    );
    res.json({ success: true });
  } catch (error) {
    console.error("MARK_ALL_NOTIFICATIONS_READ_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
};
