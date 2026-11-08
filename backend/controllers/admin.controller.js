import mongoose from "mongoose";
import User from "../models/user.model.js";
import Property from "../models/property.model.js";
import Inquiry, { CLOSED_STATUSES } from "../models/inquiry.model.js";
import Wishlist from "../models/wishlist.model.js";
import Chat from "../models/chat.model.js";
import Contact, { PENDING_CONTACT_FILTER } from "../models/contact.model.js";
import { PUBLIC_VISIBILITY } from "../utils/propertyQuery.js";
import { isAiEnabled } from "../ai/openaiClient.js";
import { deletePropertyCascade } from "../utils/propertyCleanup.js";
import { notifyUser } from "../utils/notify.js";
import {
  getLatestReview,
  getLatestReviews,
  recordAdminDecision,
  reviewView,
  runModerationReview,
} from "../utils/moderationReview.js";
import { LISTING_DRAFT_GRANT, grantListingQuota } from "../utils/listingDraftQuota.js";

//view all users
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("ADMIN_GET_USERS_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi lấy danh sách người dùng" });
  }
};

// Admin không được khóa/xóa chính mình hoặc admin khác (tránh tự khóa hệ thống)
const checkManageable = (req, user) => {
  if (!user) return { status: 404, message: "Người dùng không tồn tại" };
  if (user._id.equals(req.user._id)) {
    return { status: 400, message: "Bạn không thể thực hiện thao tác này với chính tài khoản của mình" };
  }
  if (user.role === "admin") {
    return { status: 403, message: "Không thể khóa hoặc xóa tài khoản quản trị viên" };
  }
  return null;
};

//block a particular user
export const blockUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    const denied = checkManageable(req, user);
    if (denied) return res.status(denied.status).json({ message: denied.message });

    user.isBlocked = !user.isBlocked;
    await user.save();
    res.json({
      success: true,
      isBlocked: user.isBlocked,
      message: user.isBlocked
        ? "Đã khóa tài khoản người dùng"
        : "Đã mở khóa tài khoản người dùng",
    });
  } catch (error) {
    console.error("ADMIN_BLOCK_USER_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi khóa người dùng" });
  }
};

//to delete a particular user (kèm toàn bộ dữ liệu của họ)
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    const denied = checkManageable(req, user);
    if (denied) return res.status(denied.status).json({ message: denied.message });

    // tin đăng của seller: xóa kèm ảnh, wishlist, yêu cầu tư vấn, lượt xem
    const properties = await Property.find({ seller: user._id });
    for (const property of properties) {
      await deletePropertyCascade(property);
    }
    await Promise.all([
      Wishlist.deleteMany({ user: user._id }),
      Inquiry.deleteMany({ $or: [{ buyer: user._id }, { seller: user._id }] }),
      Chat.deleteMany({ $or: [{ buyer: user._id }, { seller: user._id }] }),
    ]);
    await user.deleteOne();

    res.json({ success: true, message: "Đã xóa người dùng" });
  } catch (error) {
    console.error("ADMIN_DELETE_USER_ERROR:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ khi xóa người dùng" });
  }
};

// Cấp thêm lượt "AI viết tin" trong ngày cho người bán (khi họ báo đã dùng hết 20 lượt)
export const grantAiListingQuota = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("name role");
    if (!user) return res.status(404).json({ message: "Người dùng không tồn tại" });
    if (user.role !== "seller") {
      return res.status(400).json({ message: "Chỉ cấp lượt AI viết tin cho người bán" });
    }
    const quota = await grantListingQuota(user._id);
    const message = `Đã cấp thêm ${LISTING_DRAFT_GRANT} lượt AI viết tin hôm nay cho ${user.name}. Còn ${quota.remaining}/${quota.limit} lượt.`;
    res.json({ success: true, message, ...quota });
    notifyUser({
      userId: user._id,
      type: "ai_quota_granted",
      title: "Bạn được cấp thêm lượt AI viết tin",
      message: `Quản trị viên đã cấp thêm ${LISTING_DRAFT_GRANT} lượt AI viết tin cho hôm nay.`,
      link: "/add-property",
    });
  } catch (error) {
    console.error("ADMIN_GRANT_AI_QUOTA_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi cấp thêm lượt AI viết tin" });
  }
};

