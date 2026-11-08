// Điền trạng thái pipeline cho yêu cầu tư vấn cũ (spec mục 12.2).
//   MONGODB_DB_NAME=realestate_dev node scripts/migrate-inquiry-status.js
//   node scripts/migrate-inquiry-status.js --dry-run       → chỉ đếm, không ghi
// Database production ("test") chỉ chạy khi thêm --production (chủ dự án đã xác nhận).
// Ứng dụng vẫn chạy đúng khi chưa migrate: bản ghi thiếu `status` được coi là "new".
import "dotenv/config";
import mongoose from "mongoose";
import { getDbOptions } from "../config/db.js";
import Inquiry from "../models/inquiry.model.js";

const DRY_RUN = process.argv.includes("--dry-run");
const ALLOW_PRODUCTION = process.argv.includes("--production");

const main = async () => {
  await mongoose.connect(process.env.MONGODB_URI, getDbOptions());
  const dbName = mongoose.connection.name;
  console.log(`Database: ${dbName}${DRY_RUN ? " (dry-run)" : ""}`);
  if (dbName === "test" && !ALLOW_PRODUCTION && !DRY_RUN) {
    throw new Error('Đây là database production "test". Thêm --production nếu chắc chắn muốn chạy.');
  }

  const filter = { status: { $exists: false } };
  const count = await Inquiry.countDocuments(filter);
  console.log(`Yêu cầu chưa có trạng thái: ${count}`);
  if (DRY_RUN || count === 0) return;

  // Lịch sử bắt đầu bằng mốc tạo yêu cầu
  const result = await Inquiry.collection.updateMany(filter, [
    {
      $set: {
        status: "new",
        sellerNote: "",
        lostReason: null,
        lostNote: "",
        statusHistory: [{ status: "new", at: "$createdAt", by: "$buyer", auto: false }],
      },
    },
  ]);
  console.log(`Đã cập nhật: ${result.modifiedCount}`);
};

main()
  .catch((error) => {
    console.error("MIGRATE_INQUIRY_STATUS_ERROR:", error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
