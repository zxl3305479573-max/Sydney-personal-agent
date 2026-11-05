import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { captureScreenshot, completeOnboarding, signup } from "./helpers";

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 390, height: 844 },
});

async function prepareOnboarding(page: Page) {
  await page.route("**/rpc/me", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { json: Record<string, unknown> };
    await route.fulfill({ response, json: { json: { ...body.json, needsModel: false } } });
  });
  await page.route("**/rpc/integrationSetup/get", (route) =>
    route.fulfill({
      json: {
        json: {
          canConfigure: false,
          needsSetup: false,
          providers: [],
          webUrl: "https://example.test/integrations/setup",
        },
      },
    }),
  );
}

async function swipe(page: Page, start: [number, number], end: [number, number]) {
  await page.getByTestId("shell-root").evaluate(
    (shell, { start, end }) => {
      function touch([clientX, clientY]: [number, number]) {
        return new Touch({ clientX, clientY, identifier: 1, target: shell });
      }
      const first = touch(start);
      shell.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          cancelable: true,
          changedTouches: [first],
          touches: [first],
        }),
      );
      const last = touch(end);
      shell.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          cancelable: true,
          changedTouches: [last],
          touches: [],
        }),
      );
    },
    { start, end },
  );
}

test("shows the mobile chat list first and reopens it from a chat", async ({ page }, testInfo) => {
  await prepareOnboarding(page);
  const stamp = Date.now();
  await signup(page, `mobile-sidebar-swipe-${stamp}@rakazo.test`, "password12", "Swipe Test");
  await completeOnboarding(page);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app\/?$/);

  const sidebar = page.getByTestId("bots-sidebar");
  const edge = page.getByTestId("mobile-sidebar-swipe-edge");
  await expect(sidebar).toBeVisible();
  await expect(sidebar).not.toHaveAttribute("aria-hidden", "true");
  await expect(edge).toHaveCount(0);
  await expect(sidebar).toContainText("Chief");
  await captureScreenshot(page, testInfo, "mobile-chat-list");

  await page.getByRole("button", { name: /Chief/ }).first().click();
  await expect(page).toHaveURL(/\/app\/[^/]+$/);
  await expect(sidebar).toHaveAttribute("aria-hidden", "true");
  await expect(edge).toHaveCSS("touch-action", "none");
  await swipe(page, [16, 420], [92, 426]);
  await expect(sidebar).not.toHaveAttribute("aria-hidden", "true");
  await captureScreenshot(page, testInfo, "mobile-sidebar-edge-swipe-open");

  // Going back to the list route reopens it; right-to-left layouts swipe in from the other edge.
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/?$/);
  await expect(sidebar).not.toHaveAttribute("aria-hidden", "true");
  await page.locator("html").evaluate((html) => html.setAttribute("dir", "rtl"));
  await expect(sidebar).toContainText("Chief");
});
