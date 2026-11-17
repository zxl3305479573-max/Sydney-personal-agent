const fs = require("node:fs/promises");
const path = require("node:path");
const { _electron, chromium } = require("../../apps/desktop/node_modules/@playwright/test");

const base = "http://127.0.0.1:5173";
const executablePath = path.resolve(__dirname, "../../apps/desktop/out/win-unpacked/Sydney.exe");
const email = "stage-desktop@example.invalid";
const password = "synthetic-desktop-password-2849";
let app;
let companionBrowser;
let userData;
let deadline;
let desktopPage;

async function check() {
  const root = await fs.realpath(__dirname);
  userData = await fs.mkdtemp(path.join(root, ".sydney-stage-desktop-"));
  const env = {
    ...process.env,
    RAKAZO_PERFORMANCE_USER_DATA: userData,
    SYDNEY_PC_BACKEND_URL: base,
  };
  delete env.RAKAZO_WEB_URL;
  delete env.RAKAZO_FORCE_SETUP;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({ executablePath, args: [], env, timeout: 20000 });
  const packaged = await app.evaluate(({ app: electronApp, BrowserWindow }) => {
    electronApp.on("browser-window-created", (_event, window) => {
      window.on("show", () => window.hide());
      window.hide();
    });
    for (const window of BrowserWindow.getAllWindows()) window.hide();
    return electronApp.isPackaged;
  });
  if (!packaged) throw new Error("desktop executable is not packaged");

  let page;
  for (let attempt = 0; attempt < 150; attempt++) {
    const windows = app.windows().filter((candidate) => !candidate.isClosed());
    const starting = windows.some((candidate) => {
      const url = candidate.url();
      return !url || url === "about:blank" || /^file:.*\/splash\.html(?:[?#]|$)/i.test(url);
    });
    for (const candidate of starting ? [] : windows.reverse()) {
      if (candidate.isClosed() || !candidate.url().startsWith(base)) continue;
      if (await candidate.evaluate(() => window.innerWidth > 100).catch(() => false)) {
        page = candidate;
        break;
      }
    }
    if (page) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!page) throw new Error("desktop did not open the staging origin");
  desktopPage = page;
  await page.waitForTimeout(2000);
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin === base ? route.continue() : route.abort();
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error));
  const initial = await page.goto(`${base}/sign-up`, { waitUntil: "domcontentloaded", timeout: 15000 });
  if (initial?.status() !== 200) throw new Error("desktop signup page unavailable");
  await page.getByRole("heading", { name: /Create your Sydney|创建你的 Sydney/ }).waitFor({ timeout: 15000 });
  await page.locator("#name").fill("Staging Desktop");
  await page.locator("#email").fill(email);
  await page.locator('input[type="password"]').nth(0).fill(password);
  await page.locator('input[type="password"]').nth(1).fill(password);
  const signup = page.waitForResponse((result) =>
    result.url().endsWith("/api/auth/sign-up/email") && result.request().method() === "POST");
  await page.locator('form button[type="submit"]').click();
  if (!(await signup).ok()) throw new Error("desktop signup failed");
  await page.waitForURL(/\/(?:onboarding|app)/, { timeout: 15000 });
  const firstUser = await page.evaluate(async () => {
    const result = await fetch("/rpc/me", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: {} }),
    });
    return result.ok ? (await result.json()).json?.userId : null;
  });
  if (!firstUser) throw new Error("desktop session unavailable");
  const signout = await page.evaluate(async () => {
    const result = await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    return result.ok;
  });
  if (!signout) throw new Error("desktop signout failed");
  await page.goto(`${base}/sign-in`, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.locator("#email").fill(email);
  await page.locator('input[type="password"]').fill(password);
  const signin = page.waitForResponse((result) =>
    result.url().endsWith("/api/auth/sign-in/email") && result.request().method() === "POST");
  await page.locator('form button[type="submit"]').click();
  if (!(await signin).ok()) throw new Error("desktop signin failed");
  await page.waitForURL(/\/(?:onboarding|app)/, { timeout: 15000 });
  const secondUser = await page.evaluate(async () => {
    const result = await fetch("/rpc/me", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: {} }),
    });
    return result.ok ? (await result.json()).json?.userId : null;
  });
  if (secondUser !== firstUser) throw new Error("desktop signin session differs");
  console.log("desktop-authentication-passed");
  const actor = await rpc(page, "me");
  const bot = await rpc(page, "bots/create", {
    name: "Sync Bot", title: "Sync Bot", description: "", instructions: "", notifyOnFinish: false,
  }, actor.spaceId);
  await page.goto(`${base}/app/${encodeURIComponent(bot.id)}`, {
    waitUntil: "domcontentloaded",
    timeout: 10000,
  });
  const composer = page.locator('textarea[name="chat-message"]');
  await composer.waitFor({ state: "visible", timeout: 10000 });
  console.log("desktop-chat-composer-visible");
  const desktopSend = await sendFromComposer(page, "desktop to browser staging message");
  console.log("desktop-chat-submit-passed");
  const firstReply = await waitForReply(page, bot.id, actor.spaceId, desktopSend.runId, "desktop to browser staging message");
  await expectReplyVisible(page, firstReply);

  companionBrowser = await chromium.launch({
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    headless: true,
    timeout: 10000,
    args: ["--disable-background-networking", "--disable-component-update", "--disable-sync"],
  });
  const context = await companionBrowser.newContext({ locale: "en-US" });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin === base ? route.continue() : route.abort();
  });
  const other = await context.newPage();
  await other.goto(`${base}/sign-in`, { waitUntil: "domcontentloaded", timeout: 10000 });
  await other.locator("#email").fill(email);
  await other.locator('input[type="password"]').fill(password);
  const otherSignin = other.waitForResponse((result) =>
    result.url().endsWith("/api/auth/sign-in/email") && result.request().method() === "POST");
  await other.locator('form button[type="submit"]').click();
  if (!(await otherSignin).ok()) throw new Error("second client signin failed");
  await other.waitForURL(/\/(?:onboarding|app)/, { timeout: 10000 });
  const desktopSession = await sessionId(page);
  const otherSession = await sessionId(other);
  if (!desktopSession || !otherSession || desktopSession === otherSession) {
    throw new Error("client sessions are not independent");
  }
  const otherActor = await rpc(other, "me", {}, actor.spaceId);
  if (otherActor.userId !== actor.userId) throw new Error("client accounts differ");
  await waitForReply(other, bot.id, actor.spaceId, desktopSend.runId, "desktop to browser staging message");
  await other.goto(`${base}/app/${encodeURIComponent(bot.id)}`, {
    waitUntil: "domcontentloaded",
    timeout: 10000,
  });
  await expectReplyVisible(other, firstReply);
  const otherSend = await sendFromComposer(other, "browser to desktop staging message");
  const secondReply = await waitForReply(page, bot.id, actor.spaceId, otherSend.runId, "browser to desktop staging message");
  await page.getByText("browser to desktop staging message", { exact: true }).first().waitFor({
    state: "visible",
    timeout: 15000,
  });
  await expectReplyVisible(page, secondReply);
  await expectReplyVisible(other, secondReply);
  if (errors.length) throw new Error(`desktop reported ${errors.length} page errors`);
  console.log("packaged-desktop-staging-signup-signin-passed");
  console.log("desktop-browser-bidirectional-chat-ui-passed");
}

