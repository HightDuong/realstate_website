import express from "express";
import { authorize, protect } from "../middlewares/auth.middleware.js";
import {
  blockUser,
  getAllUsers,
  deleteUser,
  getAllProperties,
  getPendingSellers,
  getAllInquiries,
  approveSeller,
  deleteProperty,
  approveProperty,
  rejectProperty,
  getDashboardStats,
  getPropertyAiReview,
  runPropertyAiReview,
  grantAiListingQuota,
} from "../controllers/admin.controller.js";
import { validateIdParams } from "../utils/validate.js";

const adminRoutes = express.Router();
const validId = validateIdParams("id");

// Tất cả các route dưới đây đều yêu cầu đăng nhập và quyền admin
adminRoutes.use(protect, authorize("admin"));

// Quản lý User
adminRoutes.get("/users", getAllUsers);
adminRoutes.patch("/users/block/:id", validId, blockUser);
adminRoutes.delete("/users/:id", validId, deleteUser);
adminRoutes.post("/users/:id/ai-listing-quota", validId, grantAiListingQuota);

// Quản lý Bất động sản
adminRoutes.get("/properties", getAllProperties);
adminRoutes.patch("/properties/:id/approve", validId, approveProperty);
adminRoutes.patch("/properties/:id/reject", validId, rejectProperty);
adminRoutes.delete("/properties/:id", validId, deleteProperty);
// AI hỗ trợ kiểm duyệt: xem kết quả mới nhất / phân tích lại
adminRoutes.get("/properties/:id/ai-review", validId, getPropertyAiReview);
adminRoutes.post("/properties/:id/ai-review", validId, runPropertyAiReview);

// Quản lý Yêu cầu tư vấn
adminRoutes.get("/inquiries", getAllInquiries);

adminRoutes.get("/stats", getDashboardStats);

// Quản lý Duyệt Seller
adminRoutes.get("/pending-sellers", getPendingSellers);
adminRoutes.patch("/approve-seller/:id", validId, approveSeller);


export default adminRoutes;
