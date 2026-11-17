import { open, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import {
  CSP_REPORTING_ENDPOINTS,
  contentSecurityPolicyFor,
} from "@rakazo/contracts/content-security-policy";
import type { Hono } from "hono";

const assets: Readonly<Record<string, string>> = Object.freeze({
  "/wuying/screen.html": "text/html; charset=utf-8",
  "/wuying/screen.js": "text/javascript; charset=utf-8",
  "/wuying/storage.js": "text/javascript; charset=utf-8",
  "/wuying/WuyingWebSDK.js": "text/javascript; charset=utf-8",
  "/wuying/sdk/ASP/container.html": "text/html; charset=utf-8",
});

export function mountWuyingAssets(app: Hono, directory: string | undefined) {
  if (!directory || !isAbsolute(directory)) {
    throw new Error("Wuying assets require an absolute directory");
  }
  const resolveAsset = async (root: string, pathname: string) => {
    const file = await realpath(join(root, pathname.slice("/wuying/".length)));
    const within = relative(root, file);
    if (!within || within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within)) {
      throw new Error("Asset outside configured directory");
    }
    if (!(await stat(file)).isFile()) throw new Error("Asset is not a file");
    const handle = await open(file, "r");
    await handle.close();
    return file;
  };
  app.all("/wuying/*", async (context) => {
    const pathname = new URL(context.req.url).pathname;
    const contentType = Object.hasOwn(assets, pathname) ? assets[pathname] : undefined;
    context.header("X-Content-Type-Options", "nosniff");
    context.header("Referrer-Policy", "no-referrer");
    context.header("Cache-Control", "no-store");
    const policy = contentSecurityPolicyFor(pathname);
    if (policy) {
      context.header("Content-Security-Policy", policy);
      context.header("Reporting-Endpoints", CSP_REPORTING_ENDPOINTS);
    }
    if (!contentType || !["GET", "HEAD"].includes(context.req.method)) {
      return context.text("Not Found", 404);
    }
    try {
      const root = await realpath(directory);
      if (pathname === "/wuying/screen.html") {
        const files = await Promise.all(
          Object.keys(assets).map((asset) => resolveAsset(root, asset)),
        );
        context.header("Content-Type", contentType);
        if (context.req.method === "HEAD") return context.body(null);
        return context.body(new Uint8Array(await readFile(files[0]!)));
      }
      const file = await resolveAsset(root, pathname);
      context.header("Content-Type", contentType);
      if (context.req.method === "HEAD") return context.body(null);
      return context.body(new Uint8Array(await readFile(file)));
    } catch {
      return pathname === "/wuying/screen.html"
        ? context.text("Wuying screen unavailable", 503)
        : context.text("Not Found", 404);
    }
  });
}
