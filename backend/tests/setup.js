// Chuẩn bị môi trường test: database riêng (bị xóa trước & sau khi chạy), tắt AI/email, seed tài khoản.
import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

// Không gọi OpenAI / Brevo thật khi test
process.env.AI_ENABLED = "false";
process.env.BREVO_API_KEY = "";
process.env.API_RATE_LIMIT = "100000";
process.env.JWT_SECRET ||= "test-secret";

const DB_NAME = process.env.TEST_DB_NAME || "realestate_test";
// Chốt an toàn: database production tên "test" — tuyệt đối không chạy test trên đó
if (!/^realestate_(test|ci)/.test(DB_NAME)) {
  throw new Error(`TEST_DB_NAME phải bắt đầu bằng "realestate_test" hoặc "realestate_ci" (đang là "${DB_NAME}")`);
}
if (!process.env.MONGODB_URI) throw new Error("Thiếu MONGODB_URI");

export const PASSWORD = "Test@123456";

export const connectTestDb = async () => {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: DB_NAME });
  if (mongoose.connection.name !== DB_NAME) throw new Error("Kết nối sai database");
  await mongoose.connection.dropDatabase();
};

export const disconnectTestDb = async () => {
  if (mongoose.connection.name === DB_NAME) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
};

// Tạo các tài khoản mẫu, trả về { admin, seller, pendingSeller, buyer, buyer2 } (document User)
export const seedUsers = async () => {
  const { default: User } = await import("../models/user.model.js");
  const hash = await bcrypt.hash(PASSWORD, 10);
  const base = { password: hash, isVerified: true };
  const [admin, seller, pendingSeller, buyer, buyer2] = await User.create([
    { ...base, name: "Admin Test", email: "admin@test.vn", role: "admin" },
    { ...base, name: "Seller Test", email: "seller@test.vn", role: "seller", isApproved: true },
    { ...base, name: "Seller Chờ Duyệt", email: "pending@test.vn", role: "seller", isApproved: false },
    { ...base, name: "Buyer Test", email: "buyer@test.vn", role: "buyer" },
    { ...base, name: "Buyer Hai", email: "buyer2@test.vn", role: "buyer" },
  ]);
  return { admin, seller, pendingSeller, buyer, buyer2 };
};
