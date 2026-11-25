import { devices, expect, test } from "@playwright/test";

test("shows Sydney installation and documentation links", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sydney Personal Agent");
  await expect(page.getByRole("link", { name: "View Windows releases" })).toHaveAttribute(
    "href",
    "https://github.com/zxl3305479573-max/Sydney-personal-agent/releases",
  );
  await expect(page.getByRole("link", { name: "iPhone setup guide" })).toBeVisible();
  await testInfo.attach("Sydney homepage", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test.describe("iPhone layout", () => {
  const { defaultBrowserType: _, ...viewport } = devices["iPhone 15"];
  test.use(viewport);

  test("shows the Chinese iPhone setup link", async ({ page }, testInfo) => {
    await page.goto("/zh/");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByRole("link", { name: "iPhone 安装指南" })).toBeVisible();
    await testInfo.attach("Sydney iPhone homepage", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });
});
