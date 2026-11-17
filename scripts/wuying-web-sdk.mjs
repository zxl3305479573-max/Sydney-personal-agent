#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const VERSION = "2.13.22-asp3.18.14";
const BASE = `https://g.alicdn.com/aliyun-ecs/WuyingWebSdk-multi/${VERSION}/WuyingWebSDK/`;
export const FILES = Object.freeze({
  "WuyingWebSDK.js": "2dfdd1b8bf0aad432ca4697a8fc04213fcbf544d741ed0d27d9815c3c4824a61",
  "sdk/ASP/container.html": "f69b03e9f8de93c5c3cce48df9399a3c8097179e0291a41520fb6dc58cb490b9",
});
const STORAGE_SHIM = '<script src="../../storage.js"></script>';
const targets = {
  web: path.resolve(import.meta.dirname, "../apps/web/public/wuying"),
  api: path.resolve(import.meta.dirname, "../packages/core/wuying-assets"),
};

function verify(file, body, sha256) {
  const actual = createHash("sha256").update(body).digest("hex");
  if (actual !== sha256) throw new Error(`${file}: checksum ${actual} does not match ${sha256}`);
}

export async function prepareSdk({
  directories,
  fetchImpl = fetch,
  manifest = FILES,
  base = BASE,
}) {
  const verified = [];
  for (const [file, sha256] of Object.entries(manifest)) {
    const response = await fetchImpl(new URL(file, base), { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
    const body = Buffer.from(await response.arrayBuffer());
    verify(file, body, sha256);
    let content = body;
    if (file.endsWith(".html")) {
      const html = body.toString("utf8");
      if (!html.includes("<head>")) throw new Error(`${file}: missing expected head element`);
      content = Buffer.from(html.replace("<head>", `<head>${STORAGE_SHIM}`));
    }
    verified.push({ file, content });
  }
  const staged = [];
  try {
    for (const directory of directories) {
      for (const { file, content } of verified) {
        const destination = path.join(directory, file);
        await mkdir(path.dirname(destination), { recursive: true });
        const temporary = `${destination}.${randomUUID()}.tmp`;
        staged.push({ temporary, destination });
        await writeFile(temporary, content, { flag: "wx" });
      }
    }
    for (const { temporary, destination } of staged) await rename(temporary, destination);
  } finally {
    await Promise.all(staged.map(({ temporary }) => rm(temporary, { force: true })));
  }
}

export async function checkSdk({ directories, manifest = FILES }) {
  for (const directory of directories) {
    for (const file of ["screen.html", "screen.js", "storage.js"]) {
      await access(path.join(directory, file));
    }
    for (const [file, sha256] of Object.entries(manifest)) {
      let body = await readFile(path.join(directory, file));
      if (file.endsWith(".html")) {
        const html = body.toString("utf8");
        if (!html.includes(`<head>${STORAGE_SHIM}`)) {
          throw new Error(`${file}: missing storage shim`);
        }
        body = Buffer.from(html.replace(`<head>${STORAGE_SHIM}`, "<head>"));
      }
      verify(file, body, sha256);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (
    args.some(
      (arg) => !["--check", "--target=api", "--target=web", "--target=all"].includes(arg),
    ) ||
    args.filter((arg) => arg.startsWith("--target=")).length > 1
  ) {
    throw new Error("Usage: node scripts/wuying-web-sdk.mjs [--check] [--target=api|web|all]");
  }
  const target =
    args.find((arg) => arg.startsWith("--target="))?.slice("--target=".length) ?? "all";
  const directories = target === "all" ? Object.values(targets) : [targets[target]];
  if (args.includes("--check")) await checkSdk({ directories });
  else {
    await prepareSdk({ directories });
    await checkSdk({ directories });
  }
  console.log(
    `Wuying SDK ${VERSION}: ${target} ${args.includes("--check") ? "verified" : "prepared and verified"}`,
  );
}
