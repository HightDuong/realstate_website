// Luồng đầy đủ: seller đăng tin → admin từ chối (có lý do) → seller nhận thông báo, sửa tin →
// admin duyệt → buyer thấy tin, thêm yêu thích, gửi yêu cầu tư vấn, chat realtime với seller → seller xóa tin.
import { test, expect } from "@playwright/test";

const PASSWORD = "E2e@123456"; // khớp backend/scripts/seed-e2e.js
const ACCOUNTS = {
  admin: "e2e-admin@example.com",
  seller: "e2e-seller@example.com",
  buyer: "e2e-buyer@example.com",
};
const RUN_ID = Date.now().toString(36);
const TITLE = `[E2E ${RUN_ID}] Nhà phố kiểm thử`;
const AREA = `Khu E2E ${RUN_ID}`;

const login = async (browser, role) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto("/login");
  await page.fill('input[type="email"]', ACCOUNTS[role]);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return page;
};

const pickOption = async (page, name, label) => {
  await page.click(`button[name="${name}"]`);
  await page.getByRole("option", { name: label }).click();
};

const openBell = async (page) => {
  await page.getByRole("button", { name: /^Thông báo/ }).first().click();
};

test("kiểm duyệt tin + luồng mua bán", async ({ browser }) => {
  const seller = await login(browser, "seller");
  const admin = await login(browser, "admin");
  const buyer = await login(browser, "buyer");

  // ===== Seller đăng tin → chờ duyệt =====
  const dialogs = [];
  seller.on("dialog", (d) => dialogs.push(d.message()));
  await seller.goto("/add-property");
  await seller.fill('[name="title"]', TITLE);
  await seller.fill('[name="description"]', "Tin tạo bởi Playwright E2E.");
  await pickOption(seller, "propertyType", "Nhà riêng / Biệt thự");
  await seller.fill('[name="bhk"]', "3");
  await seller.fill('[name="bathrooms"]', "2");
  await seller.fill('[name="areaSize"]', "90");
  await pickOption(seller, "furnishing", "Nội thất đầy đủ");
  await seller.fill('[name="price"]', "3200000000");
  await seller.fill('[name="city"]', "Đà Nẵng");
  await seller.fill('[name="pincode"]', "550000");
  await seller.fill('[name="area"]', AREA);
  await seller.click('button[type="submit"]');
  await seller.waitForURL("**/dashboard");
  expect(dialogs.join(" ")).toContain("sau khi quản trị viên duyệt");

  // Buyer chưa thấy tin
  await buyer.goto("/properties");
  await expect(buyer.getByText(TITLE)).toHaveCount(0);

  // ===== Admin từ chối có lý do =====
  await admin.goto("/admin/properties");
  const card = admin.locator("div", { has: admin.getByText(TITLE, { exact: true }) }).filter({
    has: admin.getByTitle("Từ chối tin"),
  }).last();
  await card.getByTitle("Từ chối tin").click();
  const rejectDialog = admin.getByRole("dialog", { name: "Từ chối tin đăng" });
  await rejectDialog.getByRole("textbox").fill("Ảnh và mô tả chưa đúng thực tế");
  await rejectDialog.getByRole("button", { name: "Từ chối tin" }).click();
  await expect(rejectDialog).toHaveCount(0);
  await admin.getByRole("button", { name: /^Bị từ chối/ }).click();
  await expect(admin.getByText(TITLE)).toBeVisible();

  // ===== Seller nhận thông báo realtime + thấy lý do =====
  await expect(seller.getByRole("button", { name: /Thông báo \(\d+ chưa đọc\)/ })).toBeVisible();
  await openBell(seller);
  await expect(seller.getByText("Tin đăng của bạn bị từ chối").first()).toBeVisible();
  await seller.goto("/my-properties");
  await seller.fill('input[placeholder^="Tìm theo khu vực"]', AREA);
  await expect(seller.getByText("Ảnh và mô tả chưa đúng thực tế")).toBeVisible();

  // Seller sửa → tự gửi duyệt lại
  await seller.locator('a[href^="/edit-property/"]').first().click();
  await seller.fill('[name="description"]', "Mô tả đã cập nhật đúng thực tế.");
  await seller.click('button[type="submit"]');
  await seller.waitForURL("**/dashboard");
  expect(dialogs.join(" ")).toContain("gửi duyệt lại");

  // ===== Admin duyệt =====
  await admin.reload();
  const queueCard = admin.locator("div", { has: admin.getByText(TITLE, { exact: true }) }).filter({
    has: admin.getByTitle("Duyệt tin"),
  }).last();
  await queueCard.getByTitle("Duyệt tin").click();
  await admin.getByRole("button", { name: /^Đã duyệt/ }).click();
  await expect(admin.getByText(TITLE)).toBeVisible();

  // ===== Buyer: thấy tin + nhãn, yêu thích, yêu cầu tư vấn, chat =====
  await buyer.goto("/properties");
  await buyer.getByText(TITLE).first().click();
  await expect(buyer.getByText("Tin đã kiểm duyệt")).toBeVisible();
  await expect(buyer.getByText("Nhà riêng / Biệt thự").first()).toBeVisible();

  await buyer.locator(`xpath=//h1[contains(., "${TITLE}")]/ancestor::div[2]//button`).first().click();
  await buyer.goto("/wishlist");
  await expect(buyer.getByText(TITLE)).toBeVisible();

  await buyer.goBack();
  await buyer.fill('textarea[placeholder="Nội dung tin nhắn..."]', "Cho tôi hẹn xem nhà cuối tuần.");
  await buyer.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(buyer.getByText("Đã gửi yêu cầu!")).toBeVisible();

  await buyer.getByRole("button", { name: "Chat", exact: true }).click();
  await buyer.waitForURL("**/chat-messages");
  await expect(buyer.getByText(TITLE).first()).toBeVisible();

  await seller.goto("/chat-messages");
  await seller.getByText("E2E Buyer").first().click();
  await seller.fill('input[placeholder="Nhập tin nhắn..."]', `Chào bạn ${RUN_ID}`);
  await seller.keyboard.press("Enter");
  await expect(buyer.getByText(`Chào bạn ${RUN_ID}`)).toBeVisible();

  // ===== Dọn dẹp: seller xóa tin qua giao diện =====
  await seller.goto("/my-properties");
  await seller.fill('input[placeholder^="Tìm theo khu vực"]', AREA);
  await seller.locator('a[href^="/edit-property/"] + button').first().click();
  await expect(seller.getByText(TITLE)).toHaveCount(0);
});
