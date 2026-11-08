import mongoose from "mongoose";
import Inquiry, {
    CLOSED_STATUSES,
    INQUIRY_STATUSES,
    LOST_REASONS,
    SELLER_PRIVATE_FIELDS,
    STATUS_HISTORY_LIMIT,
} from "../models/inquiry.model.js";
import Property from "../models/property.model.js";
import User from "../models/user.model.js";
import { isValidId } from "../utils/validate.js";
import { escapeRegex, isPubliclyVisible } from "../utils/propertyQuery.js";
import { NEW_STATUS_FILTER } from "../utils/inquiryPipeline.js";
import { notifyUser } from "../utils/notify.js";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_NOTE_LENGTH = 1000;
const MAX_LOST_NOTE_LENGTH = 300;
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
// Yêu cầu "new" chờ quá mốc này bị coi là quá hạn phản hồi (hiển thị đỏ cho seller)
const OVERDUE_MS = 24 * 60 * 60 * 1000;
const STATS_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const BUYER_FIELDS = "name email phone profilePic";
const PROPERTY_FIELDS = "title price images city area status";

const trimString = (value) => (typeof value === "string" ? value.trim() : "");

// Nhãn trạng thái phía buyer: không lộ "won"/"lost" (cả hai là "closed")
const toBuyerStatus = (inquiry) => {
    const status = inquiry.status || "new";
    if (status === "new") return inquiry.isRead ? "seen" : "sent";
    if (CLOSED_STATUSES.includes(status)) return "closed";
    return status;
};

// Tìm yêu cầu và kiểm tra quyền chủ (seller nhận yêu cầu). Trả về null nếu đã gửi response lỗi.
const findOwnInquiry = async (req, res) => {
    const inquiry = await Inquiry.findById(req.params.id);
    if (!inquiry) {
        res.status(404).json({ success: false, message: "Yêu cầu tư vấn không tồn tại" });
        return null;
    }
    if (inquiry.seller.toString() !== req.user._id.toString()) {
        res.status(403).json({ success: false, message: "Bạn không có quyền với yêu cầu này" });
        return null;
    }
    return inquiry;
};

