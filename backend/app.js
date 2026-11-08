import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import propertyRoutes from "./routes/property.routes.js";
import inquiryRoutes from "./routes/inquiry.routes.js";
import wishlistRoutes from "./routes/wishlist.routes.js";
import chatRouter from "./routes/chat.routes.js";
import contactRoutes from "./routes/contact.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import { rateLimit } from "./utils/rateLimit.js";

// ====================== CORS ORIGINS ======================
export const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://realstate-website-eight.vercel.app",
];
// Xử lý FRONTEND_URL từ biến môi trường
if (process.env.FRONTEND_URL) {
  const cleanUrl = process.env.FRONTEND_URL.replace(/\/+$/, "");
  allowedOrigins.push(cleanUrl, cleanUrl + "/");
}

const app = express();
// Render chạy sau proxy: cần để req.ip là IP thật của người dùng (đếm lượt xem, hạn mức chatbot, rate limit)
app.set("trust proxy", 1);

// Header bảo mật (API thuần JSON nên không cần CSP cho HTML; cho phép ảnh/tài nguyên dùng từ domain frontend)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log("❌ Blocked by CORS - Origin:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  }),
);

app.use(express.json({ limit: "1mb" }));

// Giới hạn chung cho toàn API: 300 request / phút / IP (chặn spam, cào dữ liệu).
// Các API nhạy cảm (đăng nhập, OTP, liên hệ, chatbot) có giới hạn chặt hơn riêng.
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.API_RATE_LIMIT) || 300,
    message: "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít giây.",
  }),
);

// ====================== ROUTES ======================
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/property", propertyRoutes);
app.use("/api/inquiry", inquiryRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/chat", chatRouter);
app.use("/api/ai", aiRoutes);
app.use("/api/notifications", notificationRoutes);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

// API không tồn tại
app.use("/api", (req, res) => {
  res.status(404).json({ message: "API không tồn tại" });
});

// Lỗi chưa được bắt (vd JSON body sai cú pháp, file upload không hợp lệ) → không lộ stack trace
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Dữ liệu gửi lên không đúng định dạng JSON" });
  }
  if (err.name === "MulterError") {
    return res.status(400).json({ message: "Tệp tải lên không hợp lệ hoặc quá lớn" });
  }
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ message: "Nguồn truy cập không được phép" });
  }
  console.error("UNHANDLED_ERROR:", err);
  res.status(500).json({ message: "Lỗi máy chủ" });
});

export default app;
