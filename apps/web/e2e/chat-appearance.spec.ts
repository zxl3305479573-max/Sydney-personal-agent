import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  activeBotId,
  captureScreenshot,
  completeOnboarding,
  openNewBot,
  rpc,
  signup,
} from "./helpers";

async function backgroundImage(page: Page, name: string, color: string) {
  const encoded = await page.evaluate((color) => {
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 4;
    const context = canvas.getContext("2d")!;
    context.fillStyle = color;
    context.fillRect(0, 0, 4, 4);
    return canvas.toDataURL("image/png").split(",")[1]!;
  }, color);
  return { name, mimeType: "image/png", buffer: Buffer.from(encoded, "base64") };
}

function surfaceAlpha(surface: Locator) {
  return surface.evaluate((element) => {
    const context = document.createElement("canvas").getContext("2d")!;
    context.fillStyle = getComputedStyle(element).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    return context.getImageData(0, 0, 1, 1).data[3];
  });
}

for (const width of [390, 1280]) {
  test(`backgrounds, shared surfaces and existing group members at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await signup(page, `appearance-${width}-${Date.now()}@rakazo.test`, "password12", "Appearance");
    await completeOnboarding(page);
    const firstBot = activeBotId(page);
    const secondBot = await rpc<{ id: string }>(page, "bots/create", {
      name: "Background companion",
      description: "",
      notifyOnFinish: true,
      computerMode: "team",
    });
    const extraBot = await rpc<{ id: string }>(page, "bots/create", {
      name: "Extra companion",
      description: "",
      notifyOnFinish: true,
      computerMode: "team",
    });
    const group = await rpc<{ id: string }>(page, "groups/create", {
      name: "Background team",
      botIds: [firstBot, secondBot.id],
    });
    const composerBackground = await page
      .getByTestId("composer-bar")
      .evaluate((element) => getComputedStyle(element).backgroundColor);

    await page.goto(`/app/${firstBot}?settings=general`);
    const settings = page.getByTestId("user-settings");
    const appearance = settings.getByTestId("chat-appearance-settings");
    await appearance
      .locator('input[type="file"]')
      .setInputFiles(await backgroundImage(page, "global.png", "#305dc0"));
    const slider = appearance.getByRole("slider", { name: "组件不透明度" });
    await slider.focus();
    await slider.press("Home");
    await expect(slider).toHaveValue("0");
    await expect.poll(() => surfaceAlpha(settings)).toBe(0);
    await expect.poll(() => surfaceAlpha(settings.getByTestId("settings-nav-row"))).toBe(0);
    await appearance.getByRole("button", { name: "保存外观", exact: true }).click();
    await expect(appearance.getByText("聊天外观已保存到当前浏览器。")).toBeVisible();
    await settings.getByRole("button", { name: "Close user settings" }).click();
    await expect(page.getByTestId("workspace-background")).toBeVisible();
    await expect(page.locator('[data-space-switch="main"]')).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    expect(await page.getByTestId("workspace-background").boundingBox()).toEqual({
      x: 0,
      y: 0,
      width,
      height: 844,
    });
    await expect(page.getByTestId("composer-bar")).toHaveCSS(
      "background-color",
      composerBackground,
    );
    await captureScreenshot(page, testInfo, `global-background-edges-${width}`);

    if (width < 768) {
      await page.getByRole("button", { name: "Open navigation", exact: true }).click();
      await page
        .getByTestId("bots-sidebar")
        .getByRole("button", { name: "New bot", exact: true })
        .click();
    } else {
      await openNewBot(page);
    }
    const createBot = page.getByTestId("create-bot-dialog");
    await expect(createBot).toBeVisible();
    for (const surface of [
      createBot,
      createBot.getByRole("textbox", { name: "Name", exact: true }),
      createBot.getByRole("button", { name: "Create", exact: true }),
    ]) {
      await expect.poll(() => surfaceAlpha(surface)).toBe(0);
    }
    await captureScreenshot(page, testInfo, `shared-transparent-new-bot-${width}`);
    await page.keyboard.press("Escape");
    await page.goto(`/app/${firstBot}`);
    await page.getByTestId("bot-settings-trigger").click();
    const panel = page.getByTestId("side-panel");
    await panel.getByRole("tab", { name: "Advanced", exact: true }).click();
    const botBackground = panel.getByRole("region", { name: "当前对话背景", exact: true });
    await botBackground.scrollIntoViewIfNeeded();
    expect(
      await botBackground.evaluate((element) => element.previousElementSibling?.textContent),
    ).toContain("Read replies aloud");
    await botBackground
      .locator('input[type="file"]')
      .setInputFiles(await backgroundImage(page, "bot.png", "#9a254d"));
    await expect(botBackground.locator("select option:checked")).toHaveText("bot.png");
    await expect(page.locator("main")).toHaveAttribute("data-conversation-background", "true");
    await captureScreenshot(page, testInfo, `bot-background-below-voice-${width}`);
    await page.reload();
    await expect(page.locator("main")).toHaveAttribute("data-conversation-background", "true");
    await page.goto(`/app/${secondBot.id}`);
    await expect(page.getByTestId("conversation-background-layer")).toHaveCount(0);
    await expect(page.getByTestId("workspace-background")).toBeVisible();

    await page.goto(`/app/g/${group.id}`);
    await page.getByTestId("bot-settings-trigger").click();
    await panel.getByRole("button", { name: "Add members", exact: true }).click();
    await panel
      .getByRole("checkbox", { name: "Add Extra companion to the group", exact: true })
      .click();
    const groupBackground = panel.getByRole("region", { name: "当前对话背景", exact: true });
    await groupBackground
      .locator('input[type="file"]')
      .setInputFiles(await backgroundImage(page, "group.png", "#146b4e"));
    await expect(groupBackground.locator("select option:checked")).toHaveText("group.png");
    await groupBackground.scrollIntoViewIfNeeded();
    await captureScreenshot(page, testInfo, `group-background-add-member-${width}`);
    await panel.getByRole("button", { name: "Save", exact: true }).click();
    await expect(panel).toHaveAttribute("data-panel", "closed");
    const savedGroups = await rpc<Array<{ id: string; members: Array<{ botId: string }> }>>(
      page,
      "groups/list",
      {},
    );
    expect(
      savedGroups
        .find((candidate) => candidate.id === group.id)
        ?.members.map((member) => member.botId),
    ).toContain(extraBot.id);
    await page.reload();
    await expect(page.locator("main")).toHaveAttribute("data-conversation-background", "true");
    await page.getByTestId("bot-settings-trigger").click();
    await expect(panel.locator("#conversation-background option:checked")).toHaveText("group.png");
    await panel.locator("#conversation-background").selectOption("");
    await expect(page.getByTestId("conversation-background-layer")).toHaveCount(0);
    await page.goto(`/app/${firstBot}`);
    await expect(page.locator("main")).toHaveAttribute("data-conversation-background", "true");
  });
}
