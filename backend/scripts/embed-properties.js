// Tạo embedding cho các tin đăng chưa có (chạy 1 lần sau khi bật chatbot, hoặc khi đổi model embedding).
//   node scripts/embed-properties.js          → chỉ tin chưa có embedding / khác model hiện tại
//   node scripts/embed-properties.js --all    → tạo lại cho toàn bộ tin
import "dotenv/config";
import mongoose from "mongoose";
import { getDbOptions } from "../config/db.js";
import Property from "../models/property.model.js";
import { EMBEDDING_MODEL, isAiEnabled } from "../ai/openaiClient.js";
import { buildPropertyText, embedTexts } from "../ai/embeddings.js";

const BATCH_SIZE = 50;
const all = process.argv.includes("--all");

const main = async () => {
  if (!isAiEnabled()) {
    console.error("Thiếu OPENAI_API_KEY (hoặc AI_ENABLED=false) trong backend/.env");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI, getDbOptions());

  const filter = all
    ? {}
    : {
        $or: [
          { embedding: { $exists: false } },
          { embeddingModel: { $ne: EMBEDDING_MODEL } },
        ],
      };
  const properties = await Property.find(filter).lean();
  console.log(`Cần tạo embedding cho ${properties.length} tin (model ${EMBEDDING_MODEL})`);

  let done = 0;
  for (let i = 0; i < properties.length; i += BATCH_SIZE) {
    const batch = properties.slice(i, i + BATCH_SIZE);
    const vectors = await embedTexts(batch.map(buildPropertyText));
    await Property.bulkWrite(
      batch.map((p, idx) => ({
        updateOne: {
          filter: { _id: p._id },
          update: {
            $set: {
              embedding: vectors[idx],
              embeddingModel: EMBEDDING_MODEL,
              embeddedAt: new Date(),
            },
          },
        },
      })),
    );
    done += batch.length;
    console.log(`  ${done}/${properties.length}`);
  }

  console.log("Hoàn tất");
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error("EMBED_PROPERTIES_ERROR:", error);
  await mongoose.disconnect();
  process.exit(1);
});
