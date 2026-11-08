import mongoose from 'mongoose'

// Pipeline xử lý khách (spec mục 12.2). Bản ghi cũ chưa có `status` được coi là "new".
export const INQUIRY_STATUSES = ["new", "contacted", "viewing_scheduled", "won", "lost"];
export const LOST_REASONS = ["price", "bought_elsewhere", "not_suitable", "no_response", "other"];
export const CLOSED_STATUSES = ["won", "lost"];
// Số mục lịch sử trạng thái giữ lại cho mỗi yêu cầu
export const STATUS_HISTORY_LIMIT = 20;
// Các field chỉ seller (và admin) được thấy
export const SELLER_PRIVATE_FIELDS = "-sellerNote -lostReason -lostNote -statusHistory";

const statusHistorySchema = new mongoose.Schema({
    status: { type: String, enum: INQUIRY_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // true: hệ thống tự chuyển (vd seller trả lời chat lần đầu)
    auto: { type: Boolean, default: false },
}, { _id: false });

const inquirySchema = new mongoose.Schema({
    property: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Property',
        required: true,
    },
    buyer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    isRead: {
        type: Boolean,
        default: false,
    },
    status: {
        type: String,
        enum: INQUIRY_STATUSES,
        default: "new",
    },
    sellerNote: { type: String, default: "", maxlength: 1000 },
    lostReason: { type: String, enum: [...LOST_REASONS, null], default: null },
    lostNote: { type: String, default: "", maxlength: 300 },
    // lần đầu seller phản hồi (tin nhắn chat đầu tiên hoặc đổi trạng thái khỏi "new")
    firstResponseAt: { type: Date },
    closedAt: { type: Date },
    statusHistory: { type: [statusHistorySchema], default: [] },
}, { timestamps: true });

inquirySchema.index({ seller: 1, status: 1, createdAt: -1 });
inquirySchema.index({ buyer: 1, createdAt: -1 });
inquirySchema.index({ property: 1, buyer: 1, seller: 1 });

const Inquiry = mongoose.model('Inquiry', inquirySchema);
export default Inquiry;
