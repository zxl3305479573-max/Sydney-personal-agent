import type { Session } from "electron";
import { BrowserWindow, webContents } from "electron";

const preferenceKey = "rakazo.botsSidebarDensity";
const migrationKey = "sydney.migration.sidebarDensity.v1";

export type SidebarDensity = "compact" | "comfortable";

export async function needsLegacySidebarDensity(target: BrowserWindow, origin: string) {
  return target.webContents.executeJavaScript(`location.origin === ${JSON.stringify(origin)} &&
    localStorage.getItem(${JSON.stringify(preferenceKey)}) === null &&
    localStorage.getItem(${JSON.stringify(migrationKey)}) === null`);
}

export async function readLegacyStorage(
  source: Session,
  origin: string,
  script: string,
): Promise<unknown> {
  if (webContents.getAllWebContents().some((contents) => contents.session === source)) {
    return null;
  }
  const window = new BrowserWindow({
    show: false,
    webPreferences: { session: source, sandbox: true, contextIsolation: true },
  });
  const debuggerClient = window.webContents.debugger;
  const documentUrl = new URL("/.sydney/legacy-storage", origin).href;
  let served = false;
  let installed = false;
  const scheme = new URL(documentUrl).protocol.slice(0, -1);
  const deadline = setTimeout(() => {
    if (!window.isDestroyed()) window.destroy();
  }, 3000);
  try {
    await window.loadURL("about:blank");
    debuggerClient.attach();
    await debuggerClient.sendCommand("Network.enable");
    await debuggerClient.sendCommand("Network.setBypassServiceWorker", { bypass: true });
    source.protocol.handle(scheme, async (request) => {
      if (served || request.url !== documentUrl || request.method !== "GET") {
        return new Response(null, { status: 403 });
      }
      served = true;
      return new Response(Buffer.from("<!doctype html><title>Sydney migration</title>"), {
        headers: {
          "Content-Type": "text/html",
          "Content-Security-Policy": "default-src 'none'",
          "Cache-Control": "no-store",
        },
      });
    });
    installed = true;
    await window.loadURL(documentUrl);
    if (!served || window.webContents.getURL() !== documentUrl) return null;
    return await window.webContents.executeJavaScript(script);
  } finally {
    clearTimeout(deadline);
    if (!window.isDestroyed()) window.destroy();
    if (installed) source.protocol.unhandle(scheme);
  }
}

export async function readLegacySidebarDensity(
  source: Session,
  origin: string,
): Promise<SidebarDensity | null> {
  const value = await readLegacyStorage(
    source,
    origin,
    `localStorage.getItem(${JSON.stringify(preferenceKey)})`,
  );
  return value === "compact" || value === "comfortable" ? value : null;
}

export async function importLegacySidebarDensity(
  target: BrowserWindow,
  origin: string,
  density: SidebarDensity,
): Promise<boolean> {
  return target.webContents.executeJavaScript(`(() => {
    if (location.origin !== ${JSON.stringify(origin)}) return false;
    const key = ${JSON.stringify(preferenceKey)};
    const marker = ${JSON.stringify(migrationKey)};
    if (localStorage.getItem(marker) !== null) return false;
    const missing = localStorage.getItem(key) === null;
    if (missing) localStorage.setItem(key, ${JSON.stringify(density)});
    localStorage.setItem(marker, "1");
    return missing;
  })()`);
}
