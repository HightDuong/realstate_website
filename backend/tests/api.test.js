// Test API toàn luồng: chạy bằng `npm test` (cần MONGODB_URI; dùng database riêng realestate_test).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PASSWORD, connectTestDb, disconnectTestDb, seedUsers } from "./setup.js";
import request from "supertest";
import mongoose from "mongoose";
import app from "../app.js";

const api = request(app);
const tokens = {};
let users;

const auth = (role) => ({ Authorization: `Bearer ${tokens[role]}` });
const login = (email, password = PASSWORD) =>
  api.post("/api/auth/login").send({ email, password });

// Seller đăng một tin hợp lệ (không ảnh để không gọi Cloudinary)
const createProperty = (overrides = {}) =>
  api
    .post("/api/property")
    .set(auth("seller"))
    .field({
      title: "Nhà phố test",
      description: "Mô tả test",
      price: "3500000000",
      city: "Đà Nẵng",
      area: "Hải Châu",
      pincode: "550000",
      propertyType: "house",
      bhk: "3",
      ...overrides,
    });

before(async () => {
  await connectTestDb();
  users = await seedUsers();
  for (const [role, email] of [
    ["admin", "admin@test.vn"],
    ["seller", "seller@test.vn"],
    ["pendingSeller", "pending@test.vn"],
    ["buyer", "buyer@test.vn"],
    ["buyer2", "buyer2@test.vn"],
  ]) {
    const res = await login(email);
    assert.equal(res.status, 200, `đăng nhập ${role}`);
    tokens[role] = res.body.token;
  }
});

after(disconnectTestDb);

describe("Xác thực", () => {
  test("không trả trường nhạy cảm khi đăng nhập", async () => {
    const res = await login("buyer@test.vn");
    for (const field of ["password", "verificationToken", "resetPasswordToken"]) {
      assert.ok(!(field in res.body.user), field);
    }
  });

  test("email viết hoa vẫn đăng nhập được", async () => {
    assert.equal((await login("BUYER@Test.VN")).status, 200);
  });

  test("sai email và sai mật khẩu trả cùng một thông báo", async () => {
    const a = await login("khongco@test.vn", "x");
    const b = await login("buyer@test.vn", "sai-mat-khau");
    assert.equal(a.status, 400);
    assert.equal(a.body.message, b.body.message);
  });

  test("không tự đăng ký được tài khoản admin", async () => {
    const res = await api.post("/api/auth/register").send({
      name: "Hacker", email: "hacker@test.vn", password: "123456", role: "admin",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.role, "buyer");
  });

  test("đăng nhập sai liên tục bị chặn (429)", async () => {
    let status;
    for (let i = 0; i < 12; i++) {
      status = (await login("bruteforce@test.vn", `sai${i}`)).status;
    }
    assert.equal(status, 429);
  });

  test("token rác → 401, có helmet header", async () => {
    const res = await api.get("/api/auth/me").set("Authorization", "Bearer abc");
    assert.equal(res.status, 401);
    assert.equal(res.headers["x-content-type-options"], "nosniff");
  });
});

describe("Phân quyền & dữ liệu đầu vào", () => {
  test("buyer không vào được API seller/admin", async () => {
    assert.equal((await api.get("/api/property/my").set(auth("buyer"))).status, 403);
    assert.equal((await api.get("/api/admin/users").set(auth("seller"))).status, 403);
  });

  test("seller chưa được duyệt không đăng tin được", async () => {
    const res = await api.post("/api/property").set(auth("pendingSeller")).field({ title: "x" });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "SELLER_NOT_APPROVED");
  });

  test("id sai định dạng → 400", async () => {
    assert.equal((await api.get("/api/property/123")).status, 400);
    assert.equal((await api.post("/api/wishlist/abc").set(auth("buyer"))).status, 400);
  });

  test("đăng tin thiếu trường / giá âm → 400", async () => {
    assert.equal((await api.post("/api/property").set(auth("seller")).field({ title: "x" })).status, 400);
    assert.equal((await createProperty({ price: "-5" })).status, 400);
    assert.equal((await createProperty({ propertyType: "castle" })).status, 400);
  });

  test("API không tồn tại → 404 JSON", async () => {
    const res = await api.get("/api/khong-ton-tai");
    assert.equal(res.status, 404);
    assert.ok(res.body.message);
  });
});