async function sendFromComposer(page, text) {
  const composer = page.locator('textarea[name="chat-message"]');
  await composer.waitFor({ state: "visible", timeout: 10000 });
  await composer.fill(text);
  const sending = page.waitForResponse((result) =>
    new URL(result.url()).pathname === "/rpc/threads/send" && result.request().method() === "POST",
  );
  await page.getByRole("button", { name: /^(Send|发送)$/ }).click({ timeout: 10000 });
  const response = await sending;
  if (!response.ok()) throw new Error("UI send failed");
  await page.getByText(text, { exact: true }).first().waitFor({ state: "visible", timeout: 10000 });
  return (await response.json()).json;
}

async function expectReplyVisible(page, reply) {
  const text = reply.blocks.find((block) => block.kind === "text" && block.text)?.text;
  if (typeof reply.id !== "string" || !text) throw new Error("reply identity or text missing");
  await page.waitForFunction(({ id, text }) => {
    const normalize = (value) => value.replace(/\s+/g, " ").trim();
    const row = [...document.querySelectorAll("[data-message-id]")]
      .find((element) => element.getAttribute("data-message-id") === id);
    return !!row && row.getClientRects().length > 0 && normalize(row.textContent ?? "").includes(normalize(text));
  }, { id: reply.id, text }, { timeout: 15000 });
}

