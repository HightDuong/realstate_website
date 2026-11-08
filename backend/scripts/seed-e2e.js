// Tạo (hoặc đặt lại) tài khoản dùng cho test E2E Playwright.
//   MONGODB_DB_NAME=realestate_e2e node scripts/seed-e2e.js
// Chỉ chạy trên database dev/test, không bao giờ trên production.
import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User from "../models/user.model.js";

const DB_NAME = process.env.MONGODB_DB_NAME;
export const E2E_PASSWORD = "E2e@123456";
export const E2E_ACCOUNTS = [
  { name: "E2E Admin", email: "e2e-admin@example.com", role: "admin" },
  { name: "E2E Seller", email: "e2e-seller@example.com", role: "seller", isApproved: true },
  { name: "E2E Buyer", email: "e2e-buyer@example.com", role: "buyer" },
];

const main = async () => {
  if (!DB_NAME || !/^realestate_(dev|e2e|test|ci)/.test(DB_NAME)) {
    throw new Error(`Đặt MONGODB_DB_NAME là database dev/test (vd realestate_e2e), đang là "${DB_NAME || ""}"`);
  }
  await mongoose.connect(process.env.MONGODB_URI, { dbName: DB_NAME });
  const password = await bcrypt.hash(E2E_PASSWORD, 10);
  for (const account of E2E_ACCOUNTS) {
    await User.updateOne(
      { email: account.email },
      { $set: { ...account, password, isVerified: true, isBlocked: false } },
      { upsert: true },
    );
  }
  console.log(`Đã seed ${E2E_ACCOUNTS.length} tài khoản E2E vào ${DB_NAME}`);
};

main()
  .catch((error) => {
    console.error("SEED_E2E_ERROR:", error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
