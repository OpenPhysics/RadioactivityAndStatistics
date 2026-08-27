/**
 * Playwright configuration for optional fuzz testing (Template smoke).
 */

import { defineConfig } from "@playwright/test";

const fuzzSeconds = Math.max(1, parseInt(process.env["FUZZ_DURATION"] || "30", 10) || 30);

export default defineConfig({
  testDir: "./tests/fuzz",
  timeout: (fuzzSeconds + 120) * 1000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run start",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
      },
    },
  ],
});
