import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import Chat from "../models/chat.model.js";
import { isValidId } from "./validate.js";
import { userRoom } from "./notify.js";

const isParticipant = (chat, userId) =>
  chat.buyer.toString() === userId || chat.seller.toString() === userId;

// Socket.io cho chat realtime.
// - Kết nối phải gửi JWT trong handshake.auth.token (user bị khóa/không tồn tại → từ chối).
// - Chỉ người trong cuộc trò chuyện mới joinChat được.
// - sendMessage: không tin dữ liệu client gửi lên; chỉ phát lại tin nhắn đã được lưu qua REST
//   (đúng chat, đúng người gửi), lấy nội dung từ DB.
export const registerChatSocket = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("UNAUTHORIZED"));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("_id isBlocked");
      if (!user || user.isBlocked) return next(new Error("UNAUTHORIZED"));
      socket.userId = user._id.toString();
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket) => {
    // phòng riêng để nhận thông báo realtime (utils/notify.js)
    socket.join(userRoom(socket.userId));

    socket.on("joinChat", async (chatId) => {
      try {
        if (!isValidId(chatId)) return;
        const chat = await Chat.findById(chatId).select("buyer seller");
        if (chat && isParticipant(chat, socket.userId)) socket.join(chatId);
      } catch (error) {
        console.error("SOCKET_JOIN_CHAT_ERROR:", error.message);
      }
    });

    socket.on("sendMessage", async (data) => {
      try {
        const chatId = data?.chatId;
        const messageId = data?._id;
        if (!isValidId(chatId) || !isValidId(messageId)) return;
        if (!socket.rooms.has(chatId)) return;

        const chat = await Chat.findById(chatId).select("buyer seller messages");
        const message = chat?.messages.id(messageId);
        if (!message || message.sender.toString() !== socket.userId) return;

        // Broadcast cho những người khác trong room (người gửi đã tự thêm tin nhắn vào giao diện)
        socket.broadcast.to(chatId).emit("newMessage", {
          chatId,
          _id: message._id,
          sender: message.sender,
          text: message.text,
          image: message.image,
          createdAt: message.createdAt,
        });
      } catch (error) {
        console.error("SOCKET_SEND_MESSAGE_ERROR:", error.message);
      }
    });
  });
};
