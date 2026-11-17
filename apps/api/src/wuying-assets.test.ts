import { mkdir, mkdtemp, open, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  CSP_REPORTING_ENDPOINTS,
  contentSecurityPolicyFor,
} from "@rakazo/contracts/content-security-policy";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountWuyingAssets } from "./wuying-assets.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open) };
});

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.mocked(open).mockReset();
  vi.mocked(open).mockImplementation(
    (await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")).open,
  );
  await Promise.all(
    temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "wuying-assets-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, "sdk", "ASP"), { recursive: true });
  for (const file of [
    "screen.html",
    "screen.js",
    "storage.js",
    "WuyingWebSDK.js",
    "sdk/ASP/container.html",
  ]) {
    await writeFile(join(root, file), `fixture:${file}`);
  }
  const app = new Hono();
  mountWuyingAssets(app, root);
  return { app, root };
}

describe("Wuying assets", () => {
  it("keeps the gateway frame exception limited to the opaque nested container in all templates", async () => {
    for (const template of [
      "Caddyfile.prod",
      "Caddyfile.ip.example",
      "Caddyfile.cloudflare.example",
    ]) {
      const source = await readFile(resolve("infra/compose", template), "utf8");
      expect(source).toMatch(
        /^\s*@frameRestricted not path \/wuying\/sdk\/ASP\/container\.html\s*$/m,
      );
      expect(source).toMatch(/^\s*header @frameRestricted X-Frame-Options SAMEORIGIN\s*$/m);
      expect(source).not.toMatch(/^\s*X-Frame-Options SAMEORIGIN\s*$/m);
    }
  });
  it("serves the checked-in independent screen entry and scripts", async () => {
    const { app, root } = await fixture();
    const directory = resolve("packages/core/wuying-assets");
    for (const file of ["screen.html", "screen.js", "storage.js"]) {
      const body = await readFile(join(directory, file));
      expect(body).toEqual(await readFile(resolve("apps/web/public/wuying", file)));
      await writeFile(join(root, file), body);
    }
    const page = await app.request("/wuying/screen.html");
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('src="./storage.js"');
    expect(html).toContain('src="./WuyingWebSDK.js"');
    expect(html).toContain('src="./screen.js"');
    expect((await app.request("/wuying/screen.js")).status).toBe(200);
    expect((await app.request("/wuying/storage.js")).status).toBe(200);
  });
  it("serves only the fixed assets with the existing isolation policies", async () => {
    const { app } = await fixture();
    for (const file of [
      "screen.html",
      "screen.js",
      "storage.js",
      "WuyingWebSDK.js",
      "sdk/ASP/container.html",
    ]) {
      const path = `/wuying/${file}`;
      const response = await app.request(path);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(`fixture:${file}`);
      expect(response.headers.get("content-security-policy")).toBe(contentSecurityPolicyFor(path));
      if (contentSecurityPolicyFor(path)) {
        expect(response.headers.get("reporting-endpoints")).toBe(CSP_REPORTING_ENDPOINTS);
      }
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("content-type")).toContain(
        file.endsWith(".html") ? "text/html" : "text/javascript",
      );
    }
    const head = await app.request("/wuying/screen.html", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
  });

  it("returns 404 for missing SDK files, unknown paths, encodings and other methods", async () => {
    const { app, root } = await fixture();
    await rm(join(root, "WuyingWebSDK.js"));
    await rm(join(root, "sdk", "ASP", "container.html"));
    expect((await app.request("/wuying/screen.html")).status).toBe(503);
    expect((await app.request("/wuying/screen.html", { method: "HEAD" })).status).toBe(503);
    for (const path of [
      "/wuying/WuyingWebSDK.js",
      "/wuying/sdk/ASP/container.html",
      "/wuying/secret.txt",
      "/wuying/sdk/ASP/other.html",
      "/wuying/%73creen.js",
      "/wuying/screen.js/extra",
    ]) {
      const response = await app.request(path);
      expect(response.status).toBe(404);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    }
    expect((await app.request("/wuying/screen.js", { method: "POST" })).status).toBe(404);
  });

  it("returns 503 when any required entry resource is missing", async () => {
    for (const file of [
      "screen.html",
      "screen.js",
      "storage.js",
      "WuyingWebSDK.js",
      "sdk/ASP/container.html",
    ]) {
      const { app, root } = await fixture();
      await rm(join(root, file));
      expect((await app.request("/wuying/screen.html")).status).toBe(503);
      if (file !== "screen.html") expect((await app.request(`/wuying/${file}`)).status).toBe(404);
    }
  });

  it("rejects symlinks escaping the configured directory", async () => {
    const { app, root } = await fixture();
    const outside = await mkdtemp(join(tmpdir(), "wuying-outside-"));
    temporaryDirectories.push(outside);
    await writeFile(join(outside, "container.html"), "secret");
    await rm(join(root, "sdk", "ASP"), { recursive: true });
    await symlink(outside, join(root, "sdk", "ASP"), "junction");
    const response = await app.request("/wuying/sdk/ASP/container.html");
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("secret");
  });

  it("fails closed for unreadable resources even when their metadata is accessible", async () => {
    const { app, root } = await fixture();
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(open).mockImplementation((file, flags, mode) => {
      if (file === join(root, "WuyingWebSDK.js")) {
        return Promise.reject(Object.assign(new Error("Permission denied"), { code: "EACCES" }));
      }
      return actual.open(file, flags, mode);
    });
    for (const method of ["GET", "HEAD"]) {
      expect((await app.request("/wuying/screen.html", { method })).status).toBe(503);
      expect((await app.request("/wuying/WuyingWebSDK.js", { method })).status).toBe(404);
    }
    expect(await actual.stat(join(root, "WuyingWebSDK.js")).then((file) => file.isFile())).toBe(
      true,
    );
  });

  it("requires an absolute injected directory and leaves unmounted routes unavailable", async () => {
    expect(() => mountWuyingAssets(new Hono(), "relative")).toThrow("absolute directory");
    expect((await new Hono().request("/wuying/screen.html")).status).toBe(404);
  });
});
