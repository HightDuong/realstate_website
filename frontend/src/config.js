// Thứ tự ưu tiên:
// 1. VITE_API_URL (nếu có trong .env.local / biến môi trường Vercel)
// 2. Chạy `npm run dev` → backend local
// 3. Bản build production → backend trên Render
const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV
    ? "http://localhost:5000/"
    : "https://realstate-website-5jpt.onrender.com/");

export default API_URL;