//buyer send inquiry
export const sendInquiry = async (req, res) => {
    try {
        const { propertyId } = req.body;
        const message = trimString(req.body.message);
        if (!isValidId(propertyId)) {
            return res.status(400).json({ success: false, message: "Mã bất động sản không hợp lệ" });
        }
        if (!message) {
            return res.status(400).json({ success: false, message: "Vui lòng nhập nội dung yêu cầu" });
        }
        if (message.length > MAX_MESSAGE_LENGTH) {
            return res.status(400).json({ success: false, message: `Nội dung tối đa ${MAX_MESSAGE_LENGTH} ký tự` });
        }
        const property = await Property.findById(propertyId);
        // tin chờ duyệt / bị từ chối không nhận yêu cầu (giống trang chi tiết trả 404)
        if (!property || !isPubliclyVisible(property)) {
            return res.status(404).json({ success: false, message: 'Bất động sản không tồn tại' });
        }
        // chống gửi trùng: mỗi buyer chỉ gửi 1 yêu cầu / tin trong 24 giờ
        const recent = await Inquiry.findOne({
            property: property._id,
            buyer: req.user._id,
            createdAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
        });
        if (recent) {
            return res.status(409).json({
                success: false,
                message: "Bạn đã gửi yêu cầu cho tin này trong 24 giờ qua. Vui lòng chờ người bán phản hồi hoặc nhắn tin trực tiếp.",
            });
        }
        const inquiry = await Inquiry.create({
            property: property._id,
            buyer: req.user._id,
            seller: property.seller,
            message,
            statusHistory: [{ status: "new", at: new Date(), by: req.user._id }],
        });

        notifyUser({
            userId: property.seller,
            type: "inquiry_new",
            title: "Khách mới quan tâm tin của bạn",
            message: `${req.user.name} gửi yêu cầu tư vấn về "${property.title}": ${message.slice(0, 200)}`,
            link: `/inquiries?id=${inquiry._id}`,
            email: true,
        });

        res.status(201).json({ success: true, message: 'Đã gửi yêu cầu tư vấn', inquiry });
    } catch (error) {
        console.error("SEND_INQUIRY_ERROR:", error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi gửi yêu cầu tư vấn' });
    }
};

/**
 * Seller xem yêu cầu nhận được.
 * Query: status (all | new | contacted | viewing_scheduled | won | lost), propertyId, q (tên khách), page, limit.
 * Trả thêm `counts` theo trạng thái (đã áp bộ lọc tin + tên khách, chưa áp bộ lọc trạng thái) để hiện số trên tab.
 */
export const getSellerInquiries = async (req, res) => {
    try {
        const { status, propertyId } = req.query;
        const q = trimString(req.query.q).slice(0, 100);

        const match = { seller: req.user._id };
        if (propertyId) {
            if (!isValidId(propertyId)) {
                return res.status(400).json({ success: false, message: "Mã bất động sản không hợp lệ" });
            }
            match.property = new mongoose.Types.ObjectId(propertyId);
        }
        if (q) {
            const buyers = await User.find({ name: new RegExp(escapeRegex(q), "i") }).select("_id").limit(200);
            match.buyer = { $in: buyers.map((b) => b._id) };
        }

        const listQuery = { ...match };
        if (status && status !== "all") {
            if (!INQUIRY_STATUSES.includes(status)) {
                return res.status(400).json({ success: false, message: "Trạng thái không hợp lệ" });
            }
            listQuery.status = status === "new" ? NEW_STATUS_FILTER : status;
        }

        const limit = Math.min(Math.max(parseInt(req.query.limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
        const page = Math.max(parseInt(req.query.page) || 1, 1);

        const [inquiries, total, grouped] = await Promise.all([
            Inquiry.find(listQuery)
                .populate('buyer', BUYER_FIELDS)
                .populate('property', PROPERTY_FIELDS)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit),
            Inquiry.countDocuments(listQuery),
            Inquiry.aggregate([
                { $match: match },
                { $group: { _id: { $ifNull: ["$status", "new"] }, n: { $sum: 1 } } },
            ]),
        ]);

        const counts = Object.fromEntries(INQUIRY_STATUSES.map((s) => [s, 0]));
        let all = 0;
        for (const g of grouped) {
            counts[g._id] = (counts[g._id] || 0) + g.n;
            all += g.n;
        }
        counts.all = all;

        res.status(200).json({
            success: true,
            count: inquiries.length,
            total,
            page,
            totalPages: Math.max(Math.ceil(total / limit), 1),
            counts,
            inquiries,
        });
    } catch (error) {
        console.error("GET_SELLER_INQUIRIES_ERROR:", error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
    }
};

// Seller xem chi tiết một yêu cầu (kèm lịch sử trạng thái)
export const getInquiryDetail = async (req, res) => {
    try {
        const inquiry = await findOwnInquiry(req, res);
        if (!inquiry) return;
        await inquiry.populate([
            { path: "buyer", select: BUYER_FIELDS },
            { path: "property", select: PROPERTY_FIELDS },
        ]);
        res.status(200).json({ success: true, inquiry });
    } catch (error) {
        console.error("GET_INQUIRY_DETAIL_ERROR:", error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
    }
};

// Seller đổi trạng thái: { status, lostReason?, lostNote? }
export const updateInquiryStatus = async (req, res) => {
    try {
        const { status, lostReason } = req.body;
        const lostNote = trimString(req.body.lostNote);
        if (!INQUIRY_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, message: "Trạng thái không hợp lệ" });
        }
        if (status === "lost" && !LOST_REASONS.includes(lostReason)) {
            return res.status(400).json({ success: false, message: "Vui lòng chọn lý do không tiếp tục" });
        }
        if (lostNote.length > MAX_LOST_NOTE_LENGTH) {
            return res.status(400).json({ success: false, message: `Ghi chú lý do tối đa ${MAX_LOST_NOTE_LENGTH} ký tự` });
        }

        const inquiry = await findOwnInquiry(req, res);
        if (!inquiry) return;

        const current = inquiry.status || "new";
        const changed = current !== status;
        const now = new Date();

        inquiry.status = status;
        inquiry.isRead = true;
        if (status !== "new" && !inquiry.firstResponseAt) inquiry.firstResponseAt = now;
        if (CLOSED_STATUSES.includes(status)) {
            if (changed || !inquiry.closedAt) inquiry.closedAt = now;
        } else {
            inquiry.closedAt = undefined;
        }
        if (status === "lost") {
            inquiry.lostReason = lostReason;
            inquiry.lostNote = lostNote;
        } else {
            inquiry.lostReason = null;
            inquiry.lostNote = "";
        }
        if (changed) {
            inquiry.statusHistory.push({ status, at: now, by: req.user._id });
            if (inquiry.statusHistory.length > STATUS_HISTORY_LIMIT) {
                inquiry.statusHistory.splice(0, inquiry.statusHistory.length - STATUS_HISTORY_LIMIT);
            }
        }
        await inquiry.save();

        await inquiry.populate([
            { path: "buyer", select: BUYER_FIELDS },
            { path: "property", select: PROPERTY_FIELDS },
        ]);
        res.status(200).json({ success: true, message: "Đã cập nhật trạng thái", inquiry });
    } catch (error) {
        console.error("UPDATE_INQUIRY_STATUS_ERROR:", error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
    }
};

// Seller lưu ghi chú nội bộ (buyer không thấy)
export const updateInquiryNote = async (req, res) => {
    try {
        if (typeof req.body.note !== "string") {
            return res.status(400).json({ success: false, message: "Ghi chú không hợp lệ" });
        }
        const note = req.body.note.trim();
        if (note.length > MAX_NOTE_LENGTH) {
            return res.status(400).json({ success: false, message: `Ghi chú tối đa ${MAX_NOTE_LENGTH} ký tự` });
        }
        const inquiry = await findOwnInquiry(req, res);
        if (!inquiry) return;
        inquiry.sellerNote = note;
        await inquiry.save();
        res.status(200).json({ success: true, message: "Đã lưu ghi chú", sellerNote: note });
    } catch (error) {
        console.error("UPDATE_INQUIRY_NOTE_ERROR:", error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
    }
};

// Số liệu cho seller: khách chưa xử lý, quá hạn, tỉ lệ chốt và thời gian phản hồi (90 ngày)
export const getSellerInquiryStats = async (req, res) => {
    try {
        const seller = req.user._id;
        const now = Date.now();
        const since = new Date(now - STATS_WINDOW_MS);

        const [newCount, overdueCount, closed, responded] = await Promise.all([
            Inquiry.countDocuments({ seller, status: NEW_STATUS_FILTER }),
            Inquiry.countDocuments({
                seller,
                status: NEW_STATUS_FILTER,
                createdAt: { $lt: new Date(now - OVERDUE_MS) },
            }),
            Inquiry.aggregate([
                { $match: { seller, status: { $in: CLOSED_STATUSES }, closedAt: { $gte: since } } },
                { $group: { _id: "$status", n: { $sum: 1 } } },
            ]),
            Inquiry.find({ seller, createdAt: { $gte: since }, firstResponseAt: { $ne: null } })
                .select("createdAt firstResponseAt")
                .lean(),
        ]);

        const won = closed.find((c) => c._id === "won")?.n || 0;
        const lost = closed.find((c) => c._id === "lost")?.n || 0;

        const minutes = responded
            .map((i) => (new Date(i.firstResponseAt) - new Date(i.createdAt)) / 60000)
            .filter((m) => m >= 0)
            .sort((a, b) => a - b);
        let medianResponseMinutes = null;
        if (minutes.length) {
            const mid = Math.floor(minutes.length / 2);
            medianResponseMinutes = Math.round(
                minutes.length % 2 ? minutes[mid] : (minutes[mid - 1] + minutes[mid]) / 2,
            );
        }

        res.status(200).json({
            success: true,
            stats: {
                newCount,
                overdueCount,
                won90d: won,
                closed90d: won + lost,
                winRate90d: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null,
                medianResponseMinutes,
            },
        });
    } catch (error) {
        console.error("GET_INQUIRY_STATS_ERROR:", error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
    }
};

//buyer view inquiries they sent (không kèm ghi chú / lý do nội bộ của seller)
export const getBuyerInquiries = async (req, res) => {
    try {
        const inquiries = await Inquiry.find({
            buyer: req.user._id
        })
        .select(SELLER_PRIVATE_FIELDS)
        .populate('seller', 'name email phone profilePic')
        .populate('property', 'title price images city')
        .sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            count: inquiries.length,
            inquiries: inquiries.map((inq) => ({ ...inq.toJSON(), buyerStatus: toBuyerStatus(inq) })),
        });
    } catch (error) {
        console.error("GET_BUYER_INQUIRIES_ERROR:", error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
    }
};

//mark inquiry as read
export const markAsRead = async (req, res) => {
    try {
        const inquiry = await findOwnInquiry(req, res);
        if (!inquiry) return;
        inquiry.isRead = true;
        await inquiry.save();
        res.status(200).json({ success: true, message: 'Đã đánh dấu là đã đọc' });
    }
        catch (error) {
        console.error("MARK_INQUIRY_READ_ERROR:", error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
    }
};