//view all properties
export const getAllProperties = async (req, res) => {
  try {
    const docs = await Property.find()
      .populate("seller", "name email")
      .sort({ createdAt: -1 });
    // kèm kết quả AI hỗ trợ kiểm duyệt mới nhất của từng tin (chỉ admin thấy)
    const reviews = await getLatestReviews(docs.map((p) => p._id));
    const properties = docs.map((p) => ({
      ...p.toObject(),
      aiReview: reviewView(reviews.get(String(p._id)), p),
    }));
    res.json({
      success: true,
      count: properties.length,
      properties,
    });
  } catch (error) {
    console.error("ADMIN_GET_PROPERTIES_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi lấy danh sách bất động sản" });
  }
};

// Duyệt tin: hiển thị công khai + nhãn "Đã kiểm duyệt", báo cho seller (ứng dụng + email)
export const approveProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({ message: "Bất động sản không tồn tại" });
    }
    property.moderationStatus = "approved";
    property.isVerified = true;
    property.rejectionReason = undefined;
    property.moderatedAt = new Date();
    property.moderatedBy = req.user._id;
    await property.save();

    res.json({ success: true, message: "Đã duyệt tin đăng", property: moderationView(property) });
    recordAdminDecision(property._id, "approved", req.user._id);
    notifyUser({
      userId: property.seller,
      type: "property_approved",
      title: "Tin đăng của bạn đã được duyệt",
      message: `Tin "${property.title}" đã được duyệt và đang hiển thị trên sàn.`,
      link: `/property/${property._id}`,
      email: true,
    });
  } catch (error) {
    console.error("ADMIN_APPROVE_PROPERTY_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi duyệt tin đăng" });
  }
};

// Từ chối tin (bắt buộc có lý do): ẩn khỏi trang công khai, seller sửa xong sẽ tự gửi duyệt lại
export const rejectProperty = async (req, res) => {
  try {
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 5 || reason.length > 500) {
      return res.status(400).json({ message: "Vui lòng nhập lý do từ chối (5–500 ký tự)" });
    }
    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({ message: "Bất động sản không tồn tại" });
    }
    property.moderationStatus = "rejected";
    property.isVerified = false;
    property.rejectionReason = reason;
    property.moderatedAt = new Date();
    property.moderatedBy = req.user._id;
    await property.save();

    res.json({ success: true, message: "Đã từ chối tin đăng", property: moderationView(property) });
    recordAdminDecision(property._id, "rejected", req.user._id);
    notifyUser({
      userId: property.seller,
      type: "property_rejected",
      title: "Tin đăng của bạn bị từ chối",
      message: `Tin "${property.title}" chưa được duyệt.\nLý do: ${reason}\nBạn hãy chỉnh sửa tin, tin sẽ tự động được gửi duyệt lại.`,
      link: `/edit-property/${property._id}`,
      email: true,
    });
  } catch (error) {
    console.error("ADMIN_REJECT_PROPERTY_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi từ chối tin đăng" });
  }
};

// Kết quả AI hỗ trợ kiểm duyệt mới nhất của một tin
export const getPropertyAiReview = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({ message: "Bất động sản không tồn tại" });
    }
    const review = await getLatestReview(req.params.id);
    res.json({ success: true, review: reviewView(review, property) });
  } catch (error) {
    console.error("ADMIN_GET_AI_REVIEW_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi lấy kết quả phân tích tin đăng" });
  }
};

// Admin bấm "Phân tích lại": chạy ngay và đợi kết quả, kể cả khi nội dung tin chưa đổi
export const runPropertyAiReview = async (req, res) => {
  try {
    if (!(await Property.exists({ _id: req.params.id }))) {
      return res.status(404).json({ message: "Bất động sản không tồn tại" });
    }
    const review = await runModerationReview(req.params.id, { force: true });
    if (review?.status !== "done") {
      return res.status(500).json({ message: "Phân tích tin đăng thất bại, vui lòng thử lại" });
    }
    res.json({ success: true, message: "Đã phân tích lại tin đăng", review: reviewView(review) });
  } catch (error) {
    console.error("ADMIN_RUN_AI_REVIEW_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi phân tích tin đăng" });
  }
};

