import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { captureScreenshot, completeOnboarding, rpc, signup } from "./helpers";

function slackCard(page: Page) {
  return page.getByRole("group", { name: "Slack connection" });
}

test("focus choice suggests apps and preserves a completed connection", async ({
  page,
}, testInfo) => {
  const stamp = Date.now();
  await signup(page, `onboarding-${stamp}@rakazo.test`, "password12", "Robin");
  await completeOnboarding(page);

  await expect(page.getByText("你希望我先帮你做什么？", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /日常工作/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /研究和写作/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /各种事情/ })).toBeVisible();
  await page.mouse.move(1, 1);
  await captureScreenshot(page, testInfo, "01-focus-choice");
  await captureScreenshot(page, testInfo, "choice-card-onboarding");

  await rpc(page, "preferences/update", { locale: "zh-CN" });
  await page.getByRole("button", { name: /日常工作/ }).click();
  // The focus step suggests apps but must not rename the bot: the name the
  // user chose during creation ("Chief") is preserved.
  await expect(
    page.getByTestId("bot-settings-trigger").getByText("Sydney", { exact: true }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("Message Sydney")).toBeVisible();
  await expect(page.getByText("Slack", { exact: true })).toBeVisible();
  await expect(page.getByText("Gmail", { exact: true })).toBeVisible();
  const connectionCards = page.getByRole("group", { name: / connection$/ });
  await expect(connectionCards).toHaveCount(3);
  const cardBoxes = await connectionCards.evaluateAll((cards) =>
    cards.map((card) => {
      const { bottom, top } = card.getBoundingClientRect();
      return { bottom, top };
    }),
  );
  expect(cardBoxes[1].top - cardBoxes[0].bottom).toBeGreaterThanOrEqual(8);
  expect(cardBoxes[2].top - cardBoxes[1].bottom).toBeGreaterThanOrEqual(8);
  await page
    .getByTestId("transcript")
    .getByText("连接这些应用后，我就可以开始了解情况。")
    .scrollIntoViewIfNeeded();
  await page.mouse.move(1, 1);
  await captureScreenshot(page, testInfo, "02-app-suggestions");
  const authorizeButton = slackCard(page).getByRole("button", { name: "Authorize" });
  const restingBackground = await authorizeButton.evaluate(
    (button) => getComputedStyle(button).backgroundColor,
  );
  await authorizeButton.hover();
  await expect
    .poll(() => authorizeButton.evaluate((button) => getComputedStyle(button).backgroundColor))
    .not.toBe(restingBackground);
  await captureScreenshot(page, testInfo, "02-app-suggestions-authorize-hover");

  await authorizeButton.click();
  await expect(slackCard(page).getByText("Connected", { exact: true })).toBeVisible();
  await expect(slackCard(page).getByText("Connected", { exact: true })).toHaveCSS("opacity", "1");
  await expect
    .poll(async () => {
      const connections = await rpc<Array<{ provider: string; status: string }>>(
        page,
        "connections/list",
        {},
      );
      return connections.some(
        (connection) => connection.provider === "SLACK" && connection.status === "connected",
      );
    })
    .toBe(true);
  await page.mouse.move(1, 1);
  await captureScreenshot(page, testInfo, "03-slack-connected");

  await page.reload();
  await expect(slackCard(page).getByText("Connected", { exact: true })).toBeVisible();
  await page.mouse.move(1, 1);
  await captureScreenshot(page, testInfo, "04-connected-after-reload");
});

test("choice refresh failures leave options available for retry", { tag: "@nightly" }, async ({
  page,
}) => {
  await signup(page, `choice-refresh-${Date.now()}@rakazo.test`, "password12", "Choice Retry");
  await completeOnboarding(page);
  const choice = page.getByRole("button", { name: /日常工作/ });
  await expect(choice).toBeEnabled();
  // Keep the existing choice rendered while its save succeeds and navigation refresh fails.
  await page.route("**/rpc/onboarding/choose", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ json: { ok: true } }),
    }),
  );
  await page.route("**/rpc/spaces/list", (route) => route.abort());
  await Promise.all([page.waitForRequest("**/rpc/spaces/list"), choice.click()]);
  await expect(choice).toBeEnabled();
});