describe("Kiểm duyệt tin đăng", () => {
  let propertyId;

  test("tin mới ở trạng thái chờ duyệt, ẩn khỏi trang công khai", async () => {
    const res = await createProperty({ title: "Tin chờ duyệt" });
    assert.equal(res.status, 201);
    propertyId = res.body.property._id;
    assert.equal(res.body.property.moderationStatus, "pending");

    const list = await api.get("/api/property");
    assert.ok(!list.body.properties.some((p) => p._id === propertyId));
    assert.equal((await api.get(`/api/property/${propertyId}`)).status, 404);
  });

  test("chủ tin và admin vẫn xem được tin chờ duyệt", async () => {
    assert.equal((await api.get(`/api/property/${propertyId}`).set(auth("seller"))).status, 200);
    assert.equal((await api.get(`/api/property/${propertyId}`).set(auth("admin"))).status, 200);
  });

  test("admin nhận thông báo có tin mới chờ duyệt", async () => {
    const res = await api.get("/api/notifications").set(auth("admin"));
    assert.ok(res.body.notifications.some((n) => n.type === "property_submitted"));
  });

  test("từ chối cần lý do; seller nhận thông báo kèm lý do", async () => {
    const noReason = await api.patch(`/api/admin/properties/${propertyId}/reject`).set(auth("admin")).send({ reason: "" });
    assert.equal(noReason.status, 400);

    const res = await api
      .patch(`/api/admin/properties/${propertyId}/reject`)
      .set(auth("admin"))
      .send({ reason: "Ảnh không phải ảnh thực tế" });
    assert.equal(res.status, 200);
    assert.equal(res.body.property.moderationStatus, "rejected");

    const n = await api.get("/api/notifications").set(auth("seller"));
    const rejected = n.body.notifications.find((x) => x.type === "property_rejected");
    assert.ok(rejected?.message.includes("Ảnh không phải ảnh thực tế"));
    assert.equal(n.body.unreadCount >= 1, true);
  });

  test("seller sửa tin bị từ chối → tự gửi duyệt lại", async () => {
    const res = await api.put(`/api/property/${propertyId}`).set(auth("seller")).field({ price: "3400000000" });
    assert.equal(res.status, 200);
    assert.equal(res.body.property.moderationStatus, "pending");
    assert.equal(res.body.property.rejectionReason, undefined);
  });

  test("duyệt → hiển thị công khai + nhãn đã kiểm duyệt", async () => {
    const res = await api.patch(`/api/admin/properties/${propertyId}/approve`).set(auth("admin"));
    assert.equal(res.status, 200);
    const detail = await api.get(`/api/property/${propertyId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.property.isVerified, true);
    assert.ok(!("viewedBy" in detail.body.property), "không lộ viewedBy");
  });

  test("tin đã duyệt: đổi giá giữ nguyên, đổi tiêu đề phải duyệt lại", async () => {
    let res = await api.put(`/api/property/${propertyId}`).set(auth("seller")).field({ price: "3300000000" });
    assert.equal(res.body.property.moderationStatus, "approved");
    res = await api.put(`/api/property/${propertyId}`).set(auth("seller")).field({ title: "Tiêu đề mới" });
    assert.equal(res.body.property.moderationStatus, "pending");
  });

  test("đánh dấu đã đọc tất cả thông báo", async () => {
    await api.patch("/api/notifications/read-all").set(auth("seller"));
    const res = await api.get("/api/notifications").set(auth("seller"));
    assert.equal(res.body.unreadCount, 0);
  });
});

describe("AI hỗ trợ kiểm duyệt", () => {
  // Test chạy với AI_ENABLED=false: chỉ có lớp kiểm tra bằng code và so trùng câu chữ
  const listing = {
    title: "Căn hộ view biển kiểm duyệt",
    description:
      "Căn hộ tầng cao view biển, nội thất đầy đủ, gần trường học và chợ. Liên hệ chính chủ 0909.123.456 (Zalo) để xem nhà, miễn trung gian.",
    propertyType: "apartment",
    areaSize: "70",
  };
  const runReview = (id, role = "admin") => api.post(`/api/admin/properties/${id}/ai-review`).set(auth(role));
  // các thao tác ghi kết quả chạy nền sau khi API đã trả về
  const waitFor = async (check) => {
    for (let i = 0; i < 40; i++) {
      const value = await check();
      if (value) return value;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  };
  let propertyId;

  before(async () => {
    propertyId = (await createProperty(listing)).body.property._id;
  });

  test("phát hiện SĐT/Zalo kèm lý do và bằng chứng; AI tắt vẫn có kết quả", async () => {
    const res = await runReview(propertyId);
    assert.equal(res.status, 200);
    const { review } = res.body;
    assert.equal(review.status, "done");
    assert.equal(review.level, "medium");
    assert.equal(review.levelLabel, "Rủi ro trung bình");
    const flag = review.flags.find((f) => f.code === "contact_info");
    assert.ok(flag.reason.includes("Zalo"));
    assert.ok(flag.evidence.includes("0909.123.456"));
    assert.equal(review.ai.status, "disabled");
    assert.ok(review.notes.some((n) => n.includes("AI đang tắt")));
    assert.ok(review.suggestedReason.includes("xóa số điện thoại"));
  });

  test("danh sách tin của admin kèm kết quả phân tích", async () => {
    const res = await api.get("/api/admin/properties").set(auth("admin"));
    const p = res.body.properties.find((x) => x._id === propertyId);
    assert.equal(p.aiReview.level, "medium");
    assert.equal(typeof p.aiReview.score, "number");
    assert.ok(!("error" in p.aiReview.ai), "không trả lỗi kỹ thuật");
  });

  test("buyer và seller không xem / chạy được phân tích, API của seller không kèm dữ liệu AI", async () => {
    for (const role of ["buyer", "seller"]) {
      assert.equal((await api.get(`/api/admin/properties/${propertyId}/ai-review`).set(auth(role))).status, 403);
      assert.equal((await runReview(propertyId, role)).status, 403);
    }
    const mine = await api.get("/api/property/my").set(auth("seller"));
    assert.ok(mine.body.properties.every((p) => !("aiReview" in p)));
    const detail = await api.get(`/api/property/${propertyId}`).set(auth("seller"));
    assert.ok(!("aiReview" in detail.body.property));
  });

  test("đăng lại y hệt tin cũ → cảnh báo đăng lặp kèm tin gốc", async () => {
    const copy = await createProperty(listing);
    const res = await runReview(copy.body.property._id);
    const dup = res.body.review.flags.find((f) => f.code === "duplicate_same_seller");
    assert.ok(dup, "có cảnh báo đăng lặp");
    assert.ok(dup.relatedProperty);
    assert.ok(dup.evidence.includes(listing.title));
  });

  test("tin bị sửa trong lúc đang phân tích → kết quả cuối theo nội dung mới", async () => {
    const { runModerationReview } = await import("../utils/moderationReview.js");
    const { default: Property } = await import("../models/property.model.js");
    const clean = "Căn hộ hai phòng ngủ, ban công thoáng, gần chợ và trường học, sổ hồng chính chủ, sang tên ngay trong tuần.";
    const id = (await createProperty({ title: "Tin sửa giữa chừng", description: clean })).body.property._id;
    const first = runModerationReview(id, { force: true });
    await Property.updateOne({ _id: id }, { description: `${clean} Gọi Zalo 0909 888 777.` });
    const latest = await runModerationReview(id);
    await first;
    assert.ok(latest.flags.some((f) => f.code === "contact_info"), "lượt sau phải thấy SĐT vừa thêm");
  });

  test("mô tả quá 5.000 ký tự bị chặn (tránh làm nghẽn bước so trùng)", async () => {
    const res = await createProperty({ description: "a ".repeat(2600) });
    assert.equal(res.status, 400);
  });

  test("id sai → 400, tin không tồn tại → 404", async () => {
    assert.equal((await api.get("/api/admin/properties/abc/ai-review").set(auth("admin"))).status, 400);
    assert.equal((await runReview(new mongoose.Types.ObjectId().toString())).status, 404);
  });

  test("quyết định của admin được ghi lại; xóa tin thì xóa luôn kết quả phân tích", async () => {
    const { default: ModerationReview } = await import("../models/moderationReview.model.js");
    await api
      .patch(`/api/admin/properties/${propertyId}/reject`)
      .set(auth("admin"))
      .send({ reason: "Tin chứa số điện thoại" });
    const decided = await waitFor(() =>
      ModerationReview.findOne({ property: propertyId, "adminDecisions.decision": "rejected" }),
    );
    assert.ok(decided, "ghi quyết định từ chối");
    const view = await api.get(`/api/admin/properties/${propertyId}/ai-review`).set(auth("admin"));
    assert.equal(view.body.review.adminDecision, "rejected");
    assert.equal(view.body.review.outdated, false);

    await api.delete(`/api/admin/properties/${propertyId}`).set(auth("admin"));
    assert.equal(await ModerationReview.countDocuments({ property: propertyId }), 0);
  });
});

describe("AI viết tin đăng", () => {
  // Test chạy với AI_ENABLED=false: kiểm tra quyền, dữ liệu, hạn mức, cấp thêm lượt (không gọi OpenAI)
  const draft = (role = "seller", fields = {}) =>
    api
      .post("/api/ai/listing-draft")
      .set(auth(role))
      .field({ propertyType: "apartment", city: "Đà Nẵng", price: "3000000000", areaSize: "70", ...fields });
  const todayVN = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

  test("chỉ seller đã được duyệt dùng được", async () => {
    assert.equal((await draft("buyer")).status, 403);
    const pending = await draft("pendingSeller");
    assert.equal(pending.status, 403);
    assert.equal(pending.body.code, "SELLER_NOT_APPROVED");
  });

  test("xem lượt: 20 lượt/ngày, báo AI đang tắt", async () => {
    const res = await api.get("/api/ai/listing-draft/quota").set(auth("seller"));
    assert.equal(res.status, 200);
    assert.deepEqual([res.body.enabled, res.body.limit, res.body.remaining], [false, 20, 20]);
  });

  test("dữ liệu sai → 400; hợp lệ nhưng AI tắt → 503", async () => {
    assert.equal((await draft("seller", { propertyType: "castle" })).status, 400);
    assert.equal((await draft("seller", { city: "" })).status, 400);
    assert.equal((await draft("seller", { highlights: "x".repeat(501) })).status, 400);
    const off = await draft("seller");
    assert.equal(off.status, 503);
    assert.equal(off.body.code, "AI_DISABLED");
  });

  test("gửi quá 4 ảnh → 400", async () => {
    let req = draft("seller");
    for (let i = 0; i < 5; i++) req = req.attach("images", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: `a${i}.png`, contentType: "image/png" });
    assert.equal((await req).status, 400);
  });

  test("hết lượt → 429 kèm hướng dẫn liên hệ admin; admin cấp thêm 20 lượt", async () => {
    const { default: AiQuota } = await import("../models/aiQuota.model.js");
    await AiQuota.create({ key: `listing:${users.seller._id}:${todayVN()}`, count: 20, expiresAt: new Date(Date.now() + 86400000) });

    const blocked = await draft("seller");
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.code, "AI_LISTING_LIMIT");
    assert.ok(blocked.body.message.includes("liên hệ quản trị viên"));

    assert.equal((await api.post(`/api/admin/users/${users.buyer._id}/ai-listing-quota`).set(auth("admin"))).status, 400);
    assert.equal((await api.post(`/api/admin/users/${users.seller._id}/ai-listing-quota`).set(auth("seller"))).status, 403);
    const granted = await api.post(`/api/admin/users/${users.seller._id}/ai-listing-quota`).set(auth("admin"));
    assert.equal(granted.status, 200);
    assert.deepEqual([granted.body.limit, granted.body.remaining], [40, 20]);

    assert.equal((await draft("seller")).status, 503, "còn lượt → qua được bước hạn mức");
    const n = await api.get("/api/notifications").set(auth("seller"));
    assert.ok(n.body.notifications.some((x) => x.type === "ai_quota_granted"));
  });
});

describe("Buyer: wishlist, inquiry, chat", () => {
  let propertyId;

  before(async () => {
    const res = await createProperty({ title: "Tin cho buyer" });
    propertyId = res.body.property._id;
    await api.patch(`/api/admin/properties/${propertyId}/approve`).set(auth("admin"));
  });

  test("wishlist: thêm, trùng, id không tồn tại", async () => {
    assert.equal((await api.post(`/api/wishlist/${propertyId}`).set(auth("buyer"))).status, 201);
    assert.equal((await api.post(`/api/wishlist/${propertyId}`).set(auth("buyer"))).status, 200);
    assert.equal((await api.post("/api/wishlist/000000000000000000000000").set(auth("buyer"))).status, 404);
  });

  test("inquiry: rỗng bị chặn, gửi trùng trong 24h bị chặn", async () => {
    assert.equal((await api.post("/api/inquiry").set(auth("buyer")).send({ propertyId, message: "" })).status, 400);
    assert.equal((await api.post("/api/inquiry").set(auth("buyer")).send({ propertyId, message: "Cho tôi xem nhà" })).status, 201);
    assert.equal((await api.post("/api/inquiry").set(auth("buyer")).send({ propertyId, message: "Lần nữa" })).status, 409);
  });

  test("chat: người bán luôn là chủ tin, người ngoài không đọc được", async () => {
    const fake = await api.post("/api/chat/start").set(auth("buyer")).send({ propertyId, sellerId: users.admin._id });
    assert.equal(fake.status, 400);

    const start = await api.post("/api/chat/start").set(auth("buyer")).send({ propertyId, sellerId: users.seller._id });
    assert.equal(start.status, 200);
    assert.ok(!start.body.seller.email, "không lộ email");

    const chatId = start.body._id;
    assert.equal((await api.post("/api/chat/send").set(auth("buyer")).send({ chatId, text: "" })).status, 400);
    assert.equal((await api.post("/api/chat/send").set(auth("buyer")).send({ chatId, text: "Chào anh" })).status, 200);
    assert.equal((await api.get(`/api/chat/${chatId}`).set(auth("buyer2"))).status, 403);
  });

  test("xóa tin dọn wishlist + inquiry, giữ chat", async () => {
    assert.equal((await api.delete(`/api/admin/properties/${propertyId}`).set(auth("admin"))).status, 200);
    const wl = await api.get("/api/wishlist").set(auth("buyer"));
    assert.ok(!wl.body.data.some((w) => w.property?._id === propertyId));
    const inq = await api.get("/api/inquiry/my").set(auth("buyer"));
    assert.equal(inq.body.inquiries.length, 0);
    const chats = await api.get("/api/chat/user").set(auth("buyer"));
    assert.equal(chats.body.length, 1);
  });
});

describe("Pipeline yêu cầu tư vấn", () => {
  let propertyId, inquiryId;
  const sellerGet = (path, role = "seller") => api.get(`/api/inquiry${path}`).set(auth(role));
  const setStatus = (body, role = "seller") =>
    api.patch(`/api/inquiry/${inquiryId}/status`).set(auth(role)).send(body);
  const buyerView = async () =>
    (await api.get("/api/inquiry/my").set(auth("buyer2"))).body.inquiries.find((i) => i._id === inquiryId);

  before(async () => {
    const res = await createProperty({ title: "Tin pipeline" });
    propertyId = res.body.property._id;
    await api.patch(`/api/admin/properties/${propertyId}/approve`).set(auth("admin"));
  });

  test("không gửi được yêu cầu cho tin chờ duyệt", async () => {
    const pending = await createProperty({ title: "Tin chưa duyệt" });
    const res = await api.post("/api/inquiry").set(auth("buyer2"))
      .send({ propertyId: pending.body.property._id, message: "Xin chào" });
    assert.equal(res.status, 404);
  });

  test("gửi yêu cầu → trạng thái mới, seller nhận thông báo", async () => {
    const res = await api.post("/api/inquiry").set(auth("buyer2")).send({ propertyId, message: "Nhà còn không?" });
    assert.equal(res.status, 201);
    inquiryId = res.body.inquiry._id;
    assert.equal(res.body.inquiry.status, "new");

    const list = await sellerGet("/seller?status=new");
    assert.ok(list.body.inquiries.some((i) => i._id === inquiryId));
    assert.ok(list.body.counts.new >= 1);
    const { all, ...byStatus } = list.body.counts;
    assert.equal(all, Object.values(byStatus).reduce((a, b) => a + b, 0));

    const noti = await api.get("/api/notifications").set(auth("seller"));
    assert.ok(noti.body.notifications.some((n) => n.type === "inquiry_new" && n.link.includes(inquiryId)));
    assert.equal((await buyerView()).buyerStatus, "sent");
  });

  test("seller khác không xem / sửa được yêu cầu", async () => {
    assert.equal((await sellerGet(`/${inquiryId}`, "pendingSeller")).status, 403);
    assert.equal((await setStatus({ status: "won" }, "pendingSeller")).status, 403);
    assert.equal((await api.patch(`/api/inquiry/${inquiryId}/note`).set(auth("pendingSeller")).send({ note: "x" })).status, 403);
    assert.equal((await sellerGet("/seller?status=bogus")).status, 400);
  });

  test("ghi chú nội bộ không lộ cho buyer", async () => {
    const res = await api.patch(`/api/inquiry/${inquiryId}/note`).set(auth("seller")).send({ note: "Khách cần vay 70%" });
    assert.equal(res.status, 200);
    assert.equal((await sellerGet(`/${inquiryId}`)).body.inquiry.sellerNote, "Khách cần vay 70%");
    const mine = await buyerView();
    for (const field of ["sellerNote", "lostReason", "lostNote", "statusHistory"]) {
      assert.ok(!(field in mine), field);
    }
  });

  test("seller trả lời chat → tự chuyển 'Đang trao đổi' và có mốc phản hồi", async () => {
    const start = await api.post("/api/chat/start").set(auth("seller")).send({ propertyId, buyerId: users.buyer2._id });
    assert.equal(start.status, 200);
    await api.post("/api/chat/send").set(auth("seller")).send({ chatId: start.body._id, text: "Nhà vẫn còn anh nhé" });

    const detail = (await sellerGet(`/${inquiryId}`)).body.inquiry;
    assert.equal(detail.status, "contacted");
    assert.ok(detail.firstResponseAt);
    assert.ok(detail.statusHistory.some((h) => h.status === "contacted" && h.auto));
    assert.equal((await buyerView()).buyerStatus, "contacted");
  });

  test("trạng thái sai / thiếu lý do → 400; chốt rồi thì chat không tự lùi", async () => {
    assert.equal((await setStatus({ status: "abc" })).status, 400);
    assert.equal((await setStatus({ status: "lost" })).status, 400);

    const won = await setStatus({ status: "won" });
    assert.equal(won.status, 200);
    assert.ok(won.body.inquiry.closedAt);

    const chats = await api.get("/api/chat/user").set(auth("seller"));
    const chat = chats.body.find((c) => c.property?._id === propertyId);
    await api.post("/api/chat/send").set(auth("seller")).send({ chatId: chat._id, text: "Cảm ơn anh" });
    assert.equal((await sellerGet(`/${inquiryId}`)).body.inquiry.status, "won");
    assert.equal((await buyerView()).buyerStatus, "closed");

    const stats = await sellerGet("/seller/stats");
    assert.equal(stats.status, 200);
    assert.equal(stats.body.stats.winRate90d, 100);
    assert.equal(typeof stats.body.stats.medianResponseMinutes, "number");
  });

  test("không tiếp tục cần lý do; mở lại thì xóa lý do", async () => {
    const lost = await setStatus({ status: "lost", lostReason: "price", lostNote: "Chê giá cao" });
    assert.equal(lost.status, 200);
    assert.equal(lost.body.inquiry.lostReason, "price");
    const reopened = await setStatus({ status: "contacted" });
    assert.equal(reopened.body.inquiry.lostReason, null);
    assert.equal(reopened.body.inquiry.closedAt, undefined);
  });

  test("yêu cầu cũ chưa có trạng thái được tính là mới", async () => {
    const { default: Inquiry } = await import("../models/inquiry.model.js");
    const { insertedId } = await Inquiry.collection.insertOne({
      property: new mongoose.Types.ObjectId(propertyId),
      buyer: users.buyer._id,
      seller: users.seller._id,
      message: "Yêu cầu cũ",
      isRead: false,
      createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000),
      updatedAt: new Date(),
    });
    const list = await sellerGet("/seller?status=new");
    assert.ok(list.body.inquiries.some((i) => i._id === String(insertedId)));
    const stats = await sellerGet("/seller/stats");
    assert.ok(stats.body.stats.overdueCount >= 1);
  });

  test("dashboard: khách đang chăm sóc bỏ khách đã đóng, tin đang hiển thị bỏ tin chờ duyệt", async () => {
    const dashboard = async () =>
      (await api.get("/api/property/seller/dashboard").set(auth("seller"))).body.stats;
    const { default: Inquiry } = await import("../models/inquiry.model.js");
    const { default: Property } = await import("../models/property.model.js");
    const sellerId = users.seller._id;

    const before = await dashboard();
    const openExpected = await Inquiry.countDocuments({ seller: sellerId, status: { $nin: ["won", "lost"] } });
    assert.equal(before.openInquiries, openExpected);
    assert.equal(
      before.activeListings,
      await Property.countDocuments({ seller: sellerId, status: "sale", moderationStatus: { $nin: ["pending", "rejected"] } }),
    );

    // Đóng yêu cầu đang mở → giảm 1; tin mới chờ duyệt không làm tăng tin đang hiển thị
    await setStatus({ status: "won" });
    await createProperty({ title: "Tin chờ duyệt dashboard" });
    const after = await dashboard();
    assert.equal(after.openInquiries, before.openInquiries - 1);
    assert.equal(after.totalInquiries, before.totalInquiries);
    assert.ok(after.totalInquiries > after.openInquiries, "khách đã chốt vẫn nằm trong tổng");
    assert.equal(after.activeListings, before.activeListings);
    assert.equal(after.pendingListings, before.pendingListings + 1);
  });
});

describe("Admin", () => {
  test("không khóa được chính mình hoặc admin khác", async () => {
    const res = await api.patch(`/api/admin/users/block/${users.admin._id}`).set(auth("admin"));
    assert.equal(res.status, 400);
  });

  test("khóa buyer → bị chặn ở mọi API và khi đăng nhập; mở khóa lại được", async () => {
    let res = await api.patch(`/api/admin/users/block/${users.buyer2._id}`).set(auth("admin"));
    assert.equal(res.body.isBlocked, true);
    assert.equal((await api.get("/api/wishlist").set(auth("buyer2"))).body.code, "ACCOUNT_BLOCKED");
    assert.equal((await login("buyer2@test.vn")).body.code, "ACCOUNT_BLOCKED");
    res = await api.patch(`/api/admin/users/block/${users.buyer2._id}`).set(auth("admin"));
    assert.equal(res.body.isBlocked, false);
  });

  test("thống kê: số liệu thật, tin đang hiển thị bỏ tin chờ duyệt, trạng thái hệ thống thật", async () => {
    const { default: Property } = await import("../models/property.model.js");
    const res = await api.get("/api/admin/stats").set(auth("admin"));
    const { stats, system } = res.body;
    assert.equal(stats.pendingProperties, await Property.countDocuments({ moderationStatus: "pending" }));
    assert.equal(
      stats.activeListings,
      await Property.countDocuments({ status: "sale", moderationStatus: { $nin: ["pending", "rejected"] } }),
    );
    assert.equal(stats.pendingSellers, 1, "pending@test.vn chờ duyệt");
    for (const key of ["totalContacts", "openInquiries"]) assert.equal(typeof stats[key], "number", key);
    assert.equal(system.database, true);
    for (const key of ["media", "email", "ai"]) assert.equal(typeof system[key], "boolean", key);
  });
});

describe("Gợi ý bất động sản", () => {
  test("chưa chat → gợi ý nổi bật (kể cả khách), không gồm tin chờ duyệt, mỗi tin có lý do", async () => {
    const approved = await createProperty({ title: "Tin nổi bật", areaSize: "100" });
    await api.patch(`/api/admin/properties/${approved.body.property._id}/approve`).set(auth("admin"));
    const pending = await createProperty({ title: "Tin chưa duyệt" });

    const res = await api.get("/api/ai/recommendations");
    assert.equal(res.status, 200);
    assert.equal(res.body.mode, "featured");
    assert.ok(res.body.properties.length >= 1 && res.body.properties.length <= 5);
    assert.ok(res.body.properties.every((p) => p.highlight));
    assert.ok(!res.body.properties.some((p) => p._id === pending.body.property._id));
  });

  test("seller không thấy tin của chính mình trong gợi ý", async () => {
    const res = await api.get("/api/ai/recommendations").set(auth("seller"));
    assert.ok(!res.body.properties.some((p) => String(p.seller) === String(users.seller._id)));
  });
});

describe("Liên hệ", () => {
  test("email sai / vai trò sai → 400; hợp lệ → 201", async () => {
    assert.equal((await api.post("/api/contact").send({ name: "A", email: "sai", role: "buyer", message: "x" })).status, 400);
    assert.equal((await api.post("/api/contact").send({ name: "A", email: "a@b.vn", role: "admin", message: "x" })).status, 400);
    assert.equal((await api.post("/api/contact").send({ name: "A", email: "a@b.vn", role: "buyer", message: "Xin chào" })).status, 201);
  });

  test("admin đánh dấu đã xử lý / mở lại, lọc theo trạng thái", async () => {
    await api.post("/api/contact").send({ name: "Khách cần hỗ trợ", email: "hotro@b.vn", role: "seller", message: "Cần hỗ trợ" });
    const list = async (status) =>
      (await api.get(`/api/contact${status ? `?status=${status}` : ""}`).set(auth("admin"))).body;
    const target = (await list("pending")).data.find((c) => c.email === "hotro@b.vn");
    assert.equal(target.status, "pending");

    const setStatus = (status, role = "admin", id = target._id) =>
      api.patch(`/api/contact/${id}/status`).set(auth(role)).send({ status });
    assert.equal((await setStatus("resolved", "buyer")).status, 403);
    assert.equal((await setStatus("resolved", "seller")).status, 403);
    assert.equal((await setStatus("done")).status, 400);
    assert.equal((await setStatus("resolved", "admin", "abc")).status, 400);
    assert.equal((await setStatus("resolved", "admin", "000000000000000000000000")).status, 404);

    const before = (await list()).counts;
    const resolved = await setStatus("resolved");
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.data.status, "resolved");
    assert.ok(resolved.body.data.resolvedAt);
    assert.equal(resolved.body.data.resolvedBy.name, users.admin.name);

    const after = await list("resolved");
    assert.ok(after.data.some((c) => c._id === target._id));
    assert.ok(after.data.every((c) => c.status === "resolved"));
    assert.equal(after.counts.pending, before.pending - 1);
    assert.equal(after.counts.resolved, before.resolved + 1);
    assert.ok(!(await list("pending")).data.some((c) => c._id === target._id));
    assert.equal((await api.get("/api/contact?status=toString").set(auth("admin"))).status, 400);

    const reopened = await setStatus("pending");
    assert.equal(reopened.body.data.status, "pending");
    assert.equal(reopened.body.data.resolvedAt, null);
    assert.equal(reopened.body.data.resolvedBy, null);
  });

  test("thư cũ chưa có trạng thái được tính là chờ xử lý", async () => {
    const { default: Contact } = await import("../models/contact.model.js");
    const { insertedId } = await Contact.collection.insertOne({
      name: "Thư cũ", email: "cu@b.vn", role: "buyer", message: "x", createdAt: new Date(), updatedAt: new Date(),
    });
    const res = await api.get("/api/contact?status=pending").set(auth("admin"));
    assert.ok(res.body.data.some((c) => c._id === String(insertedId)));
    const stats = await api.get("/api/admin/stats").set(auth("admin"));
    assert.ok(stats.body.stats.pendingContacts >= 1);
  });
});
