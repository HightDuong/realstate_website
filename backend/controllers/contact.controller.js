import Contact, { CONTACT_STATUSES, PENDING_CONTACT_FILTER } from "../models/contact.model.js";
import sendEmail from "../utils/sendEmail.js";
import { escapeHtml, isEmail, normalizeEmail } from "../utils/validate.js";

const ROLES = ["buyer", "seller"];

//to create a contact
export const createContact = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const phone = String(req.body.phone || "").trim();
    const role = req.body.role;
    const message = String(req.body.message || "").trim();

    if (!name || !message) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập họ tên và nội dung" });
    }
    if (!isEmail(email)) {
      return res.status(400).json({ success: false, message: "Email không hợp lệ" });
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: "Vai trò không hợp lệ" });
    }
    if (phone && !/^[0-9+\s().-]{8,20}$/.test(phone)) {
      return res.status(400).json({ success: false, message: "Số điện thoại không hợp lệ" });
    }
    if (name.length > 100 || message.length > 3000) {
      return res.status(400).json({ success: false, message: "Họ tên tối đa 100 ký tự, nội dung tối đa 3000 ký tự" });
    }

    const contact = new Contact({ name, email, phone, role, message });
    await contact.save();

    // Thông báo cho admin qua Brevo. Mọi dữ liệu người dùng đều được escape để không chèn được HTML.
    const adminEmail = process.env.EMAIL_USER;
    const adminMessage = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
                <h2 style="color: #0d9488;">Yêu cầu liên hệ mới</h2>
                <p>Bạn vừa nhận được một tin nhắn mới từ website.</p>
                <div style="background: #f8fafc; padding: 20px; border-radius: 10px; border: 1px solid #e2e8f0;">
                    <p><strong>Họ tên:</strong> ${escapeHtml(name)}</p>
                    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
                    <p><strong>Điện thoại:</strong> ${escapeHtml(phone || "Không có")}</p>
                    <p><strong>Vai trò:</strong> ${role === "seller" ? "Người bán" : "Người mua"}</p>
                    <p style="margin-top: 15px;"><strong>Nội dung:</strong></p>
                    <p style="font-style: italic; color: #475569; white-space: pre-line;">"${escapeHtml(message)}"</p>
                </div>
            </div>
        `;
    try {
      await sendEmail({
        email: adminEmail,
        subject: "Yêu cầu liên hệ mới",
        message: adminMessage,
      });
    } catch (emailErr) {
      console.error("CONTACT_EMAIL_ERROR:", emailErr);
    }
    res.status(201).json({
      success: true,
      message: "Đã gửi tin nhắn thành công! Chúng tôi sẽ phản hồi sớm.",
    });
  } catch (error) {
    console.error("CREATE_CONTACT_ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi gửi liên hệ",
    });
  }
};

// Admin xem thư liên hệ. Query: status = pending | resolved | all (mặc định all).
// Luôn trả kèm số lượng từng nhóm để hiển thị trên bộ lọc.
const STATUS_FILTERS = { pending: PENDING_CONTACT_FILTER, resolved: "resolved" };

export const getAllContacts = async (req, res) => {
  try {
    const status = String(req.query.status || "all");
    if (status !== "all" && !Object.hasOwn(STATUS_FILTERS, status)) {
      return res.status(400).json({ success: false, message: "Bộ lọc trạng thái không hợp lệ" });
    }
    const filter = status === "all" ? {} : { status: STATUS_FILTERS[status] };
    const [contacts, pending, resolved] = await Promise.all([
      Contact.find(filter).populate("resolvedBy", "name").sort({ createdAt: -1 }),
      Contact.countDocuments({ status: PENDING_CONTACT_FILTER }),
      Contact.countDocuments({ status: "resolved" }),
    ]);
    res.status(200).json({
      success: true,
      data: contacts,
      counts: { all: pending + resolved, pending, resolved },
    });
  } catch (error) {
    console.error("GET_CONTACTS_ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi lấy danh sách liên hệ",
    });
  }
};

// Admin đánh dấu đã xử lý / mở lại: { status: "resolved" | "pending" }
export const updateContactStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!CONTACT_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: "Trạng thái không hợp lệ" });
    }
    const update =
      status === "resolved"
        ? { status, resolvedAt: new Date(), resolvedBy: req.user._id }
        : { status, resolvedAt: null, resolvedBy: null };
    const contact = await Contact.findByIdAndUpdate(req.params.id, update, { returnDocument: "after" })
      .populate("resolvedBy", "name");
    if (!contact) {
      return res.status(404).json({ success: false, message: "Không tìm thấy thư liên hệ" });
    }
    res.json({
      success: true,
      message: status === "resolved" ? "Đã đánh dấu thư là đã xử lý" : "Đã chuyển thư về chờ xử lý",
      data: contact,
    });
  } catch (error) {
    console.error("UPDATE_CONTACT_STATUS_ERROR:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ khi cập nhật trạng thái liên hệ" });
  }
};
