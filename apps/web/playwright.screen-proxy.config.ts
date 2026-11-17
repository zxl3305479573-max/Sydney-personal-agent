import { defineConfig } from "@playwright/test";

// These local fixtures exercise the real Vite proxy without starting an API, database, or Electron.
export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "screen-proxy-isolation.spec.ts",
    "wuying-api-isolation.spec.ts",
    "native-password-reset-api.spec.ts",
    "desktop-standalone-proxy.spec.ts",
  ],
  workers: 1,
  use: {
    headless: true,
    launchOptions: process.env.SCREEN_TEST_BROWSER
      ? { executablePath: process.env.SCREEN_TEST_BROWSER }
      : undefined,
    video: "off",
  },
});
