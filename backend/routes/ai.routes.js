import express from "express";
import { authorize, optionalAuth, protect, requireApproved } from "../middlewares/auth.middleware.js";
import { draftImages } from "../middlewares/upload.middleware.js";
import {
  chatWithAssistant,
  clearRecommendations,
  getAiConversation,
  getAiQuota,
  getRecommendations,
} from "../controllers/ai.controller.js";
import {
  createListingDraft,
  ensureListingDraftAvailable,
  getListingDraftQuota,
} from "../controllers/aiListing.controller.js";

const aiRouter = express.Router();

// Chatbot tìm nhà: khách (tối đa 10 câu) và người đăng nhập đều dùng được
aiRouter.get("/quota", optionalAuth, getAiQuota);
aiRouter.post("/chat", optionalAuth, chatWithAssistant);
aiRouter.get("/conversations/:id", optionalAuth, getAiConversation);

// "Có thể bạn quan tâm" dựa trên nội dung trò chuyện
aiRouter.get("/recommendations", optionalAuth, getRecommendations);
aiRouter.delete("/recommendations", protect, clearRecommendations);

// AI viết tin đăng cho người bán: kiểm tra duyệt + lượt dùng TRƯỚC khi nhận ảnh
aiRouter.get("/listing-draft/quota", protect, authorize("seller"), getListingDraftQuota);
aiRouter.post(
  "/listing-draft",
  protect,
  authorize("seller"),
  requireApproved,
  ensureListingDraftAvailable,
  draftImages,
  createListingDraft,
);

export default aiRouter;
