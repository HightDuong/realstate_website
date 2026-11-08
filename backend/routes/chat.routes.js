import express from "express";
import Chat from "../models/chat.model.js";
import Property from "../models/property.model.js";
import User from "../models/user.model.js";
import { protect, authorize } from "../middlewares/auth.middleware.js";
import { isValidId, validateIdParams } from "../utils/validate.js";
import { markInquiriesResponded } from "../utils/inquiryPipeline.js";

const chatRouter = express.Router();
chatRouter.use(protect);

const MAX_MESSAGE_LENGTH = 2000;
// Không trả email của đối phương trong chat
const USER_FIELDS = "name profilePic";

const isParticipant = (chat, userId) =>
  chat.buyer.toString() === userId.toString() ||
  chat.seller.toString() === userId.toString();

//to create a chat (chỉ buyer và seller; luôn gắn với một tin đăng có thật)
chatRouter.post("/start", authorize("buyer", "seller"), async (req, res) => {
  try {
    const { propertyId, sellerId, buyerId: providedBuyerId } = req.body;
    if (!isValidId(propertyId)) {
      return res.status(400).json({ message: "Mã bất động sản không hợp lệ" });
    }
    const property = await Property.findById(propertyId).select("seller");
    if (!property) {
      return res.status(404).json({ message: "Bất động sản không tồn tại" });
    }

    let buyerId, finalSellerId;
    if (req.user.role === "seller") {
      // seller chỉ mở chat về tin của chính mình, với một tài khoản buyer có thật
      if (!property.seller.equals(req.user._id)) {
        return res.status(403).json({ message: "Bạn chỉ có thể trò chuyện về tin đăng của mình" });
      }
      if (!isValidId(providedBuyerId)) {
        return res.status(400).json({ message: "Mã người mua không hợp lệ" });
      }
      const buyer = await User.findById(providedBuyerId).select("role");
      if (!buyer || buyer.role !== "buyer") {
        return res.status(404).json({ message: "Không tìm thấy người mua" });
      }
      buyerId = buyer._id;
      finalSellerId = req.user._id;
    } else {
      // buyer: người bán luôn là chủ tin, không tin vào sellerId client gửi lên
      if (sellerId && sellerId.toString() !== property.seller.toString()) {
        return res.status(400).json({ message: "Người bán không khớp với tin đăng" });
      }
      buyerId = req.user._id;
      finalSellerId = property.seller;
    }

    //check for an existing chat btw this buyer and seller about this property
    let chat = await Chat.findOne({
      buyer: buyerId,
      seller: finalSellerId,
      property: property._id,
    });

    if (!chat) {
      chat = await Chat.create({
        property: property._id,
        buyer: buyerId,
        seller: finalSellerId,
        messages: [],
      });
    }

    chat = await Chat.findById(chat._id)
      .populate("buyer", USER_FIELDS)
      .populate("seller", USER_FIELDS)
      .populate("property", "title price images");
    res.status(200).json(chat);
  } catch (error) {
    console.error("CHAT_START_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi tạo cuộc trò chuyện" });
  }
});

//to send message
chatRouter.post("/send", async (req, res) => {
  try {
    const { chatId, image } = req.body;
    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    const userId = req.user._id;

    if (!isValidId(chatId)) {
      return res.status(400).json({ message: "Mã cuộc trò chuyện không hợp lệ" });
    }
    if (!text) {
      return res.status(400).json({ message: "Vui lòng nhập nội dung tin nhắn" });
    }
    if (text.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ message: `Tin nhắn tối đa ${MAX_MESSAGE_LENGTH} ký tự` });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }

    //ensure sender is part of the chat
    if (!isParticipant(chat, userId)) {
      return res
        .status(403)
        .json({ message: "Bạn không thuộc cuộc trò chuyện này" });
    }

    const newMessage = {
      sender: userId,
      text,
      image: typeof image === "string" && /^https:\/\//.test(image) ? image : undefined,
      createdAt: new Date(),
    };
    chat.messages.push(newMessage);
    await chat.save();

    // seller trả lời khách → yêu cầu tư vấn tương ứng tự chuyển "Đang trao đổi"
    if (chat.seller.equals(userId) && chat.property) {
      await markInquiriesResponded({ sellerId: chat.seller, buyerId: chat.buyer, propertyId: chat.property });
    }

    const savedMessage = chat.messages[chat.messages.length - 1];
    res.status(200).json(savedMessage);
  } catch (error) {
    console.error("CHAT_SEND_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi gửi tin nhắn" });
  }
});

//to get chats for user
chatRouter.get("/user", async (req, res) => {
  try {
    const userId = req.user._id;
    const chats = await Chat.find({
      $or: [{ buyer: userId }, { seller: userId }],
    })
      .populate("buyer", USER_FIELDS)
      .populate("seller", USER_FIELDS)
      .populate("property", "title price images")
      .sort({ updatedAt: -1 });
    res.status(200).json(chats);
  } catch (error) {
    console.error("CHAT_LIST_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi lấy danh sách trò chuyện" });
  }
});

//to get chat message
chatRouter.get("/:chatId", validateIdParams("chatId"), async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId).populate(
      "messages.sender",
      USER_FIELDS,
    );

    if (!chat) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }

    if (!isParticipant(chat, req.user._id)) {
      return res.status(403).json({ message: "Bạn không có quyền xem cuộc trò chuyện này" });
    }

    res.status(200).json(chat.messages);
  } catch (error) {
    console.error("CHAT_MESSAGES_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi lấy tin nhắn" });
  }
});

//to delete an entire chat
chatRouter.delete("/:chatId", validateIdParams("chatId"), async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }
    //now we ensure the user is part of the chat
    if (!isParticipant(chat, req.user._id)) {
      return res.status(403).json({ message: "Bạn không có quyền xóa cuộc trò chuyện này" });
    }
    await Chat.findByIdAndDelete(req.params.chatId);
    res.status(200).json({ message: "Đã xóa cuộc trò chuyện" });
  } catch (error) {
    console.error("CHAT_DELETE_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi xóa cuộc trò chuyện" });
  }
});

//to delete specific message
chatRouter.delete("/:chatId/message/:messageId", validateIdParams("chatId", "messageId"), async (req, res) => {
  try {
    const userId = req.user._id;
    const chat = await Chat.findById(req.params.chatId);

    if (!chat) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }
    const message = chat.messages.id(req.params.messageId);
    if (!message) {
      return res.status(404).json({ message: "Không tìm thấy tin nhắn" });
    }
    //only sender can delete their message
    if (message.sender.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Bạn chỉ có thể xóa tin nhắn của mình" });
    }
    chat.messages.pull(req.params.messageId);
    await chat.save();
    res.status(200).json({ message: "Đã xóa tin nhắn", chat });
  } catch (error) {
    console.error("CHAT_DELETE_MESSAGE_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi xóa tin nhắn" });
  }
});

export default chatRouter;
