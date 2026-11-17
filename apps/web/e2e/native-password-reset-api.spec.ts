import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import { createPasswordResetFixtureServer } from "../../api/e2e/native-password-reset-fixture";

test("API reset page runs with CSP and retries without a web app or scheme transfer", async ({
  page,
}) => {
  const fixture = createPasswordResetFixtureServer();
  await new Promise<void>((resolve) => fixture.server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(fixture.server.address() as AddressInfo).port}`;
  try {
    await page.goto(`${origin}/api/auth/native-reset?token=abcdefghijklmnop123456&token=duplicate`);
    await expect(page.getByRole("button", { name: "重置密码" })).toBeDisabled();
    expect(fixture.attempts()).toBe(0);
    expect(page.url()).toBe(`${origin}/api/auth/native-reset`);
    await page.goto(`${origin}/api/auth/native-reset?token=abcdefghijklmnop123456`);
    expect(fixture.attempts()).toBe(0);
    await page.getByLabel("新密码（", { exact: false }).fill("offline-password34");
    await page.getByLabel("确认新密码", { exact: true }).fill("offline-password34");
    await page.getByRole("button", { name: "重置密码" }).click();
    await expect(page.getByRole("status")).toContainText("未能确认重置成功");
    await expect(page.getByRole("button", { name: "重置密码" })).toBeEnabled();
    await page.getByRole("button", { name: "重置密码" }).click();
    await expect(page.getByRole("status")).toContainText("密码已更新");
    await expect(page.getByRole("button", { name: "重置密码" })).toBeDisabled();
    expect(fixture.attempts()).toBe(2);
    await expect(page.locator("#password")).toHaveValue("");
    expect(page.url()).toBe(`${origin}/api/auth/native-reset`);
  } finally {
    fixture.server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      fixture.server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
