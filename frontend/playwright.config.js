import { defineConfig } from "@playwright/test";

// E2E chạy trên một bộ server riêng (KHÔNG dùng database production):
//   backend:  PORT=5055 MONGODB_DB_NAME=realestate_e2e FRONTEND_URL=http://localhost:5174 node server.js
//   seed:     MONGODB_DB_NAME=realestate_e2e node scripts/seed-e2e.js   (trong backend/)
//   frontend: VITE_API_URL=http://localhost:5055/ npx vite --port 5174
//   chạy:     npm run test:e2e        (Windows có sẵn Edge: PW_CHANNEL=msedge)
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5174",
    channel: process.env.PW_CHANNEL || undefined,
    headless: true,
    viewport: { width: 1366, height: 860 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
