---
name: pre-deploy
description: Kiểm tra trước khi deploy frontend lên Vercel và backend lên Render. Dùng khi người dùng nói chuẩn bị deploy, push lên production hoặc hỏi "deploy được chưa".
disable-model-invocation: true
---

# Checklist trước khi deploy

Chạy lần lượt từng bước và báo cáo kết quả (đạt / không đạt) cho mỗi bước.

1. **Git**: `git status`. Không có file `.env` hay `node_modules` bị stage, và không còn thay đổi dở dang.
2. **Cú pháp backend**: `node --check` với `backend/server.js` và mọi file `.js` đã sửa trong `backend/` (lấy danh sách qua `git diff --name-only`).
3. **Build frontend**: `cd frontend && npm run build`, phải thành công.
4. **Lint frontend**: `cd frontend && npm run lint`. Báo lỗi, không bắt buộc sửa warning.
5. **Không hardcode URL**: grep `localhost:5000` trong `frontend/src`. Chỉ được xuất hiện trong comment.
6. **CORS**: nếu domain frontend thay đổi, kiểm tra `allowedOrigins` trong `backend/server.js` và biến `FRONTEND_URL` trên Render.
7. **Biến môi trường**: so sánh các `process.env.X` đang dùng trong code với `backend/.env.example`. Báo biến mới chưa có trong file example (để người dùng thêm vào Render).
   Không đọc file `.env` thật.

Kết luận: "Sẵn sàng deploy" hoặc danh sách việc cần sửa. Không tự chạy `git push`.
