# CLAUDE.md

Sàn giao dịch bất động sản fullstack với 3 vai trò `buyer` / `seller` / `admin`.
Đặc tả nghiệp vụ đầy đủ: [spec.md](spec.md). File này chỉ ghi những gì cần để làm việc với code.

## Cấu trúc

```
backend/   Node.js + Express 5 (ES Module), Mongoose 9, Socket.io 4  → deploy Render
frontend/  React 19 + Vite 8 + Tailwind v4 + react-router-dom v7     → deploy Vercel
```

Hai thư mục là hai package độc lập, mỗi bên có `package.json` và `node_modules` riêng.
Test: backend `npm test` (node:test + Supertest, database `realestate_test`), frontend `npm run test:e2e` (Playwright). CI: `.github/workflows/ci.yml`.

## Lệnh

```bash
# Backend (cổng 5000)
cd backend && npm run dev      # nodemon server.js — database realestate_dev (nodemon.json)
cd backend && npm start        # production: database trong MONGODB_URI ("test")
cd backend && npm test         # test API, tự tạo/xóa database realestate_test
cd backend && node scripts/copy-db.js --drop   # chép dữ liệu production → realestate_dev (chỉ đọc production)
cd backend && node scripts/migrate-inquiry-status.js --dry-run   # điền status cho yêu cầu tư vấn cũ (production cần --production)
cd backend && node scripts/seed-demo.js           # dữ liệu demo (tài khoản @demo.example.com, mật khẩu 123456) trên realestate_dev; --reset gỡ, --dry-run xem trước

# Frontend (cổng 5173)
cd frontend && npm run dev
cd frontend && npm run build   # luôn chạy để kiểm tra trước khi coi việc sửa frontend là xong
cd frontend && npm run lint
cd frontend && npm run test:e2e  # Playwright, xem playwright.config.js để dựng server E2E riêng
```

## Biến môi trường

Backend `backend/.env` (xem [backend/.env.example](backend/.env.example)):
`PORT`, `MONGODB_URI`, `JWT_SECRET`, `FRONTEND_URL`, `CLOUDINARY_CLOUD_NAME`,
`CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `BREVO_API_KEY`, `EMAIL_USER`.
AI (tùy chọn): `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL`, `OPENAI_EMBEDDING_MODEL`, `OPENAI_REASONING_EFFORT`, `OPENAI_MODERATION_MODEL`, `OPENAI_LISTING_MODEL`, `AI_ENABLED`, `AI_USER_DAILY_LIMIT`.
Database/test: `MONGODB_DB_NAME` (chọn database trên cùng cluster), `API_RATE_LIMIT`, `TEST_DB_NAME`.
Thiếu `OPENAI_API_KEY` thì tính năng AI tự tắt, server vẫn chạy.

Frontend: `VITE_API_URL` (tùy chọn). Nếu không đặt: `npm run dev` gọi `http://localhost:5000/`,
bản build production gọi backend trên Render ([frontend/src/config.js](frontend/src/config.js)).
Trên Windows PowerShell 5.1, đừng tạo file `.env*` bằng `Set-Content -Encoding utf8`: lệnh này ghi thêm BOM và Vite sẽ không đọc được biến đầu tiên.

Không đọc, in ra hoặc commit file `.env`.

## Backend: luồng request

`routes/*.routes.js` → middleware → `controllers/*.controller.js` → `models/*.model.js`

- Prefix API: `/api/auth`, `/api/user`, `/api/property`, `/api/inquiry`, `/api/wishlist`,
  `/api/contact`, `/api/admin`, `/api/chat`, `/api/ai` (đăng ký trong [backend/server.js](backend/server.js)).
- Phân quyền: `protect` (giải JWT, gán `req.user`, chặn user `isBlocked`) rồi đến `authorize("seller")`…
  trong [auth.middleware.js](backend/middlewares/auth.middleware.js). `optionalAuth` dùng cho API mà khách cũng gọi được (chatbot AI).
- Bộ lọc bất động sản: dùng `buildPropertyQuery()` / `buildPropertySort()` trong [utils/propertyQuery.js](backend/utils/propertyQuery.js)
  (dùng chung cho `GET /api/property` và chatbot). Không tự viết lại logic lọc, không đưa chuỗi người dùng nhập vào `RegExp` khi chưa escape.
