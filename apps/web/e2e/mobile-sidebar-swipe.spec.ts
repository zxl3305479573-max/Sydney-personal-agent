import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { captureScreenshot, completeOnboarding, signup } from "./helpers";

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 393, height: 852 },
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
  await expect(page.getByTestId("mobile-create-bot")).toBeVisible();
  await expect(page.getByTestId("mobile-create-group")).toBeVisible();
  await page.getByTestId("mobile-create-group").click();
  await expect(sidebar).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByTestId("side-panel")).toHaveAttribute("data-panel", "create-group");
  await expect(page.getByPlaceholder(/Name this group|群聊名称/)).toBeVisible();
  await page
    .getByTestId("side-panel")
    .getByRole("button", { name: /Back|返回/ })
    .click();
  await expect(sidebar).not.toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("button", { name: "Connect apps" })).toBeVisible();
  await expect(page.getByTestId("sidebar-search")).toBeVisible();
  await page.addStyleTag({
    content: "#root { padding-top: 59px; padding-bottom: 34px; }",
  });
  const bounds = await sidebar.evaluate((element) => {
    const sidebarRect = element.getBoundingClientRect();
    const avatarRect = element
      .querySelector('[data-testid="user-menu-trigger"]')
      ?.getBoundingClientRect();
    const searchRect = element
      .querySelector('[data-testid="sidebar-search"]')
      ?.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      sidebarTop: sidebarRect.top,
      sidebarBottom: sidebarRect.bottom,
      viewportHeight: window.innerHeight,
      topPadding: parseFloat(style.paddingTop),
      bottomPadding: parseFloat(style.paddingBottom),
      avatarTop: avatarRect ? avatarRect.top - sidebarRect.top : null,
      searchBottom: searchRect ? sidebarRect.bottom - searchRect.bottom : null,
    };
  });
  expect(bounds.sidebarTop).toBeCloseTo(0, 0);
  expect(bounds.sidebarBottom).toBeCloseTo(bounds.viewportHeight, 0);
  expect(bounds.avatarTop).toBeCloseTo(bounds.topPadding + 12, 0);
  expect(bounds.searchBottom).toBeCloseTo(bounds.bottomPadding, 0);
  await captureScreenshot(page, testInfo, "mobile-chat-list");

  await page.getByTestId("user-menu-trigger").click();
  await page.getByRole("button", { name: "Skills", exact: true }).click();
  const skills = page.getByRole("dialog", { name: "Skills", exact: true });
  await expect(skills.getByTestId("your-skills")).toBeVisible();
  const skillColumns = await skills
    .getByTestId("skill-packs")
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(skillColumns).toBe(1);
  const titleBox = await skills.getByRole("heading", { name: "Skills", exact: true }).boundingBox();
  const contentBox = await skills.getByTestId("your-skills").boundingBox();
  expect(titleBox).not.toBeNull();
  expect(contentBox).not.toBeNull();
  expect(contentBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height);
  await skills.getByRole("button", { name: "Close skills", exact: true }).click();

  await page.getByTestId("mobile-create-bot").click();
  await expect(page.getByTestId("create-bot-dialog")).toBeVisible();
  await expect(sidebar).not.toHaveClass(/-translate-x-full/);
  await expect(page.getByRole("group", { name: /Bot shape|Bot 形状/ })).toBeVisible();
  await captureScreenshot(page, testInfo, "mobile-create-bot");
  await page
    .getByTestId("create-bot-dialog")
    .getByRole("button", { name: /Close|关闭/ })
    .click();
  await expect(sidebar).not.toHaveAttribute("aria-hidden", "true");

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
