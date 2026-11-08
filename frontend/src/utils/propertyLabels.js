// Nhãn tiếng Việt cho các giá trị enum của tin đăng (backend lưu bằng tiếng Anh)

export const PROPERTY_TYPE_LABELS = {
  flat: "Căn hộ / Chung cư",
  apartment: "Căn hộ",
  villa: "Nhà riêng / Biệt thự",
  house: "Nhà phố",
  studio: "Studio",
  penthouse: "Penthouse",
  office: "Văn phòng",
  townhouse: "Nhà liền kề",
  plot: "Đất nền",
  commercial: "Thương mại / Văn phòng",
};

export const FURNISHING_LABELS = {
  unfurnished: "Nhà trống",
  "semi-furnished": "Nội thất cơ bản",
  furnished: "Nội thất đầy đủ",
};

export const STATUS_LABELS = {
  sale: "Đang mở bán",
  sold: "Đã bán",
};

// Trạng thái kiểm duyệt. Tin cũ (không có moderationStatus) vẫn hiển thị công khai.
export const MODERATION_LABELS = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Bị từ chối",
  legacy: "Tin cũ – chưa kiểm duyệt",
};
export const getModerationStatus = (property) => property?.moderationStatus || "legacy";

export const getPropertyTypeLabel = (type) =>
  PROPERTY_TYPE_LABELS[type] || type || "Chưa rõ";

export const getFurnishingLabel = (value) =>
  FURNISHING_LABELS[value] || value || "Chưa cập nhật";

export const getStatusLabel = (status) => STATUS_LABELS[status] || status || "";

// "4200000000" → "4.200.000.000 ₫"
export const formatVND = (price) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(price) || 0);

// Ghép địa chỉ, bỏ phần trống và khoảng trắng thừa: ["Cầu Giấy ", "Hà Nội"] → "Cầu Giấy, Hà Nội"
export const joinAddress = (...parts) =>
  parts
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .filter((p, i, arr) => arr.findIndex((x) => x.toLowerCase() === p.toLowerCase()) === i)
    .join(", ");

// Pipeline yêu cầu tư vấn (spec mục 12.2). Bản ghi cũ không có status = "new".
export const INQUIRY_STATUS_LABELS = {
  new: "Mới",
  contacted: "Đang trao đổi",
  viewing_scheduled: "Đã hẹn xem",
  won: "Đã chốt",
  lost: "Không tiếp tục",
};
export const INQUIRY_STATUS_ORDER = ["new", "contacted", "viewing_scheduled", "won", "lost"];
export const getInquiryStatus = (inquiry) => inquiry?.status || "new";

// Nhãn phía người mua: không phân biệt "đã chốt" / "không tiếp tục"
export const BUYER_INQUIRY_STATUS_LABELS = {
  sent: "Đã gửi",
  seen: "Người bán đã xem",
  contacted: "Đang trao đổi",
  viewing_scheduled: "Đã hẹn xem",
  closed: "Đã kết thúc",
};

export const LOST_REASON_LABELS = {
  price: "Giá chưa phù hợp",
  bought_elsewhere: "Đã mua / thuê nơi khác",
  not_suitable: "Nhà không phù hợp nhu cầu",
  no_response: "Khách không phản hồi",
  other: "Lý do khác",
};
