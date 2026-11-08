import mongoose from 'mongoose'

// Trạng thái xử lý của admin. Thư cũ chưa có field `status` được coi là "pending" (dùng PENDING_CONTACT_FILTER khi lọc).
export const CONTACT_STATUSES = ['pending', 'resolved'];
export const PENDING_CONTACT_FILTER = { $in: ['pending', null] };

const contactSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    phone: {
        type: String,
    },
    role: {
        type: String,
        enum: ['buyer', 'seller'],
        required: true
    },
    message: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: CONTACT_STATUSES,
        default: 'pending'
    },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true })

contactSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Contact', contactSchema);
