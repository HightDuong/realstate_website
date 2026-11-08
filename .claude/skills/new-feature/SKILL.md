---
name: new-feature
description: Thêm một tính năng fullstack mới (model → controller → route → trang React) theo đúng cấu trúc dự án. Dùng khi người dùng yêu cầu thêm chức năng mới, ví dụ đánh giá người bán, hẹn lịch xem nhà, tin VIP.
---

# Thêm tính năng fullstack

Đầu vào: mô tả tính năng: $ARGUMENTS

## 1. Xác định phạm vi
- Đối chiếu với `spec.md` (mục 3 và roadmap 5.2) để biết vai trò nào dùng tính năng này.
- Liệt kê: model mới hay field mới, các endpoint (method + path + role), các trang frontend cần đổi.
- Nếu yêu cầu còn mơ hồ (ai được làm gì) thì hỏi lại trước khi code.

## 2. Backend
1. **Model** `backend/models/<tên>.model.js`: Mongoose schema với `{ timestamps: true }`, dùng `ref: "User"` / `ref: "Property"` cho quan hệ.
2. **Controller** `backend/controllers/<tên>.controller.js`: mỗi hàm `export const`, bọc `try/catch`, message tiếng Việt.
3. **Route** `backend/routes/<tên>.routes.js`: gắn `protect` và `authorize(...)`. Route tĩnh khai báo trước `/:id`.
4. **server.js**: `app.use("/api/<tên>", <tên>Routes)`.
5. Nếu admin cần giám sát tính năng này, thêm endpoint vào `admin.routes.js` / `admin.controller.js`.

## 3. Frontend
1. Trang mới trong `frontend/src/pages/<vai trò>/`.
2. Khai báo route trong `App.jsx`, đặt trong đúng nhóm `ProtectedRoute allowedRoles`.
3. Thêm link điều hướng (`SellerSidebar`, `AdminSidebar`, `Navbar`).
4. Gọi API bằng `${API_URL}api/<tên>` kèm header Bearer token.
5. Tailwind dùng mã hex, responsive, xử lý loading/lỗi/rỗng.

## 4. Kiểm tra
- `cd frontend && npm run build` và `npm run lint`.
- `cd backend && node --check server.js` cùng các file mới.
- Gọi subagent `code-reviewer` để review diff.
- Cập nhật `spec.md` (bảng model ở mục 4 và danh sách tính năng) nếu tính năng đã hoàn thành.
