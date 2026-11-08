
---
paths:
  - "backend/**/*.js"
---

# Quy tắc backend

- ES Module: `import x from "./file.js"`, luôn có đuôi `.js`. Không dùng `require`.
- Mỗi route mới cần có:
  1. Hàm controller trong `controllers/<tên>.controller.js`, export dạng `export const tenHam = async (req, res) => {...}`
  2. Khai báo trong `routes/<tên>.routes.js`, kèm `protect` và `authorize(...roles)` nếu cần đăng nhập
  3. Nếu là router mới: `app.use("/api/<tên>", router)` trong `server.js`
- Route có tham số (`/:id`) phải khai báo **sau** các route tĩnh cùng prefix (`/my`, `/count`, `/seller/dashboard`).
- Kiểm tra quyền sở hữu: seller chỉ được sửa/xóa tài nguyên có `seller` trùng với `req.user._id`
  (so sánh bằng `.toString()` hoặc `.equals()`).
- Kiểm tra `mongoose.Types.ObjectId.isValid(id)` trước khi query theo id từ request.
- Dữ liệu từ form multipart (`req.body`) đều là string: ép kiểu `Number(...)`, parse `amenities` (JSON hoặc chuỗi phân tách bằng dấu phẩy).
- Không trả `password`, `verificationToken`, `resetPasswordToken` về client (`.select("-password ...")`).
- Mật khẩu: `bcryptjs` với salt 10. Token: `jwt.sign({ id }, process.env.JWT_SECRET, ...)`.
- Ảnh: dùng `uploadToCloudinary(buffer, folder)`, không lưu file cục bộ.
- Response: `{ message: "<tiếng Việt>" }` cho lỗi. Status 400/401/403/404/500 đúng ngữ nghĩa.
- Log lỗi bằng `console.error("TEN_HANH_DONG_ERROR:", error)`.
