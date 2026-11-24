import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 35000,
  use: {
    viewport: { width: 1440, height: 1000 },
    locale: "ru-RU",
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  },
  projects: [{ name: "chromium" }],
});
