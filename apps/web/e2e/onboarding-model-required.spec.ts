import { expect, test } from "@playwright/test";
import { signup } from "./helpers";

test.afterEach(async ({ page }) => {
  // Finish intercepted responses before the browser context is disposed.
  await page.unrouteAll({ behavior: "wait" });
});

test("onboarding cannot continue with an empty or failed model catalog", async ({ page }) => {
  let unavailable: "empty" | "failed" = "empty";
  await page.route("**/rpc/me", async (route) => {
    // The reload below can cancel a profile read mid-fetch.
    const response = await route.fetch().catch(() => null);
    if (!response) return route.abort().catch(() => {});
    const body = (await response.json()) as { json: Record<string, unknown> };
    await route.fulfill({ response, json: { json: { ...body.json, needsModel: true } } });
  });
  await page.route("**/rpc/models/list", (route) =>
    unavailable === "failed" ? route.abort() : route.fulfill({ json: { json: [] } }),
  );
  const stamp = Date.now();
  await signup(page, `catalog-${stamp}@rakazo.test`, "password12", "Model setup");

  for (const next of ["empty", "failed"] as const) {
    if (next === "failed") {
      unavailable = next;
      await page.reload();
    }
    await expect(page.getByRole("heading", { name: "Connect a model" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
    await expect(page.getByRole("heading", { name: "Create your first bot" })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Message Sydney" })).toHaveCount(0);
  }
});

test("onboarding requires a custom endpoint and text model", async ({ page }) => {
  await page.route("**/rpc/me", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { json: Record<string, unknown> };
    await route.fulfill({ response, json: { json: { ...body.json, needsModel: true } } });
  });
  const stamp = Date.now();
  await signup(page, `ollama-${stamp}@rakazo.test`, "password12", "Model setup");
  await expect(page.getByRole("heading", { name: "Connect a model" })).toBeVisible();
  const endpoint = page.getByLabel("OpenAI-compatible server URL");
  const continueButton = page.getByRole("button", { name: "Continue", exact: true });
  await expect(continueButton).toBeDisabled();
  await expect(endpoint).toBeEmpty();
  await endpoint.fill("https://models.example.test/v1");
  await expect(continueButton).toBeDisabled();
  await page.getByLabel("Model id", { exact: true }).fill("test-model");
  await expect(continueButton).toBeEnabled();
});

test("onboarding does not offer preset providers or credits", async ({ page }) => {
  await page.route("**/rpc/me", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { json: Record<string, unknown> };
    await route.fulfill({
      response,
      json: { json: { ...body.json, needsModel: true, billingEnabled: true } },
    });
  });
  await signup(page, `credits-${Date.now()}@rakazo.test`, "password12", "Credits");
  await expect(page.getByRole("heading", { name: "Connect a model" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("combobox", { name: "Provider" }).click();
  await expect(page.getByRole("option", { name: "Rakazo credits", exact: true })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "Ollama Cloud", exact: true })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "OpenAI-compatible", exact: true })).toBeVisible();
});