const moderationView = (p) => ({
  _id: p._id,
  moderationStatus: p.moderationStatus,
  isVerified: p.isVerified,
  rejectionReason: p.rejectionReason,
  moderatedAt: p.moderatedAt,
});

// to delete a particular property (kèm ảnh Cloudinary và dữ liệu liên quan)
export const deleteProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({ message: "Bất động sản không tồn tại" });
    }
    await deletePropertyCascade(property);
    res.json({ success: true, message: "Đã xóa bất động sản" });
  } catch (error) {
    console.error("ADMIN_DELETE_PROPERTY_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi xóa bất động sản" });
  }
};

//to view all inquiries
export const getAllInquiries = async (req, res) => {
  try {
    const inquiries = await Inquiry.find()
      .populate("property", "title")
      .populate("buyer", "name email")
      .populate("seller", "name email")
      .sort({ createdAt: -1 });
    res.json({
      success: true,
      count: inquiries.length,
      inquiries,
    });
  } catch (error) {
    console.error("ADMIN_GET_INQUIRIES_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi lấy danh sách yêu cầu tư vấn" });
  }
};

//Dashboard analytics
export const getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalProperties,
      activeListings,
      soldProperties,
      pendingProperties,
      pendingSellers,
      totalContacts,
      pendingContacts,
      openInquiries,
    ] = await Promise.all([
      User.countDocuments(),
      Property.countDocuments(),
      // Tin đang bán mà người mua nhìn thấy (không tính tin chờ duyệt / bị từ chối)
      Property.countDocuments({ status: "sale", ...PUBLIC_VISIBILITY }),
      Property.countDocuments({ status: "sold" }),
      Property.countDocuments({ moderationStatus: "pending" }),
      User.countDocuments({ role: "seller", isApproved: false }),
      Contact.countDocuments(),
      Contact.countDocuments({ status: PENDING_CONTACT_FILTER }),
      Inquiry.countDocuments({ status: { $nin: CLOSED_STATUSES } }),
    ]);

    // Trạng thái thật của các dịch vụ (chỉ kiểm tra cấu hình, không gọi dịch vụ ngoài mỗi lần tải trang)
    let database = false;
    try {
      database = mongoose.connection.readyState === 1 && Boolean(await mongoose.connection.db.admin().ping());
    } catch {
      database = false;
    }
    const system = {
      database,
      media: Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
      email: Boolean(process.env.BREVO_API_KEY),
      ai: isAiEnabled(),
    };

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalProperties,
        activeListings,
        soldProperties,
        pendingProperties,
        pendingSellers,
        totalContacts,
        pendingContacts,
        openInquiries,
      },
      system,
    });
  } catch (error) {
    console.error("ADMIN_STATS_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi lấy thống kê" });
  }
};

//to get pending seller account
export const getPendingSellers = async (req, res) => {
  try {
    const pendingSellers = await User.find({
      role: "seller",
      isApproved: false,
    }).select("-password");
    res.json({
      success: true,
      count: pendingSellers.length,
      pendingSellers,
    });
  } catch (error) {
    console.error("ADMIN_PENDING_SELLERS_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi lấy danh sách người bán chờ duyệt" });
  }
};

//now to approve a seller account
export const approveSeller = async (req, res) => {
  try {
    const seller = await User.findById(req.params.id);
    if (!seller || seller.role !== "seller") {
      return res.status(404).json({ message: "Không tìm thấy người bán" });
    }
    seller.isApproved = true;
    await seller.save();
    res.json({ success: true, message: "Đã phê duyệt người bán" });
  } catch (error) {
    console.error("ADMIN_APPROVE_SELLER_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi phê duyệt người bán" });
  }
};
