import { expect, test } from "@playwright/test";
import { completeOnboarding, signup } from "./helpers";

test("bot settings keep Sydney avatars and uploaded-avatar controls", async ({ page }) => {
  const stamp = Date.now();
  await signup(page, `avatar-studio-${stamp}@rakazo.test`, "password12", "Avatar Studio");
  await completeOnboarding(page);
  await page.goto("/app");
  await page.waitForURL(/\/app\/[^/]+$/);

  await page.getByTestId("bot-settings-trigger").click();
  const settings = page.getByTestId("bot-settings");
  await expect(settings).toBeVisible();

  await settings.getByTestId("avatar-studio-trigger").click();
  const studio = page.getByTestId("avatar-studio");
  await expect(studio).toBeVisible();
  await expect(studio.getByText("Avatar library", { exact: true })).toBeVisible();
  for (const name of ["紫晶", "橙花", "蓝羽"]) {
    await expect(studio.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await expect(studio.getByLabel("Add from device")).toBeAttached();
  await expect(studio.getByText(/Rakazo/i)).toHaveCount(0);
  await expect(studio.locator(".rakazo-logo-avatar")).toHaveCount(0);

  const lilacAvatar = studio.getByRole("button", { name: "紫晶", exact: true });
  await lilacAvatar.click();
  await expect(lilacAvatar).toHaveAttribute("aria-pressed", "true");
});
