// Dữ liệu demo cho buổi thuyết trình: khách hàng ở đủ các trạng thái pipeline, chat, thông báo,
// tin chờ duyệt / bị từ chối, seller chờ duyệt, lượt xem hôm nay, wishlist, liên hệ,
// 10 tình huống cho AI hỗ trợ kiểm duyệt (demo-moderation-cases.js) — in bảng đối chiếu kết quả ở cuối.
//
//   node scripts/seed-demo.js --dry-run   → chỉ in kế hoạch, không ghi gì
//   node scripts/seed-demo.js             → gỡ dữ liệu demo cũ (nếu có) rồi tạo lại (mốc thời gian tính theo lúc chạy)
//   node scripts/seed-demo.js --reset     → chỉ gỡ dữ liệu demo
//
// Database: MONGODB_DB_NAME, mặc định realestate_dev. Từ chối chạy trên production ("test").
// Mọi dữ liệu tạo ra đều gắn với tài khoản email @demo.example.com, nên --reset chỉ gỡ đúng phần đó.
// Tài khoản demo đăng nhập bằng mật khẩu 123456.
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import cloudinary from "../config/cloudinary.js";
import User from "../models/user.model.js";
import Property from "../models/property.model.js";
import Inquiry from "../models/inquiry.model.js";
import Chat from "../models/chat.model.js";
import Notification from "../models/notification.model.js";
import Wishlist from "../models/wishlist.model.js";
import Contact from "../models/contact.model.js";
import PropertyView from "../models/propertyView.model.js";
import { deletePropertyCascade } from "../utils/propertyCleanup.js";
import { isAiEnabled } from "../ai/openaiClient.js";
import { embedProperty } from "../ai/embeddings.js";
import { runModerationReview, LEVEL_LABELS } from "../utils/moderationReview.js";
import { AI_FLAG_CODES } from "../utils/moderationRules.js";
import { BANNER_SVG, FLOWER_IMAGE_URL, buildModerationDemo } from "./demo-moderation-cases.js";

const DRY_RUN = process.argv.includes("--dry-run");
const RESET_ONLY = process.argv.includes("--reset");
const DB_NAME = process.env.MONGODB_DB_NAME || "realestate_dev";
const PRODUCTION_DBS = ["test"];

// Tài khoản thật dùng trong kịch bản demo (chỉ đọc, không sửa)
const MAIN_SELLER_EMAIL = "duonghd241004@gmail.com";
const SECOND_SELLER_EMAIL = "duongfarmrok1@gmail.com";

const DEMO_DOMAIN = "@demo.example.com";
const DEMO_EMAIL_RE = /@demo\.example\.com$/;
const PASSWORD = "123456";

const DEMO_BUYERS = [
  { key: "minhAnh", name: "Nguyễn Minh Anh", email: `minhanh${DEMO_DOMAIN}`, phone: "0905123456" },
  { key: "thuHa", name: "Trần Thu Hà", email: `thuha${DEMO_DOMAIN}`, phone: "0912345678" },
  { key: "quocBao", name: "Lê Quốc Bảo", email: `quocbao${DEMO_DOMAIN}`, phone: "0938765432" },
  { key: "giaHuy", name: "Phạm Gia Huy", email: `giahuy${DEMO_DOMAIN}`, phone: "0977888999" },
  { key: "ngocLan", name: "Võ Ngọc Lan", email: `ngoclan${DEMO_DOMAIN}`, phone: "0899112233" },
];
const DEMO_SELLER = { key: "phuMy", name: "Phú Mỹ Land", email: `phumyland${DEMO_DOMAIN}`, phone: "02838123456", isApproved: true };
const DEMO_PENDING_SELLER = { key: "thanhDat", name: "Lâm Thành Đạt", email: `thanhdat${DEMO_DOMAIN}`, phone: "0966554433", isApproved: false };

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const log = (...args) => console.log(...args);
const todayVN = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

