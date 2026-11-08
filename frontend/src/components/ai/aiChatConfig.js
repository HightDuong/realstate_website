// Các trang hiển thị nút trợ lý AI (trang duyệt bất động sản công khai)
export const shouldShowAiChat = (pathname) =>
  pathname === "/" ||
  pathname === "/properties" ||
  pathname.startsWith("/property/");

// Lấy id tin đăng khi đang ở trang chi tiết, để trợ lý hiểu "căn này"
export const getContextPropertyId = (pathname) => {
  const match = pathname.match(/^\/property\/([a-f0-9]{24})$/i);
  return match ? match[1] : null;
};

// Sự kiện báo trang /properties tải lại mục "Có thể bạn quan tâm"
export const AI_INTEREST_EVENT = "ai-interest-updated";

// Mở khung chat RealEstate từ nơi khác (vd ô "Hỏi RealEstate" trong mục gợi ý)
export const OPEN_AI_CHAT_EVENT = "open-ai-chat";

// Ghi nguồn icon robot (bắt buộc với giấy phép miễn phí của Flaticon).
// Điền tên tác giả hiển thị trên trang icon vào `author`.
export const ROBOT_ICON_CREDIT = {
  author: "",
  url: "https://www.flaticon.com/free-icon/robot_18355220",
};

export const SUGGESTIONS = [
  "Căn hộ yên tĩnh cho gia đình có con nhỏ",
  "Nhà gần biển dưới 5 tỷ",
  "Văn phòng trung tâm Đà Nẵng",
  "Biệt thự có hồ bơi",
];