async function rpc(page, method, input = {}, spaceId) {
  return page.evaluate(async ({ method, input, spaceId }) => {
    const response = await fetch(`/rpc/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(spaceId ? { "x-rakazo-space-id": spaceId } : {}) },
      body: JSON.stringify({ json: input }),
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(`RPC ${method} failed`);
    return result.json;
  }, { method, input, spaceId });
}

async function sessionId(page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/auth/get-session");
    return response.ok ? (await response.json())?.session?.id : null;
  });
}

async function waitForReply(page, botId, spaceId, runId, text) {
  if (!runId) throw new Error("chat run missing");
  for (let attempt = 0; attempt < 30; attempt++) {
    const snapshot = await rpc(page, "threads/get", { botId }, spaceId);
    const recent = await rpc(page, "runs/list", { filter: "recent" }, spaceId);
    const run = recent.runs.find((item) => item.runId === runId);
    if (run?.status === "failed" || run?.status === "cancelled") throw new Error("chat run failed");
    const user = snapshot.messages.some((message) =>
      message.role === "user" && message.blocks.some((block) => block.kind === "text" && block.text === text));
    const reply = snapshot.messages.find((message) =>
      message.role === "bot" && message.runId === runId && message.blocks.some((block) => block.kind === "text" && block.text));
    if (run?.status === "completed" && user && reply) return reply;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("chat reply timed out");
}

Promise.race([
  check(),
  new Promise((_, reject) => {
    deadline = setTimeout(() => reject(new Error("desktop probe timed out")), 70000);
  }),
])
  .catch(async (error) => {
    console.error(error.message);
    if (desktopPage && !desktopPage.isClosed()) {
      const state = await desktopPage.evaluate(() => ({
        path: location.pathname.startsWith("/app/") ? "/app/:id" : location.pathname,
        headings: [...document.querySelectorAll("h1,h2")].map((node) => node.textContent?.trim().slice(0, 80)),
        composer: [...document.querySelectorAll('textarea[name="chat-message"]')].map((node) => ({
          disabled: node.disabled,
        })),
        buttons: [...document.querySelectorAll("button")].map((node) =>
          (node.getAttribute("aria-label") || node.textContent || "").trim().slice(0, 40)).filter(Boolean).slice(0, 30),
      })).catch(() => null);
      console.error(JSON.stringify({ state }));
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    clearTimeout(deadline);
    if (companionBrowser) await companionBrowser.close();
    if (app) await app.close();
    if (userData) {
      const root = await fs.realpath(__dirname);
      const resolved = await fs.realpath(userData);
      const info = await fs.lstat(userData);
      if (path.dirname(resolved) !== root || !path.basename(resolved).startsWith(".sydney-stage-desktop-") || !info.isDirectory() || info.isSymbolicLink()) {
        throw new Error("unsafe temporary desktop data path");
      }
      await fs.rm(resolved, { recursive: true });
      console.log("desktop-temporary-data-removed");
    }
  });