// ---------- Gỡ dữ liệu demo ----------
const resetDemo = async () => {
  const demoUsers = await User.find({ email: DEMO_EMAIL_RE }).select("_id name");
  const ids = demoUsers.map((u) => u._id);
  const idStrings = ids.map(String);
  if (!ids.length) {
    log("Không có dữ liệu demo cũ.");
    return;
  }

  const inquiries = await Inquiry.find({ $or: [{ buyer: { $in: ids } }, { seller: { $in: ids } }] }).select("_id");
  const demoProps = await Property.find({ seller: { $in: ids } });
  const linkIds = [...inquiries.map((i) => String(i._id)), ...demoProps.map((p) => String(p._id))];
  const names = demoUsers.map((u) => u.name);

  if (DRY_RUN) {
    log(`[dry-run] Sẽ gỡ: ${ids.length} tài khoản demo, ${inquiries.length} yêu cầu, ${demoProps.length} tin của tài khoản demo`);
    return;
  }

  // Thông báo gửi cho người thật nhưng nói về dữ liệu demo (link chứa id demo hoặc nhắc tên tài khoản demo)
  const linkRe = linkIds.length ? new RegExp(linkIds.join("|")) : null;
  const notiFilter = {
    $or: [
      { user: { $in: ids } },
      ...(linkRe ? [{ link: linkRe }] : []),
      { message: new RegExp(names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")) },
    ],
  };

  // Hoàn lại lượt xem mà tài khoản demo đã cộng vào tin thật
  const viewedProps = await Property.find({ viewedBy: { $in: idStrings } }).select("+viewedBy");
  for (const p of viewedProps) {
    const count = p.viewedBy.filter((v) => idStrings.includes(String(v))).length;
    await Property.updateOne(
      { _id: p._id },
      { $pull: { viewedBy: { $in: idStrings } }, $inc: { views: -count } },
    );
  }

  for (const p of demoProps) await deletePropertyCascade(p); // xóa cả ảnh Cloudinary bản sao

  const results = await Promise.all([
    Inquiry.deleteMany({ _id: { $in: inquiries.map((i) => i._id) } }),
    Chat.deleteMany({ $or: [{ buyer: { $in: ids } }, { seller: { $in: ids } }] }),
    Notification.deleteMany(notiFilter),
    Wishlist.deleteMany({ user: { $in: ids } }),
    Contact.deleteMany({ email: DEMO_EMAIL_RE }),
    PropertyView.deleteMany({ visitorId: { $in: idStrings } }),
  ]);
  await User.deleteMany({ _id: { $in: ids }, email: DEMO_EMAIL_RE });
  const [inq, chat, noti, wl, ct, pv] = results.map((r) => r.deletedCount);
  log(`Đã gỡ dữ liệu demo cũ: ${ids.length} tài khoản, ${demoProps.length} tin, ${inq} yêu cầu, ${chat} chat, ${noti} thông báo, ${wl} wishlist, ${ct} liên hệ, ${pv} lượt xem ngày (hoàn ${viewedProps.length} tin)`);
};

// ---------- Tạo dữ liệu demo ----------
// Chèn thẳng vào collection để giữ createdAt/updatedAt trong quá khứ (Mongoose timestamps sẽ ghi đè)
const insertRaw = async (Model, data) => {
  const doc = new Model(data);
  await doc.validate();
  await Model.collection.insertOne(doc.toObject({ depopulate: true }));
  return doc;
};

const createUsers = async () => {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const users = {};
  const base = { password: hash, isVerified: true, isBlocked: false };
  for (const b of DEMO_BUYERS) {
    users[b.key] = await User.create({ ...base, name: b.name, email: b.email, phone: b.phone, role: "buyer" });
  }
  for (const s of [DEMO_SELLER, DEMO_PENDING_SELLER]) {
    users[s.key] = await User.create({ ...base, name: s.name, email: s.email, phone: s.phone, role: "seller", isApproved: s.isApproved });
  }
  return users;
};

// Bản sao ảnh trên Cloudinary (folder properties) để xóa tin demo không ảnh hưởng ảnh của tin thật
const copyImages = async (urls) => {
  const out = [];
  for (const url of urls) {
    try {
      const r = await cloudinary.uploader.upload(url, { folder: "properties" });
      out.push(r.secure_url);
    } catch (error) {
      log("  ! Không sao chép được ảnh:", url, error?.error?.message || error?.message || error);
    }
  }
  return out;
};

// Một lượt trao đổi chat: mảng [ai gửi ("b"|"s"), phút sau mốc bắt đầu, nội dung]
const buildMessages = (start, buyerId, sellerId, script) =>
  script.map(([who, minutes, text]) => ({
    sender: who === "b" ? buyerId : sellerId,
    text,
    createdAt: new Date(start.getTime() + minutes * MIN),
  }));

const seed = async () => {
  const now = Date.now();
  const ago = (ms) => new Date(now - ms);

  const seller = await User.findOne({ email: MAIN_SELLER_EMAIL });
  const seller2 = await User.findOne({ email: SECOND_SELLER_EMAIL });
  const admin = await User.findOne({ role: "admin" });
  if (!seller) throw new Error(`Không tìm thấy seller ${MAIN_SELLER_EMAIL}`);

  const visible = { moderationStatus: { $nin: ["pending", "rejected"] } };
  const forSale = await Property.find({ seller: seller._id, status: "sale", ...visible }).sort({ createdAt: -1 });
  const sold = await Property.find({ seller: seller._id, status: "sold" }).sort({ createdAt: -1 });
  const seller2Props = seller2
    ? await Property.find({ seller: seller2._id, status: "sale", ...visible }).sort({ createdAt: -1 })
    : [];
  if (forSale.length < 8 || !sold.length) {
    throw new Error(`Seller chính cần ≥ 8 tin đang bán và ≥ 1 tin đã bán (có ${forSale.length}/${sold.length})`);
  }

  if (DRY_RUN) {
    const { comparables, cases } = buildModerationDemo({ ago, MIN, HOUR, original: forSale[0] });
    log(`[dry-run] Sẽ tạo: ${DEMO_BUYERS.length} buyer, 1 seller demo + 1 seller chờ duyệt, ~11 yêu cầu, 5 chat, lượt xem hôm nay, wishlist, 2 liên hệ`);
    log(`[dry-run] Tin demo: ${comparables.length} tin mẫu đã duyệt, ${cases.length} tin chờ duyệt cho AI kiểm duyệt (${cases.map((c) => c.label).join(" | ")}), 1 tin bị từ chối`);
    log(`[dry-run] Tin đang bán của seller chính dùng cho yêu cầu: ${forSale.slice(0, 8).map((p) => p.title).join(" | ")}`);
    return;
  }

  const u = await createUsers();
  const S = seller._id;

  // ---- Yêu cầu tư vấn: đủ 5 trạng thái, có quá hạn 24h, có chưa đọc ----
  const plans = [
    { buyer: "minhAnh", property: forSale[0], created: ago(35 * MIN), status: "new", isRead: false,
      message: "Chào anh, căn này còn không ạ? Em muốn xem nhà vào cuối tuần này." },
    { buyer: "giaHuy", property: forSale[1], created: ago(27 * HOUR), status: "new", isRead: false,
      message: "Giá còn thương lượng được không anh? Tôi có thể thanh toán nhanh trong tháng này." },
    { buyer: "ngocLan", property: forSale[2], created: ago(3 * HOUR), status: "new", isRead: true,
      message: "Cho mình xin thêm ảnh thực tế và bản scan sổ hồng nhé." },
    { buyer: "thuHa", property: forSale[3], created: ago(2 * DAY), status: "contacted", firstReply: 45,
      note: "Khách cần vay ngân hàng 70%, đang chờ ngân hàng duyệt hồ sơ.",
      message: "Nhà có hỗ trợ vay ngân hàng không anh? Mình muốn vay khoảng 70%.",
      chat: [["b", 0, "Nhà có hỗ trợ vay ngân hàng không anh? Mình muốn vay khoảng 70%."],
        ["s", 45, "Chào chị Hà, bên em có liên kết với Vietcombank và BIDV, hỗ trợ vay tối đa 70% trong 20 năm ạ."],
        ["b", 70, "Vậy anh gửi giúp mình danh sách giấy tờ cần chuẩn bị nhé."],
        ["s", 95, "Dạ em gửi chị: CCCD, xác nhận thu nhập 3 tháng gần nhất và sao kê lương. Chị chuẩn bị xong báo em nhé."]] },
    { buyer: "quocBao", property: forSale[4], created: ago(4 * DAY), status: "contacted", firstReply: 180,
      message: "Căn này hướng gì vậy anh? Có chỗ đậu ô tô không?",
      chat: [["b", 0, "Căn này hướng gì vậy anh? Có chỗ đậu ô tô không?"],
        ["s", 180, "Chào anh Bảo, nhà hướng Đông Nam, có chỗ đậu ô tô ngay trước cửa ạ."],
        ["b", 200, "Ok anh, để tôi bàn với gia đình rồi hẹn xem nhà sau."]] },
    { buyer: "minhAnh", property: forSale[5], created: ago(6 * DAY), status: "viewing_scheduled", firstReply: 20,
      scheduledAfter: DAY, note: "Hẹn xem 9h sáng thứ Bảy, khách đi cùng vợ. Chuẩn bị sẵn bản vẽ.",
      message: "Em muốn đặt lịch xem nhà, sáng thứ Bảy được không anh?",
      chat: [["b", 0, "Em muốn đặt lịch xem nhà, sáng thứ Bảy được không anh?"],
        ["s", 20, "Được em, 9h sáng thứ Bảy nhé. Anh gửi vị trí qua đây."],
        ["b", 35, "Dạ em cảm ơn, em sẽ đi cùng vợ ạ."]] },
    { buyer: "quocBao", property: sold[0], created: ago(25 * DAY), status: "won", firstReply: 60,
      scheduledAfter: 5 * DAY, closedAfter: 13 * DAY, note: "Đã ký hợp đồng đặt cọc 10%, công chứng tuần sau.",
      message: "Tôi rất thích căn này, muốn xem trực tiếp càng sớm càng tốt.",
      chat: [["b", 0, "Tôi rất thích căn này, muốn xem trực tiếp càng sớm càng tốt."],
        ["s", 60, "Chào anh Bảo, chiều mai 3h anh qua xem được không ạ?"],
        ["b", 90, "Được anh, hẹn chiều mai."],
        ["b", 13 * 24 * 60, "Gia đình tôi đã thống nhất, mình làm hợp đồng đặt cọc nhé anh."],
        ["s", 13 * 24 * 60 + 30, "Dạ cảm ơn anh, em chuẩn bị hợp đồng và gửi anh xem trước ạ."]] },
    { buyer: "ngocLan", property: forSale[6], created: ago(15 * DAY), status: "lost", firstReply: 120,
      closedAfter: 6 * DAY, lostReason: "price", lostNote: "Khách thấy giá cao hơn khu vực khoảng 10%.",
      message: "Giá cuối cùng của căn này là bao nhiêu vậy anh?",
      chat: [["b", 0, "Giá cuối cùng của căn này là bao nhiêu vậy anh?"],
        ["s", 120, "Chào chị Lan, chủ nhà có thể giảm thêm 2% nếu chị thanh toán trong tháng ạ."],
        ["b", 6 * 24 * 60, "Mình thấy vẫn hơi cao so với khu vực, chắc mình chưa mua được rồi."]] },
    { buyer: "giaHuy", property: forSale[7], created: ago(30 * DAY), status: "lost", firstReply: 300,
      closedAfter: 9 * DAY, lostReason: "bought_elsewhere",
      message: "Khu này có gần trường học không anh?" },
  ];
  if (seller2Props.length >= 2) {
    plans.push(
      { buyer: "thuHa", property: seller2Props[0], created: ago(5 * HOUR), status: "new", isRead: false,
        message: "Căn này đã có sổ hồng riêng chưa anh?" },
      { buyer: "ngocLan", property: seller2Props[1], created: ago(3 * DAY), status: "contacted", firstReply: 90,
        message: "Mình muốn thuê lại để ở trước khi mua được không?" },
    );
  }

  const createdInquiries = [];
  for (const p of plans) {
    const buyer = u[p.buyer];
    const sellerId = p.property.seller;
    const created = p.created;
    const at = (ms) => new Date(created.getTime() + ms);
    const firstResponseAt = p.firstReply ? at(p.firstReply * MIN) : undefined;
    const history = [{ status: "new", at: created, by: buyer._id }];
    if (firstResponseAt) history.push({ status: "contacted", at: firstResponseAt, by: sellerId, auto: true });
    if (p.scheduledAfter) history.push({ status: "viewing_scheduled", at: at(p.scheduledAfter), by: sellerId });
    const closedAt = p.closedAfter ? at(p.closedAfter) : undefined;
    if (closedAt) history.push({ status: p.status, at: closedAt, by: sellerId });

    const inquiry = await insertRaw(Inquiry, {
      property: p.property._id,
      buyer: buyer._id,
      seller: sellerId,
      message: p.message,
      isRead: p.status !== "new" || p.isRead,
      status: p.status,
      sellerNote: p.note || "",
      lostReason: p.lostReason || null,
      lostNote: p.lostNote || "",
      firstResponseAt,
      closedAt,
      statusHistory: history,
      createdAt: created,
      updatedAt: history.at(-1).at,
    });
    createdInquiries.push(inquiry);

    await insertRaw(Notification, {
      user: sellerId,
      type: "inquiry_new",
      title: "Khách mới quan tâm tin của bạn",
      message: `${buyer.name} gửi yêu cầu tư vấn về "${p.property.title}": ${p.message}`,
      link: `/inquiries?id=${inquiry._id}`,
      isRead: p.status !== "new" || p.isRead,
      createdAt: created,
      updatedAt: created,
    });

    if (p.chat) {
      const messages = buildMessages(created, buyer._id, sellerId, p.chat);
      await insertRaw(Chat, {
        property: p.property._id,
        buyer: buyer._id,
        seller: sellerId,
        messages,
        createdAt: created,
        updatedAt: messages.at(-1).createdAt,
      });
    }
  }

  // ---- Tin của seller demo ----
  // 8 tin mẫu đã duyệt (mặt bằng giá cho AI kiểm duyệt), 10 tin chờ duyệt (mỗi tin một tình huống kiểm duyệt,
  // xem demo-moderation-cases.js), 1 tin bị từ chối.
  // Ảnh: bản sao ảnh tin thật, ưu tiên cùng nhóm loại hình để ảnh khớp với tin.
  const imagePool = await Property.find({ "images.0": { $exists: true } })
    .select("images propertyType").sort({ createdAt: -1 }).limit(80).lean();
  const FAMILY = { flat: "apt", apartment: "apt", studio: "apt", penthouse: "apt", house: "house", townhouse: "house", villa: "house", plot: "land", office: "biz", commercial: "biz" };
  const usedSources = new Set();
  const imagesFor = async (type, count = 2) => {
    const ordered = [
      ...imagePool.filter((p) => FAMILY[p.propertyType] === FAMILY[type]),
      ...imagePool.filter((p) => FAMILY[p.propertyType] !== FAMILY[type]),
    ];
    // lần 1: nguồn chưa dùng; lần 2: cho phép dùng lại
    for (const allowReuse of [false, true]) {
      for (const src of ordered) {
        if (!allowReuse && usedSources.has(String(src._id))) continue;
        usedSources.add(String(src._id));
        const images = await copyImages(src.images.slice(0, count));
        if (images.length) return images;
      }
    }
    return [];
  };
  const uploadOne = async (file) => {
    try {
      return (await cloudinary.uploader.upload(file, { folder: "properties", format: "jpg" })).secure_url;
    } catch (error) {
      log("  ! Không tải được ảnh minh họa:", error?.error?.message || error?.message || error);
      return null;
    }
  };

  const original = forSale.find((p) => p.images?.length && String(p.description || "").length >= 120) || forSale[0];
  const { comparables, cases } = buildModerationDemo({ ago, MIN, HOUR, original });
  const demoListings = [
    ...comparables.map((c, i) => ({ ...c, moderationStatus: "approved", created: ago((20 + i * 3) * DAY) })),
    ...cases.map((c) => ({ ...c, moderationStatus: "pending" })),
    { title: "Bán gấp đất nền giá rẻ", description: "Đất nền giá rẻ, liên hệ ngay.", price: 900000000, city: "Bình Dương", area: "Bến Cát", pincode: "820000", propertyType: "plot", bhk: "0", bathrooms: 0, areaSize: 100, furnishing: "unfurnished", amenities: [], moderationStatus: "rejected", rejectionReason: "Ảnh không đúng thực tế và mô tả thiếu thông tin pháp lý. Vui lòng bổ sung ảnh chụp thực tế và số sổ.", created: ago(2 * DAY) },
  ];
  const demoProps = [];
  const caseRows = []; // [{ prop, listing }] của các tin chờ duyệt, để đối chiếu kết quả kiểm duyệt
  const comparableProps = {};
  for (const l of demoListings) {
    const { created, key, label, expect, images: imagePlan, ...fields } = l;
    let images;
    if (imagePlan === "nonProperty") {
      images = [
        await uploadOne(FLOWER_IMAGE_URL),
        await uploadOne(`data:image/svg+xml;base64,${Buffer.from(BANNER_SVG).toString("base64")}`),
      ].filter(Boolean);
    } else if (imagePlan?.copyFrom === "original") {
      images = await copyImages(original.images.slice(0, imagePlan.count));
    } else if (imagePlan?.copyFrom === "comparable") {
      images = await copyImages((comparableProps.sunrise?.images || []).slice(0, imagePlan.count));
    } else {
      images = await imagesFor(l.propertyType, imagePlan?.count ?? 2);
    }
    const approved = l.moderationStatus === "approved";
    const prop = await insertRaw(Property, {
      ...fields,
      images,
      seller: u.phuMy._id,
      status: "sale",
      isVerified: approved,
      views: 0,
      ...(l.moderationStatus !== "pending" ? { moderatedAt: approved ? created : ago(DAY), moderatedBy: admin?._id } : {}),
      createdAt: created,
      updatedAt: created,
    });
    demoProps.push(prop);
    if (key) comparableProps[key] = prop;
    if (l.moderationStatus === "pending") caseRows.push({ prop, listing: l });
    if (l.moderationStatus === "pending" && admin) {
      const admins = await User.find({ role: "admin" }).select("_id");
      for (const a of admins) {
        await insertRaw(Notification, {
          user: a._id, type: "property_submitted", title: "Có tin đăng mới chờ duyệt",
          message: `"${prop.title}" của ${u.phuMy.name}`, link: "/admin/properties",
          isRead: false, createdAt: created, updatedAt: created,
        });
      }
    }
    if (l.moderationStatus === "rejected") {
      await insertRaw(Notification, {
        user: u.phuMy._id, type: "property_rejected", title: "Tin đăng của bạn bị từ chối",
        message: `Tin "${prop.title}" chưa được duyệt.\nLý do: ${l.rejectionReason}\nBạn hãy chỉnh sửa tin, tin sẽ tự động được gửi duyệt lại.`,
        link: `/edit-property/${prop._id}`, isRead: false, createdAt: ago(DAY), updatedAt: ago(DAY),
      });
    }
  }
  // Tin đã duyệt / bị từ chối: tạo embedding cho chatbot. Tin chờ duyệt: chạy AI hỗ trợ kiểm duyệt
  // giống luồng thật khi seller gửi tin (bước này tự tạo embedding trước khi so trùng).
  if (isAiEnabled()) {
    for (const p of demoProps.filter((x) => x.moderationStatus !== "pending")) {
      await embedProperty(p._id).catch((e) => log("  ! embedding:", e.message));
    }
  }
  log(`  Đang chạy AI hỗ trợ kiểm duyệt cho ${caseRows.length} tin chờ duyệt (AI ${isAiEnabled() ? "bật" : "tắt"})…`);
  const reviewResults = [];
  for (const row of caseRows) {
    const review = await runModerationReview(row.prop._id);
    reviewResults.push({ ...row, review });
  }

  // ---- Lượt xem hôm nay (thống kê "Xu hướng hôm nay") + wishlist ----
  const buyers = DEMO_BUYERS.map((b) => u[b.key]);
  const viewPlan = [[0, 5], [1, 4], [3, 3], [5, 3], [2, 2], [4, 1]]; // [chỉ số tin, số buyer xem]
  let viewCount = 0;
  for (const [idx, n] of viewPlan) {
    const prop = forSale[idx];
    for (const b of buyers.slice(0, n)) {
      const visitorId = String(b._id);
      const r = await Property.updateOne(
        { _id: prop._id, viewedBy: { $ne: visitorId } },
        { $inc: { views: 1 }, $push: { viewedBy: visitorId } },
      );
      await PropertyView.updateOne(
        { property: prop._id, visitorId, date: todayVN() },
        { $setOnInsert: { seller: prop.seller } },
        { upsert: true },
      );
      viewCount += r.modifiedCount;
    }
  }
  const wishlistPlan = [["minhAnh", [0, 5, 2]], ["thuHa", [3, 1]], ["quocBao", [4]], ["ngocLan", [2, 0]]];
  for (const [key, idxs] of wishlistPlan) {
    for (const i of idxs) await Wishlist.create({ user: u[key]._id, property: forSale[i]._id });
  }

  // ---- Liên hệ gửi admin ----
  await insertRaw(Contact, { name: u.giaHuy.name, email: u.giaHuy.email, phone: u.giaHuy.phone, role: "buyer",
    message: "Tôi gửi yêu cầu tư vấn 2 ngày rồi nhưng chưa thấy người bán phản hồi, admin hỗ trợ giúp tôi với.", createdAt: ago(5 * HOUR), updatedAt: ago(5 * HOUR) });
  await insertRaw(Contact, { name: u.phuMy.name, email: u.phuMy.email, phone: u.phuMy.phone, role: "seller",
    message: "Tin đất nền của chúng tôi bị từ chối, xin hướng dẫn cần bổ sung giấy tờ gì để được duyệt.", createdAt: ago(20 * HOUR), updatedAt: ago(20 * HOUR) });
  // thư đã được admin xử lý → bộ lọc "Đã xử lý" trên trang Hộp thư liên hệ có dữ liệu
  await insertRaw(Contact, { name: u.quocBao.name, email: u.quocBao.email, phone: u.quocBao.phone, role: "buyer",
    message: "Tôi không đặt được lịch xem nhà, nút xác nhận báo lỗi. Nhờ admin kiểm tra giúp.",
    status: "resolved", resolvedAt: ago(2 * DAY), resolvedBy: admin?._id || null, createdAt: ago(3 * DAY), updatedAt: ago(2 * DAY) });

  const counts = createdInquiries.reduce((acc, i) => ({ ...acc, [i.status]: (acc[i.status] || 0) + 1 }), {});
  log("Đã tạo dữ liệu demo:");
  log(`  Tài khoản: ${DEMO_BUYERS.map((b) => b.email).join(", ")}`);
  log(`             ${DEMO_SELLER.email} (seller đã duyệt), ${DEMO_PENDING_SELLER.email} (seller chờ duyệt) — mật khẩu ${PASSWORD}`);
  log(`  Yêu cầu tư vấn: ${createdInquiries.length}`, counts);
  const byStatus = demoProps.reduce((acc, p) => ({ ...acc, [p.moderationStatus]: (acc[p.moderationStatus] || 0) + 1 }), {});
  log(`  Tin demo: ${byStatus.approved || 0} tin mẫu đã duyệt, ${byStatus.pending || 0} chờ duyệt, ${byStatus.rejected || 0} bị từ chối`);
  log(`  Lượt xem hôm nay (${todayVN()}): +${viewCount}; wishlist: ${wishlistPlan.reduce((a, [, x]) => a + x.length, 0)}; liên hệ: 2`);

  // Đối chiếu kết quả AI hỗ trợ kiểm duyệt với kết quả mong đợi của từng tình huống
  const aiOn = isAiEnabled();
  let passed = 0;
  log(`  AI hỗ trợ kiểm duyệt (${aiOn ? "AI bật" : "AI tắt: các cảnh báo cần AI được bỏ qua khi đối chiếu"}):`);
  for (const { listing, review } of reviewResults) {
    const found = (review?.flags || []).map((f) => f.code);
    const expected = listing.expect.filter((c) => aiOn || !AI_FLAG_CODES.includes(c));
    const missing = expected.filter((c) => !found.includes(c));
    const extra = found.filter((c) => !listing.expect.includes(c));
    if (!missing.length && review?.status === "done") passed++;
    const verdict = review?.status !== "done" ? "LỖI" : missing.length ? "✗" : "✓";
    log(
      `   ${verdict} ${listing.label.padEnd(30)} ${(LEVEL_LABELS[review?.level] || "-").padEnd(18)} ${String(review?.score ?? "-").padStart(3)} điểm` +
        ` | cảnh báo: ${found.join(", ") || "không có"}` +
        (missing.length ? ` | THIẾU: ${missing.join(", ")}` : "") +
        (extra.length ? ` | thêm: ${extra.join(", ")}` : ""),
    );
  }
  log(`  → Bắt đúng ${passed}/${reviewResults.length} tình huống`);
};

const main = async () => {
  if (PRODUCTION_DBS.includes(DB_NAME)) {
    console.error(`Từ chối chạy trên database production "${DB_NAME}".`);
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI, { dbName: DB_NAME });
  if (PRODUCTION_DBS.includes(mongoose.connection.name)) throw new Error("Sai database");
  log(`Database: ${mongoose.connection.name}${DRY_RUN ? " (dry-run, không ghi)" : ""}`);

  await resetDemo();
  if (!RESET_ONLY) await seed();
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error("SEED_DEMO_ERROR:", error);
  await mongoose.disconnect();
  process.exit(1);
});