- AI (OpenAI) nằm trong [backend/ai/](backend/ai/):
  - Dùng Chat Completions + function calling `strict`.
  - Với `gpt-5.4-mini`, **không** kết hợp tool với `reasoning_effort` khác `"none"` (API trả lỗi 400).
  - `Property.embedding` có `select: false`. Tạo hoặc sửa tin thì gọi `scheduleEmbedProperty(id)`;
    riêng tin đang `pending` thì gọi `scheduleModerationReview(id)` (đã gồm embedding, không gọi cả hai).
  - Tin cũ chưa có embedding: chạy `node scripts/embed-properties.js`.
  - AI hỗ trợ kiểm duyệt (spec mục 11.5): kiểm tra bằng code ở [utils/moderationRules.js](backend/utils/moderationRules.js) (hàm thuần),
    điều phối ở [utils/moderationReview.js](backend/utils/moderationReview.js), lần gọi AI (Structured Outputs, có ảnh) ở `ai/moderationAi.js`.
    Mức độ cảnh báo và điểm do code tính, AI chỉ trả mã + lý do + bằng chứng. Kết quả (`ModerationReview`) chỉ trả qua API admin;
    không có đường nào tự duyệt/từ chối tin.
  - AI viết tin (spec mục 11.6): `ai/listingWriter.js`, `controllers/aiListing.controller.js`, hạn mức `utils/listingDraftQuota.js`
    (20 lượt/ngày, admin cấp thêm). Route kiểm tra duyệt + lượt **trước** `draftImages`; ảnh chỉ nằm trong bộ nhớ, không lên Cloudinary.
    Kết quả AI luôn qua `stripContactInfo()` (dùng chung regex với kiểm duyệt). AI chỉ trả nháp, không tự lưu tin.
- Upload ảnh: `upload.array('images', 10)` (multer memoryStorage) → `uploadToCloudinary(file.buffer)`
  → lưu `result.secure_url`. Không ghi file xuống ổ đĩa.
- Email/OTP: [utils/sendEmail.js](backend/utils/sendEmail.js) gọi Brevo REST API bằng `fetch`.
- Socket.io (trong `server.js`): sự kiện `joinChat(chatId)`, `sendMessage(data)` → `socket.broadcast.to(chatId).emit("newMessage", data)`.
  Tin nhắn được lưu qua REST `/api/chat`, socket chỉ để phát realtime.
- Origin cho CORS được hardcode trong `server.js` và cộng thêm `FRONTEND_URL`. Thêm domain mới thì sửa ở đó.

## Frontend: quy ước

- URL API: `${API_URL}api/...`. `API_URL` **đã có dấu `/` ở cuối**, nên không thêm `/` trước `api`.
- Auth: `useAuth()` từ [AuthContext.jsx](frontend/src/context/AuthContext.jsx); token và user nằm trong `localStorage`.
  Gửi header `Authorization: Bearer <token>`.
- Chat: `ChatContext.jsx` (socket.io-client).
- Định tuyến và phân quyền nằm trong [App.jsx](frontend/src/App.jsx): `PublicRoute`, `ProtectedRoute allowedRoles={[...]}`,
  `SellerLayout`, `AdminLayout`. Trang mới phải được đặt vào đúng nhóm route theo vai trò.
- Trang chia theo vai trò trong `src/pages/{auth,buyer,seller,admin,shared}`.
- Icon: `react-icons` (`Hi`, `Fa`).

## Quy tắc quan trọng

- **Tailwind v4 không đọc `tailwind.config.js`.** Màu/shadow theme (`primary`, `text-main`, `bg-alt`, `border`, `shadow-card`…)
  được khai báo trong khối `@theme` ở [index.css](frontend/src/index.css). Chỉ dùng tên màu custom có trong khối đó;
  màu mới thì thêm vào `@theme` hoặc dùng hex arbitrary (`bg-[#1e3a8a]`). Không thêm `tailwindcss` vào `postcss.config.js`.
- Không đặt `overflow-x: hidden` cho `html`/`body` hoặc phần tử cha của thành phần `sticky`. Dùng `overflow-x: clip`.
- Thông báo trả về cho người dùng (`message` trong JSON response, text UI) viết bằng **tiếng Việt**.
- Response lỗi theo dạng `res.status(xxx).json({ message: "..." })`. Mỗi controller bọc `try/catch`.
- Backend là ES Module: dùng `import`/`export` và **luôn ghi đuôi `.js`** trong đường dẫn import.
- Seller mới có `isApproved: false`. Route ghi dữ liệu của seller phải có `protect, authorize("seller"), requireApproved`
  (đặt `requireApproved` **trước** `upload` để không tải ảnh lên Cloudinary khi bị chặn).
