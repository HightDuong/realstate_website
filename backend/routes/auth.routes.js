import express from "express";
import {
  register,
  login,
  getMe,
  verifyEmail,
  forgotPassword,
  resetPassword,
} from "../controllers/auth.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { rateLimit } from "../utils/rateLimit.js";
import { normalizeEmail } from "../utils/validate.js";

const authRouter = express.Router();

// Chống dò mật khẩu: tối đa 10 lần đăng nhập SAI / 15 phút cho mỗi cặp IP + email,
// và 50 lần / 15 phút cho mỗi IP
const loginLimiterPerAccount = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: (req) => `${req.ip}|${normalizeEmail(req.body?.email) || ""}`,
  skipSuccessful: true,
  message: "Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.",
});
const loginLimiterPerIp = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  skipSuccessful: true,
  message: "Quá nhiều yêu cầu đăng nhập. Vui lòng thử lại sau 15 phút.",
});
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Bạn thao tác quá nhiều lần. Vui lòng thử lại sau 15 phút.",
});

authRouter.post("/register", otpLimiter, register);
authRouter.post("/login", loginLimiterPerIp, loginLimiterPerAccount, login);

authRouter.get("/me", protect, getMe);
authRouter.post("/verify-email", otpLimiter, verifyEmail);

authRouter.post("/forgot-password", otpLimiter, forgotPassword);
authRouter.post("/reset-password/:token", otpLimiter, resetPassword);
export default authRouter;
