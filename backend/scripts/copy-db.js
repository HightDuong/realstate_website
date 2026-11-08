// Sao chép toàn bộ dữ liệu từ database production sang database dev trên cùng cluster.
//   node scripts/copy-db.js                       → test → realestate_dev (chỉ khi dev còn trống)
//   node scripts/copy-db.js --drop                → xóa sạch dev rồi chép lại
//   node scripts/copy-db.js --from test --to realestate_dev
// Chỉ ĐỌC database nguồn; chỉ GHI vào database đích. Không bao giờ ghi vào database production.
import "dotenv/config";
import mongoose from "mongoose";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const FROM = arg("from", "test");
const TO = arg("to", "realestate_dev");
const DROP = process.argv.includes("--drop");
// Database không bao giờ được làm đích ghi
const PROTECTED = new Set(["test", "admin", "local", "config"]);

const main = async () => {
  if (FROM === TO) throw new Error("Database nguồn và đích phải khác nhau");
  if (PROTECTED.has(TO)) throw new Error(`Từ chối ghi vào database "${TO}" (production/hệ thống)`);

  await mongoose.connect(process.env.MONGODB_URI);
  const client = mongoose.connection.getClient();
  const source = client.db(FROM);
  const target = client.db(TO);

  const existing = await target.listCollections().toArray();
  if (existing.length && !DROP) {
    throw new Error(`Database "${TO}" đã có dữ liệu. Thêm --drop để xóa và chép lại.`);
  }
  if (DROP) await target.dropDatabase();

  const collections = await source.listCollections({ type: "collection" }).toArray();
  for (const { name } of collections) {
    const docs = await source.collection(name).find().toArray();
    if (docs.length) await target.collection(name).insertMany(docs, { ordered: false });
    // chép index (trừ _id), gồm cả TTL và unique
    const indexes = (await source.collection(name).indexes()).filter((i) => i.name !== "_id_");
    for (const { key, v, ns, ...options } of indexes) {
      await target.collection(name).createIndex(key, options);
    }
    console.log(`${name}: ${docs.length} bản ghi, ${indexes.length} index`);
  }
  console.log(`Xong: ${FROM} → ${TO}`);
};

main()
  .catch((error) => {
    console.error("COPY_DB_ERROR:", error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
