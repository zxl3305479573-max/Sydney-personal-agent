const { chromium } = require("../../apps/desktop/node_modules/@playwright/test");

const base = "http://127.0.0.1:5173";
const email = "stage-browser@example.invalid";
const password = "synthetic-browser-password-2849";
let browser;
let page;
let deadline;
const errors = [];
const failedResponses = [];

async function check() {
  browser = await chromium.launch({
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    headless: true,
    args: ["--disable-background-networking", "--disable-component-update", "--disable-sync"],
  });
  const context = await browser.newContext({ locale: "en-US" });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin === base ? route.continue() : route.abort();
  });
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error));
  page.on("response", (result) => {
    if (result.status() >= 400) {
      failedResponses.push({ path: new URL(result.url()).pathname, status: result.status() });
    }
  });
  const response = await page.goto(`${base}/sign-up`, { waitUntil: "domcontentloaded", timeout: 15000 });
  if (response?.status() !== 200) throw new Error("signup page unavailable");
  await page.getByRole("heading", { name: /Create your Sydney|创建你的 Sydney/ }).waitFor({ timeout: 15000 });
  await page.locator("#name").fill("Staging Browser");
  await page.locator("#email").fill(email);
  await page.locator('input[type="password"]').nth(0).fill(password);
  await page.locator('input[type="password"]').nth(1).fill(password);
  const signup = page.waitForResponse((result) =>
    result.url().endsWith("/api/auth/sign-up/email") && result.request().method() === "POST");
  await page.locator('form button[type="submit"]').click();
  if (!(await signup).ok()) throw new Error("browser signup failed");
  await page.waitForURL(/\/(?:onboarding|app)/, { timeout: 15000 });
  const firstUser = await page.evaluate(async () => {
    const res = await fetch("/rpc/me", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: {} }),
    });
    return res.ok ? (await res.json()).json?.userId : null;
  });
  if (!firstUser) throw new Error("browser signup session unavailable");
  const signout = await page.evaluate(async () => {
    const res = await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    return res.ok;
  });
  if (!signout) throw new Error("browser signout failed");
  await page.goto(`${base}/sign-in`, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.locator("#email").fill(email);
  await page.locator('input[type="password"]').fill(password);
  const signin = page.waitForResponse((result) =>
    result.url().endsWith("/api/auth/sign-in/email") && result.request().method() === "POST");
  await page.locator('form button[type="submit"]').click();
  if (!(await signin).ok()) throw new Error("browser signin failed");
  await page.waitForURL(/\/(?:onboarding|app)/, { timeout: 15000 });
  const secondUser = await page.evaluate(async () => {
    const res = await fetch("/rpc/me", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: {} }),
    });
    return res.ok ? (await res.json()).json?.userId : null;
  });
  if (secondUser !== firstUser) throw new Error("browser signin session differs");
  if (errors.length) throw new Error(`browser reported ${errors.length} page errors`);
  console.log("browser-render-signup-signin-session-passed");
}

Promise.race([
  check(),
  new Promise((_, reject) => {
    deadline = setTimeout(() => reject(new Error("browser probe timed out")), 35000);
  }),
])
  .catch(async (error) => {
    console.error(error.message);
    if (page && !page.isClosed()) {
      const state = await page.evaluate(() => ({
        path: location.pathname,
        title: document.title,
        headings: [...document.querySelectorAll("h1,h2")].map((node) => node.textContent?.trim().slice(0, 80)),
        inputs: [...document.querySelectorAll("input")].map((node) => ({
          type: node.type,
          placeholder: node.placeholder,
        })),
        rootTextLength: document.querySelector("#root")?.textContent?.trim().length ?? 0,
      })).catch(() => null);
      console.error(JSON.stringify({ state, pageErrors: errors.length, failedResponses }));
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    clearTimeout(deadline);
    if (browser) await browser.close();
  });
