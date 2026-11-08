---
paths:
  - "frontend/src/**/*.{js,jsx}"
---

# Quy tắc frontend

- Gọi API: `axios.<method>(\`${API_URL}api/...\`, data, { headers: { Authorization: \`Bearer ${token}\` } })`,
  với `API_URL` import từ `src/config.js` (đã có `/` ở cuối) và `token` lấy từ `useAuth()`.
- Không hardcode URL backend (localhost hay Render) trong component.
- Tailwind v4: chỉ dùng tên màu custom đã khai báo trong `@theme` của `src/index.css` (`primary`, `text-main`, `bg-alt`…).
  Màu khác dùng arbitrary hex: `text-[#0f172a]`, `bg-gradient-to-r from-[#2563eb] to-[#7c3aed]`.
- Phần tử `sticky` nằm trong grid/flex cần thêm `self-start`. Phần tử cha không được có `overflow: hidden`.
- Responsive mobile-first (`sm:`, `md:`, `lg:`). Mọi trang mới phải dùng được ở độ rộng 375px.
- Text hiển thị cho người dùng viết bằng tiếng Việt.
- Trang mới:
  1. Đặt trong `src/pages/<vai trò>/`
  2. Khai báo `<Route>` trong `App.jsx` **trong đúng nhóm** `ProtectedRoute allowedRoles` / `SellerLayout` / `AdminLayout`
  3. Thêm link vào `SellerSidebar.jsx` / `AdminSidebar.jsx` / `Navbar.jsx` nếu cần
- Luôn xử lý 3 trạng thái: loading, lỗi (`error.response?.data?.message`) và rỗng.
- Icon dùng `react-icons/hi` hoặc `react-icons/fa`.
- Sau khi sửa, chạy `npm run build` trong `frontend/` để chắc chắn không lỗi.