- Trường nhạy cảm của User (`password`, `verificationToken`, `resetPasswordToken`, `resetPasswordExpires`) bị ẩn bằng
  transform `toJSON` trong [user.model.js](backend/models/user.model.js). Không dùng `.lean()` khi trả user về client, vì `.lean()` bỏ qua transform này.
- Kiểm tra đầu vào bằng [utils/validate.js](backend/utils/validate.js): route có `/:id` dùng `validateIdParams("id")`
  (id sai → 400, không để CastError thành 500); tin đăng dùng `validatePropertyInput()`. Lỗi 500 không trả `error.message` về client.
- Xóa tin (seller hay admin) **luôn** qua `deletePropertyCascade()` trong [utils/propertyCleanup.js](backend/utils/propertyCleanup.js)
  (xóa ảnh Cloudinary, wishlist, inquiry, lượt xem; chat được giữ lại). Ảnh tin đăng upload vào folder `properties`.
- `Property.viewedBy` có `select: false` (chứa IP/id người xem), không trả về client.
- Admin không được khóa/xóa chính mình hoặc admin khác. Đăng ký chỉ cho role `buyer`/`seller`.
- Email user lưu chữ thường (`lowercase` trong schema); khi query theo email dùng `normalizeEmail()`.
- Nhãn tiếng Việt cho enum (loại BĐS, nội thất, trạng thái), định dạng giá, ghép địa chỉ: [utils/propertyLabels.js](frontend/src/utils/propertyLabels.js).
  Không hiển thị giá trị enum thô (`flat`, `sale`…) trên giao diện.
- Kiểm duyệt tin (`moderationStatus`: pending/approved/rejected, tin cũ không có field = vẫn hiển thị): mọi truy vấn tin **công khai** phải dùng `buildPropertyQuery()` hoặc `PUBLIC_VISIBILITY` trong `utils/propertyQuery.js`. Nhãn "Đã kiểm duyệt" = `isVerified` (đặt khi admin duyệt). Xem spec mục 3.8.
- Thông báo: dùng `notifyUser()` / `notifyAdmins()` trong `utils/notify.js` (lưu DB + đẩy socket phòng `user:<id>`). Socket bắt buộc JWT (`utils/chatSocket.js`); frontend kết nối bằng `io(API_URL, { auth: { token } })`.
- Yêu cầu tư vấn có pipeline `status` (spec mục 12.2). Bản ghi cũ có thể thiếu `status`: lọc "mới" phải dùng `NEW_STATUS_FILTER` trong `utils/inquiryPipeline.js`.
  API của buyer không bao giờ trả `sellerNote`/`lostReason`/`lostNote`/`statusHistory` (dùng `SELLER_PRIVATE_FIELDS`).
- Không bao giờ chạy script ghi dữ liệu hay test trên database `test` (production). Test dùng `realestate_test`/`realestate_ci`, E2E dùng `realestate_e2e`.
- Rate limit: [utils/rateLimit.js](backend/utils/rateLimit.js) (bộ nhớ trong, 1 instance) cho login, OTP và form liên hệ.
- Khi thêm field vào model, cập nhật cả controller (`create`/`update`) và form frontend tương ứng
  (vd. `AddProperty.jsx` **và** `EditProperty.jsx`).
- Không đổi tên sự kiện socket hay prefix API nếu không sửa đồng thời cả frontend.

## Quy ước API đáng chú ý

- Tên field id trong body request dùng camelCase: `propertyId`, `sellerId`, `buyerId` (không dùng `propertyID`).
- Chat `/api/chat/start` luôn cần `propertyId` có thật; seller của chat luôn là chủ tin (không tin `sellerId` từ client).
- User bị khóa: `protect` (và `login`) trả về `403 { code: "ACCOUNT_BLOCKED", message }`. Frontend dựa vào `code`
  (không dựa vào `message`) để tự động đăng xuất.
- Mỗi chat gắn với bộ ba (buyer, seller, property).
