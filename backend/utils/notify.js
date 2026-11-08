import Notification from "../models/notification.model.js";
import User from "../models/user.model.js";
import sendEmail from "./sendEmail.js";
import { escapeHtml } from "./validate.js";

let io = null;
// server.js gọi một lần sau khi tạo Socket.io
export const setSocketServer = (server) => {
  io = server;
};

// Phòng socket riêng của mỗi user (join khi kết nối, xem utils/chatSocket.js)
export const userRoom = (userId) => `user:${userId}`;

// Báo cho tất cả admin (vd có tin mới chờ duyệt). Chỉ thông báo trong ứng dụng, không email.
export const notifyAdmins = async ({ type, title, message = "", link = "" }) => {
  try {
    const admins = await User.find({ role: "admin", isBlocked: { $ne: true } }).select("_id");
    await Promise.all(
      admins.map((a) => notifyUser({ userId: a._id, type, title, message, link })),
    );
  } catch (error) {
    console.error("NOTIFY_ADMINS_ERROR:", error.message);
  }
};

/**
 * Tạo thông báo trong ứng dụng + đẩy realtime qua socket (+ email nếu email: true).
 * Lỗi gửi thông báo chỉ ghi log, không làm hỏng thao tác chính.
 */
export const notifyUser = async ({ userId, type, title, message = "", link = "", email = false }) => {
  try {
    const notification = await Notification.create({ user: userId, type, title, message, link });
    io?.to(userRoom(userId)).emit("notification", notification);

    if (email) {
      const user = await User.findById(userId).select("email name");
      if (user?.email) {
        const clientUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
        await sendEmail({
          email: user.email,
          subject: title,
          message: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
              <h2 style="color: #0d9488;">${escapeHtml(title)}</h2>
              <p>Xin chào ${escapeHtml(user.name || "")},</p>
              <p style="white-space: pre-line;">${escapeHtml(message)}</p>
              ${link ? `<p><a href="${clientUrl}${link}" style="color: #0d9488;">Xem chi tiết</a></p>` : ""}
            </div>`,
        });
      }
    }
    return notification;
  } catch (error) {
    console.error("NOTIFY_USER_ERROR:", error.message);
    return null;
  }
};
