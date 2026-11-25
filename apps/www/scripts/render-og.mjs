import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const chrome = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";

const mark = readFileSync(join(root, "public/brand/sydney-mark.png")).toString("base64");

function pageHtml(kicker, title) {
  const fontSize = title.length > 72 ? 40 : 68;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body { margin: 0; width: 1200px; height: 630px; background: #fdfdfd; }
    body { font-family: Geist, ui-sans-serif, system-ui, sans-serif; color: #242424; }
    .card { box-sizing: border-box; width: 1200px; height: 630px; padding: 72px 80px; display: flex; flex-direction: column; justify-content: space-between; }
    .kicker { margin: 0; color: #6d6e70; font-size: 22px; letter-spacing: 0.08em; text-transform: uppercase; }
    h1 { margin: 18px 0 0; max-width: 980px; font-size: ${fontSize}px; line-height: 1.05; font-weight: 560; letter-spacing: -0.03em; }
    .brand { display: flex; align-items: center; gap: 14px; font-size: 28px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div>
      <p class="kicker">${kicker}</p>
      <h1>${title.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</h1>
    </div>
    <div class="brand">
      <img width="36" height="36" src="data:image/png;base64,${mark}" alt="" />
      Sydney
    </div>
  </div>
</body>
</html>`;
}

const tmp = join(root, "public/.og-render.html");
const target = join(root, "public/og-image.png");

try {
  writeFileSync(tmp, pageHtml("Sydney Personal Agent", "你的个人 AI 助手"));
  const result = spawnSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--window-size=1200,630",
      "--default-background-color=00000000",
      `--screenshot=${target}`,
      pathToFileURL(tmp).href,
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error(`Open Graph render failed with status ${result.status ?? 1}`);
  }
} finally {
  if (existsSync(tmp)) unlinkSync(tmp);
}
