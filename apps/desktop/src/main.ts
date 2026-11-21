import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HostScreen } from "@rakazo/adapters/host-screen";
import { startUserDeviceClient } from "@rakazo/adapters/user-device-client";
import {
  captureWindowsProjectRoot,
  executeWindowsProjectFile,
} from "@rakazo/adapters/windows-project-files";
import type {
  DesktopMenuCommand,
  DesktopReachability,
  DesktopSetup,
  RakazoDesktopDevice,
} from "@rakazo/contracts";
import { parseServerHeaders, ProjectDirectoryInput } from "@rakazo/contracts";
import type { Session } from "electron";
import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  powerMonitor,
  safeStorage,
  screen,
  session,
  shell,
  systemPreferences,
} from "electron";
import type { AppDocumentState } from "./app-document-state.js";
import { waitForMountedAppDocument } from "./app-document-state.js";
import { fromAppFrame } from "./app-frame.js";
import { createAppOpener } from "./app-opener.js";
import type { ElectronAutoUpdater } from "./auto-update.js";
import {
  DesktopUpdateController,
  LAUNCH_CHECK_DELAY_MS,
  sydneyUpdaterEnvironment,
  updaterSupport,
} from "./auto-update.js";
import { createBadgeHandler } from "./badge.js";
import { openBrowserAuth } from "./browser-auth.js";
import { createProjectWindowsTerminal } from "./project-windows-terminal.js";
import { DOCKER_INSTALL_LINKS, isDesktopSetupLink, runDocker } from "./docker-cli.js";
import { prepareHostComputer } from "./host-computer.js";
import {
  createDesktopHostScreen,
  screenDriverInstaller,
  screenDriverRelease,
} from "./host-screen.js";
import {
  createLocaleHandler,
  desktopDirection,
  desktopLocale,
  desktopMessages,
  errorDetail,
  startDesktopLocale,
  t,
  withDetail,
} from "./i18n.js";
import { migrateLegacyAppearance, migrateLegacyAvatars } from "./legacy-avatar-library.js";
import {
  importLegacySidebarDensity,
  needsLegacySidebarDensity,
  readLegacySidebarDensity,
  readLegacyStorage,
} from "./legacy-sidebar-density.js";
import { saveLocalComputerHost } from "./local-settings.js";
import {
  LocalStackController,
  readStackToken,
  readStackWebUrl,
  resolveImageTag,
  stackDir,
  stackResourceDir,
} from "./local-stack.js";
import {
  configureDesktopMonitoring,
  desktopReportsErrors,
  disableDesktopMonitoring,
  installDesktopEarlyErrorReporting,
  refreshDesktopMonitoringUser,
  reportDesktopError,
} from "./monitoring.js";
import { oauthCallbackFrom } from "./oauth-callback.js";
import { associatedPasskeyRpIds } from "./passkeys.js";
import {
  bundledRendererCandidates,
  bundledRendererHeaders,
  forwardedRendererRequestInit,
  isRendererAssetMiss,
} from "./renderer-assets.js";
import { revealSecondInstanceWindow, secondInstanceWindow } from "./second-instance.js";
import { installServerHeaders } from "./server-request-headers.js";
import { installSessionPermissions } from "./session-permissions.js";
import {
  DEFAULT_LOCAL_WEB_URL,
  desktopStackImageTag,
  isRakazoHealth,
  managedLocalOpenUrl,
  maySendDesktopStackToken,
  normalizeServerUrl,
  parseSetupInput,
  probeFailureMessage,
  RAKAZO_CLOUD_URL,
  readProbeJson,
  resolveStartupTarget,
  safeExternalUrl,
  serverHeadersFor,
  servesBundledRenderer,
  sessionPartitionForServerUrl,
  standaloneSessionPartitionForServerUrl,
} from "./setup-config.js";
import { clearSetup, readSetup, readUiLocale, writeSetup, writeUiLocale } from "./setup-store.js";
import {
  readStandaloneOriginRegistry,
  recordStandaloneOrigin,
  StandaloneOriginStoreError,
} from "./standalone-origin-store.js";
import { StandaloneRendererProxy } from "./standalone-renderer-proxy.js";
import {
  bindStandaloneSession,
  isStandaloneManagedSession,
  observeMainFrameCompleted,
} from "./standalone-session-hooks.js";
import { finishAfterStartup } from "./startup-handoff.js";
import { createSystemSpeech } from "./system-speech.js";
import type { UserDeviceAccess } from "./user-device.js";
import { createUserDeviceAccess, deviceName } from "./user-device.js";
import { createProjectDirectoryAccess } from "./project-directory.js";
import { oauthPopupSessionPreferences, shouldOpenInAppPopup } from "./window-open.js";
import {
  browserWindowOptions,
  developmentIconFile,
  setupWindowOptions,
  warmWindowTtlMs,
} from "./window-options.js";

process.setSourceMapsEnabled(true);
installDesktopEarlyErrorReporting();

const PERFORMANCE_USER_DATA = process.env.RAKAZO_PERFORMANCE_USER_DATA;
/** Test hook: where the app-managed stack answers. Mode `new` still requires loopback. */
const LOCAL_WEB_URL = process.env.RAKAZO_LOCAL_WEB_URL?.trim() || DEFAULT_LOCAL_WEB_URL;
const PROBE_TIMEOUT_MS = 8_000;
const DESKTOP_STACK_PROBE_PATH = "/.well-known/rakazo-desktop-stack";
const DESKTOP_STACK_TOKEN_HEADER = "x-rakazo-desktop-stack-token";
let mainWindow: BrowserWindow | null = null;
let startupWindow: BrowserWindow | null = null;

/** The server or the network refused the page; the setup window says so and the server logs its side. */
class ServerUnavailable extends Error {}

interface StandaloneContext {
  readonly window: BrowserWindow | null;
  readonly rendererRoot: string;
  readonly remoteOrigin: string;
  readonly uiOrigin: string;
  readonly port: number;
  readonly partition: string;
  readonly session: Session;
  readonly setupSnapshot: DesktopSetup;
  readonly proxy: StandaloneRendererProxy;
  readonly unbindSession: () => void;
  readonly fetchBackend: (urlOrPath: string, init?: RequestInit) => Promise<Response>;
}

type PendingPreviousStandalone =
  | { readonly kind: "live"; readonly context: StandaloneContext }
  | {
      readonly kind: "paused-same-origin";
      readonly rendererRoot: string;
      readonly remoteOrigin: string;
      readonly port: number;
      readonly partition: string;
      readonly session: Session;
      readonly setupSnapshot: DesktopSetup;
    };

const appWindowTargets = new WeakMap<BrowserWindow, string>();
const appWindowRemoteOrigins = new WeakMap<BrowserWindow, string | null>();
let setupWindow: BrowserWindow | null = null;
const bundledRendererInstallations = new Set<string>();
let currentSetup: DesktopSetup | null = null;
let currentTargetUrl: string | null = null;
let directWebOverrideUrl: string | null = null;
let pcBackendOverrideUrl: string | null = null;
let preProbedOrigin: string | null = null;
let activeStandalone: StandaloneContext | null = null;
let pendingPreviousStandalone: PendingPreviousStandalone | null = null;
let monitoringSession: Session | undefined;
let monitoringTargetUrl: string | undefined;
let monitoringFetchOverride: ((path: string, init?: RequestInit) => Promise<Response>) | undefined;
let stopMonitoringSession: (() => void) | undefined;
let setupError: string | null = null;
let setupSaveInProgress = false;
const appOpener = createAppOpener(openAppOnce);
/** Prior app window kept until setup is persisted (or the switch is abandoned). */
let pendingPreviousWindow: BrowserWindow | null = null;
let quitting = false;
let warmWindowTimer: NodeJS.Timeout | undefined;
// Number of short-lived hidden probe windows currently alive. On Windows/Linux,
// destroying the last window fires "window-all-closed" -> app.quit(); a probe
// that runs before the first real window exists must not count as "all closed".
let liveProbeWindows = 0;
const WARM_WINDOW_TTL_MS = warmWindowTtlMs(process.env.RAKAZO_WARM_WINDOW_TTL_MS);

const reportsErrors = desktopReportsErrors(app.isPackaged);
const updaterEnvironment = sydneyUpdaterEnvironment(app.isPackaged, app.getVersion());
/** Created once the app's language is known, so its first message is in it. */
let desktopUpdater: DesktopUpdateController;
let launchUpdateCheckScheduled = false;
let localStack: LocalStackController;
let hostComputer: Awaited<ReturnType<typeof prepareHostComputer>> | undefined;
let requestingComputerAccess = false;
let userDevices: UserDeviceAccess | undefined;
let hostScreen: HostScreen | undefined;

markOnce("rk:main:module-evaluated");
if (PERFORMANCE_USER_DATA) {
  app.setPath("userData", PERFORMANCE_USER_DATA);
  app.setPath("sessionData", path.join(PERFORMANCE_USER_DATA, "session"));
} else if (process.platform === "win32" && app.isPackaged) {
  const windowsUserData = path.join(app.getPath("home"), `.${app.getName().toLowerCase()}`);
  mkdirSync(path.join(windowsUserData, "session"), { recursive: true });
  app.setPath("userData", windowsUserData);
  app.setPath("sessionData", path.join(windowsUserData, "session"));
}
app.once("will-finish-launching", () => markOnce("rk:main:will-finish-launching"));
app.once("ready", () => markOnce("rk:main:ready"));
// Includes fresh partitions and popup-created sessions, before they load remote content.
app.on("session-created", (value) => installSessionPermissions(value, permissionTarget));

const passkeyRpIds = associatedPasskeyRpIds({
  platform: process.platform,
  packaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  exists: existsSync,
});
// Routes WebAuthn to the system passkey sheet (iCloud Keychain and other providers).
if (passkeyRpIds.length > 0) app.configureWebAuthn({ platformPasskeys: true });

function permissionTarget() {
  if (mainWindow === null || mainWindow.isDestroyed()) return null;
  const url = appWindowTargets.get(mainWindow);
  return url === undefined ? null : { webContents: mainWindow.webContents, url };
}

function markOnce(name: string) {
  if (performance.getEntriesByName(name).length === 0) performance.mark(name);
}

function windowFrom(event: Electron.IpcMainInvokeEvent) {
  return BrowserWindow.fromWebContents(event.sender);
}

function fromMainWindow(event: Electron.IpcMainInvokeEvent) {
  return mainWindow !== null && windowFrom(event) === mainWindow;
}

/** Dock/taskbar icon for unpackaged launches; packaged builds get theirs from electron-builder. */
function developmentIcon() {
  if (app.isPackaged) return undefined;
  const icon = path.join(app.getAppPath(), "assets", developmentIconFile(process.platform));
  return existsSync(icon) ? icon : undefined;
}

function sessionPartitionKey(targetUrl: string) {
  return sessionPartitionForServerUrl(targetUrl);
}

function legacyDefaultSessionFlag(partition: string) {
  return path.join(
    app.getPath("userData"),
    `legacy-default-${partition.replace(/[^a-zA-Z0-9_-]/g, "_")}.flag`,
  );
}

/**
 * Prefer the default session when that origin already has cookies or site
 * storage there, so upgrades keep localStorage/IndexedDB. Fresh origins get
 * an isolated partition.
 */
async function resolveSessionForTarget(targetUrl: string) {
  const partition = sessionPartitionKey(targetUrl);
  if (partition === null) {
    return { partition: null, value: session.defaultSession };
  }
  if (existsSync(legacyDefaultSessionFlag(partition))) {
    return { partition: null, value: session.defaultSession };
  }
  const origin = safeOrigin(targetUrl);
  if (origin !== null) {
    try {
      const defaultCookies = await session.defaultSession.cookies.get({ url: origin });
      if (defaultCookies.length > 0) {
        await writeFile(legacyDefaultSessionFlag(partition), new Date().toISOString(), "utf8");
        return { partition: null, value: session.defaultSession };
      }
    } catch {
      // Continue with a storage probe when the profile looks pre-partition.
    }
    if (defaultSessionProfileExists() && (await defaultSessionHasOriginData(origin))) {
      try {
        await writeFile(legacyDefaultSessionFlag(partition), new Date().toISOString(), "utf8");
      } catch {
        // Flag is best-effort; still stay on the default session this launch.
      }
      return { partition: null, value: session.defaultSession };
    }
  }
  return { partition, value: session.fromPartition(partition) };
}

function defaultSessionProfileExists() {
  const root = app.getPath("userData");
  return (
    existsSync(path.join(root, "Local Storage")) ||
    existsSync(path.join(root, "IndexedDB")) ||
    existsSync(path.join(root, "Cookies")) ||
    existsSync(path.join(root, "Network", "Cookies")) ||
    existsSync(path.join(root, "Cache Storage"))
  );
}

/** Page storage in the default session means a pre-partition install for this origin. */
async function defaultSessionHasOriginData(origin: string): Promise<boolean> {
  const probe = new BrowserWindow({
    show: false,
    width: 1,
    height: 1,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  // Increment only after construction succeeds so a throw cannot leave the
  // counter stuck > 0 and permanently block quit on Windows/Linux.
  liveProbeWindows++;
  try {
    await probe.loadURL(origin);
    return (await probe.webContents.executeJavaScript(`(async () => {
      if (localStorage.length > 0 || sessionStorage.length > 0) return true;
      if (typeof indexedDB !== "undefined" && indexedDB.databases) {
        try {
          const databases = await indexedDB.databases();
          if (databases.length > 0) return true;
        } catch {}
      }
      if (typeof caches !== "undefined") {
        try {
          const keys = await caches.keys();
          if (keys.length > 0) return true;
        } catch {}
      }
      return false;
    })()`)) as boolean;
  } catch {
    return false;
  } finally {
    if (!probe.isDestroyed()) probe.destroy();
    liveProbeWindows--;
  }
}

function buildAppWindow(
  url: string,
  partition: string | null,
  remoteOrigin?: string | null,
): BrowserWindow {
  markOnce("rk:main:window-create-start");
  const icon = developmentIcon();
  const win = new BrowserWindow({
    ...browserWindowOptions(process.platform, screen.getPrimaryDisplay().workAreaSize),
    ...(startupWindow ? { show: false } : {}),
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(import.meta.dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      ...(partition === null ? {} : { partition }),
    },
  });
  win.on("unresponsive", () =>
    reportDesktopError(new Error("Renderer unresponsive"), "desktop.unresponsive"),
  );
  mainWindow = win;
  appWindowTargets.set(win, url);
  if (remoteOrigin !== undefined) appWindowRemoteOrigins.set(win, remoteOrigin);
  const targetOrigin = safeOrigin(url);
  // Intentional OAuth flows open the provider's authorize page via a named
  // window; give those and same-origin popups a normal frame. Everything else
  // opens in the system browser so a connected server cannot navigate us away.
  // Hoisted for loopback OAuth capture so MCP/in-app localhost callbacks are skipped.
  const appOrigin = targetOrigin ?? safeOrigin(url);
  const excludedCallbackOrigins = [appOrigin, remoteOrigin ?? null].filter(
    (origin, index, array): origin is string => origin !== null && array.indexOf(origin) === index,
  );
  win.webContents.setWindowOpenHandler(({ url: childUrl, frameName }) => {
    if (shouldOpenInAppPopup(appOrigin, childUrl, frameName)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: oauthPopupWindowOptions(partition),
      };
    }
    const external = safeExternalUrl(childUrl);
    if (external !== null) void shell.openExternal(external);
    return { action: "deny" };
  });
  // Signing in lands on a new page; pair then instead of waiting for the next launch.
  const pairAfterNavigation = () => {
    if (mainWindow === win) void userDevices?.pair();
  };
  win.webContents.on("did-navigate", pairAfterNavigation);
  win.webContents.on("did-navigate-in-page", pairAfterNavigation);
  // Server redirects skip will-navigate, so a same-origin link could otherwise land elsewhere.
  const keepOnAppOrigin = (event: Electron.Event<{ url: string; isMainFrame: boolean }>) => {
    if (!event.isMainFrame) return;
    if (targetOrigin !== null && safeOrigin(event.url) === targetOrigin) return;
    event.preventDefault();
    const external = safeExternalUrl(event.url);
    if (external !== null) void shell.openExternal(external);
  };
  win.webContents.on("will-navigate", keepOnAppOrigin);
  win.webContents.on("will-redirect", keepOnAppOrigin);
  // The popup has no address bar, so a loopback redirect would otherwise strand
  // the user on a blank window holding the authorization code in a URL they
  // cannot read. Capture it here and hand it to the app instead.
  win.webContents.on("did-create-window", (popup, { frameName }) => {
    const capture = (details: {
      preventDefault: () => void;
      url: string;
      isMainFrame?: boolean;
    }) => {
      // will-redirect can fire for iframes; only the top-level callback counts.
      if (details.isMainFrame === false) return;
      const callback = oauthCallbackFrom(details.url, {
        frameName,
        excludeOrigins: excludedCallbackOrigins,
        serverOrigin: remoteOrigin,
      });
      if (!callback) return;
      details.preventDefault();
      if (!win.isDestroyed()) win.webContents.send("desktop.oauth.callback", callback);
      if (!popup.isDestroyed()) popup.close();
    };
    if (frameName === "rakazo-slack-install") {
      popup.webContents.on("did-navigate", (_event, callbackUrl, status) => {
        if (status === 200) capture({ url: callbackUrl, preventDefault: () => undefined });
      });
    } else {
      popup.webContents.on("will-redirect", (details) => capture(details));
      popup.webContents.on("will-navigate", (details) => capture(details));
    }
  });
  win.on("close", (event) => {
    if (
      process.platform === "darwin" &&
      !quitting &&
      process.env.RAKAZO_DISABLE_WARM_WINDOW !== "1"
    ) {
      event.preventDefault();
      win.hide();
      clearTimeout(warmWindowTimer);
      warmWindowTimer = setTimeout(() => {
        if (mainWindow === win && !win.isDestroyed() && !win.isVisible()) win.destroy();
      }, WARM_WINDOW_TTL_MS);
    }
  });
  win.once("closed", () => {
    clearTimeout(warmWindowTimer);
    if (mainWindow === win) {
      mainWindow = null;
      if (activeStandalone?.window === win) {
        const closingStandalone = activeStandalone;
        activeStandalone = null;
        void stopStandaloneContext(closingStandalone);
      }
      if (!appOpener.busy() && !setupSaveInProgress) {
        activateDesktopMonitoring(undefined);
        syncHostComputerAccess();
      }
    }
  });
  markOnce("rk:main:window-created");
  if (win.isVisible()) markOnce("rk:main:window-shown");
  win.once("show", () => markOnce("rk:main:window-shown"));
  win.once("ready-to-show", () => markOnce("rk:main:ready-to-show"));
  win.webContents.once("dom-ready", () => markOnce("rk:main:dom-ready"));
  win.webContents.once("did-finish-load", () => markOnce("rk:main:did-finish-load"));
  win.webContents.once("did-stop-loading", () => markOnce("rk:main:did-stop-loading"));
  if (!launchUpdateCheckScheduled) {
    launchUpdateCheckScheduled = true;
    setTimeout(() => void desktopUpdater.check(false), LAUNCH_CHECK_DELAY_MS).unref();
    setInterval(() => void desktopUpdater.check(false), 60 * 60 * 1_000).unref();
  }
  return win;
}

function startAppWindowLoad(win: BrowserWindow, url: string): Promise<AppDocumentState> {
  markOnce("rk:main:load-url-start");
  return loadAppUrl(win, url).then(
    (state) => {
      markOnce("rk:main:load-url-resolved");
      return state;
    },
    (error: unknown) => {
      markOnce("rk:main:load-url-rejected");
      throw error;
    },
  );
}

function createWindow(url: string, partition: string | null, remoteOrigin?: string | null) {
  const win = buildAppWindow(url, partition, remoteOrigin);
  const loaded = startAppWindowLoad(win, url);
  return { loaded, win };
}

async function probeDocument(url: string): Promise<ServerUnavailable | null> {
  // Test/dev harnesses may load data: or file: documents; only probe real servers.
  if (!url.startsWith("http://") && !url.startsWith("https://")) return null;
  try {
    const response = await net.fetch(url, {
      method: "GET",
      ...(currentSetup?.headers ? { headers: serverHeadersFor(url, currentSetup) } : {}),
      redirect: "manual",
      cache: "no-store",
      credentials: "omit",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    // Allow 3xx (e.g. / → /login); reject hard HTTP errors before opening a window.
    if (response.status >= 400) {
      return withDetail(
        new ServerUnavailable(`The server answered with HTTP ${response.status}.`),
        t("The server answered with HTTP {status}.", { status: response.status }),
      );
    }
    return null;
  } catch (error) {
    const detail = probeFailureMessage(error);
    return withDetail(new ServerUnavailable(detail), detail);
  }
}

/**
 * loadURL alone treats many HTTP error documents as success. Reject main-frame
 * failures, renderer crashes during load, HTTP 4xx/5xx main-frame responses, and
 * shells that never mount application content.
 */
function loadAppUrl(win: BrowserWindow, url: string): Promise<AppDocumentState> {
  const contents = win.webContents;
  const targetSession = contents.session;
  let mainStatus: number | undefined;
  const stopObservingCompleted = observeMainFrameCompleted(
    targetSession,
    contents.id,
    (statusCode) => {
      mainStatus = statusCode;
    },
  );

  return new Promise<AppDocumentState>((resolve, reject) => {
    let settled = false;
    const settle = (error?: Error) => {
      if (settled) return;
      settled = true;
      contents.removeListener("did-fail-load", onFail);
      // Keep render-process-gone until document readiness finishes so a crash
      // during mount still fails the switch.
      stopObservingCompleted();
      if (error) {
        contents.removeListener("render-process-gone", onGone);
        reject(error);
        return;
      }
      if (mainStatus !== undefined && mainStatus >= 400) {
        contents.removeListener("render-process-gone", onGone);
        reject(
          withDetail(
            new ServerUnavailable(`The server answered with HTTP ${mainStatus}.`),
            t("The server answered with HTTP {status}.", { status: mainStatus }),
          ),
        );
        return;
      }
      void waitForMountedAppDocument(contents)
        .then((state) => {
          contents.removeListener("render-process-gone", onGone);
          if (contents.isCrashed()) {
            reject(
              withDetail(
                new Error("Renderer stopped after load."),
                t("Renderer stopped after load."),
              ),
            );
            return;
          }
          resolve(state);
        })
        .catch((inspectError: unknown) => {
          contents.removeListener("render-process-gone", onGone);
          reject(inspectError instanceof Error ? inspectError : new Error(String(inspectError)));
        });
    };

    const onFail = (
      _event: Electron.Event,
      _errorCode: number,
      errorDescription: string,
      _validatedURL: string,
      isMainFrame: boolean,
    ) => {
      if (!isMainFrame) return;
      settle(
        errorDescription
          ? new ServerUnavailable(errorDescription)
          : withDetail(new ServerUnavailable("Page failed to load."), t("Page failed to load.")),
      );
    };
    const onGone = (_event: Electron.Event, details: Electron.RenderProcessGoneDetails) => {
      settle(
        withDetail(
          new Error(`Renderer stopped (${details.reason}).`),
          t("Renderer stopped ({reason}).", { reason: details.reason }),
        ),
      );
    };

    contents.on("did-fail-load", onFail);
    contents.on("render-process-gone", onGone);
    void contents.loadURL(url).then(
      async () => {
        // onCompleted can lag loadURL; wait briefly for the main-frame status.
        const deadline = Date.now() + 500;
        while (mainStatus === undefined && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 10));
        }
        settle();
      },
      (error: unknown) => {
        settle(new ServerUnavailable(error instanceof Error ? error.message : String(error)));
      },
    );
  });
}

async function installBundledRenderer(
  targetUrl: string,
  targetSession: Session,
  partition: string | null,
  managedLocalStack: boolean,
) {
  if (!app.isPackaged || process.env.RAKAZO_DISABLE_BUNDLED_RENDERER === "1") return;
  if (!servesBundledRenderer(targetUrl, managedLocalStack)) return;
  const webUrl = new URL(targetUrl);
  const installationKey = `${partition ?? "default"}:${webUrl.protocol}`;
  if (bundledRendererInstallations.has(installationKey)) return;
  const root = path.join(process.resourcesPath, "web");

  await targetSession.protocol.handle(webUrl.protocol.slice(0, -1), async (request) => {
    const forward = () => {
      return targetSession.fetch(request, forwardedRendererRequestInit(request, webUrl.origin));
    };
    // Mode can change on the same origin/session; only managed "new" keeps the overlay.
    if (currentSetup?.mode !== "new") {
      return forward();
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return forward();
    }
    const acceptsHtml = request.headers.get("accept")?.includes("text/html") ?? false;
    const candidates = bundledRendererCandidates(root, request.url, webUrl.origin, acceptsHtml);
    if (!candidates) return forward();
    for (const file of candidates) {
      let body: Buffer | null = null;
      try {
        if (request.method === "HEAD") {
          if (!(await stat(file)).isFile()) continue;
        } else {
          body = await readFile(file);
        }
      } catch (error) {
        if (isRendererAssetMiss(error)) continue;
        throw error;
      }
      return new Response(body, { headers: bundledRendererHeaders(file, request.url) });
    }
    return forward();
  });
  bundledRendererInstallations.add(installationKey);
  markOnce("rk:main:bundled-renderer-ready");
}

function oauthPopupWindowOptions(partition: string | null) {
  return {
    width: 560,
    height: 720,
    frame: true,
    titleBarStyle: "default" as const,
    autoHideMenuBar: true,
    backgroundColor: "#161616",
    webPreferences: oauthPopupSessionPreferences(partition),
  };
}

function createSetupWindow() {
  const icon = developmentIcon();
  const win = new BrowserWindow({
    ...setupWindowOptions(process.platform, screen.getPrimaryDisplay().workAreaSize),
    ...(startupWindow ? { show: false } : {}),
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(import.meta.dirname, "setup-preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // A long pull runs while this window sits behind others; throttled timers would freeze it.
      backgroundThrottling: false,
    },
  });
  setupWindow = win;
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.once("closed", () => {
    if (setupWindow === win) setupWindow = null;
    // Closing setup without saving restores a connected session (Change Server cancel).
    restoreAppWindowAfterSetup();
  });
  void win.loadFile(path.join(import.meta.dirname, "setup.html"));
  markOnce("rk:main:setup-window-created");
  return win;
}

/** Hide the app while setup is open; do not clear the saved target until a new one opens. */
function showSetupWindow(error: string | null = null) {
  setupError = error;

  let win: BrowserWindow;
  if (setupWindow !== null && !setupWindow.isDestroyed()) {
    if (error !== null) setupWindow.reload();
    win = setupWindow;
  } else {
    win = createSetupWindow();
  }
  if (mainWindow !== null && !mainWindow.isDestroyed()) mainWindow.hide();
  if (!startupWindow) {
    win.show();
    win.focus();
  }
  return win;
}

function createStartupWindow() {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const icon = developmentIcon();
  const win = new BrowserWindow({
    width: Math.min(480, workArea.width),
    height: Math.min(420, workArea.height),
    title: "Sydney",
    backgroundColor: "#161616",
    autoHideMenuBar: true,
    resizable: false,
    ...(icon ? { icon } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  startupWindow = win;
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.once("closed", () => {
    if (startupWindow === win) {
      startupWindow = null;
      app.quit();
    }
  });
  const shown = new Promise<void>((resolve) => {
    win.once("closed", resolve);
    win.webContents.once("did-finish-load", () => {
      const duration = systemPreferences.getAnimationSettings().prefersReducedMotion ? 0 : 1800;
      setTimeout(resolve, duration);
    });
    void win.loadFile(path.join(import.meta.dirname, "splash.html")).catch(() => resolve());
  });
  return { win, shown };
}

function finishStartupWindow(startup: ReturnType<typeof createStartupWindow>) {
  if (startupWindow !== startup.win || quitting) return;
  const next = setupWindow ?? mainWindow;
  if (next && !next.isDestroyed()) {
    next.show();
    next.focus();
  }
  startupWindow = null;
  if (!startup.win.isDestroyed()) startup.win.destroy();
}

function restoreAppWindowAfterSetup() {
  if (quitting || startupWindow) return;
  if (setupWindow !== null && !setupWindow.isDestroyed()) return;
  if (mainWindow === null || mainWindow.isDestroyed() || currentTargetUrl === null) return;
  clearTimeout(warmWindowTimer);
  mainWindow.show();
  mainWindow.focus();
}

let menuUpdateCheck: Promise<void> | null = null;

/** Works before sign-in, unlike the settings section, and answers with native alerts. */
function checkForUpdatesFromMenu() {
  // One request at a time, so repeated clicks cannot stack alerts.
  menuUpdateCheck ??= runMenuUpdateCheck().finally(() => {
    menuUpdateCheck = null;
  });
  return menuUpdateCheck;
}

async function runMenuUpdateCheck() {
  let state = await desktopUpdater.check(true);
  // A found update starts downloading on its own; wait for it so the answer can be "restart".
  if (state.phase === "available" || state.phase === "downloading") {
    state = await desktopUpdater.download();
  }
  const alert = (options: Electron.MessageBoxOptions) =>
    mainWindow && !mainWindow.isDestroyed()
      ? dialog.showMessageBox(mainWindow, options)
      : dialog.showMessageBox(options);
  if (state.phase === "ready") {
    const { response } = await alert({
      message: t("Sydney {version} is ready to install.", {
        version: state.availableVersion ?? "",
      }),
      buttons: [t("Restart"), t("Later")],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (response !== 0) return;
    const result = await installUpdate();
    if (result.message) {
      await alert({
        type: "warning",
        message: t("Could not install the update."),
        detail: result.message,
      });
    }
  } else if (state.message) {
    // Offline and other failed checks settle back to idle with a message.
    await alert({
      type: "warning",
      message: t("Could not check for updates."),
      detail: state.message,
    });
  } else if (state.phase === "idle") {
    await alert({
      message: t("Sydney is up to date."),
      detail: t("Version {version}", { version: state.currentVersion }),
    });
  }
}

async function installUpdate() {
  if (desktopUpdater.state().phase !== "ready") return desktopUpdater.state();
  quitting = true;
  const state = await desktopUpdater.install();
  // A failed install stays ready for retry but reports a message. Restore normal
  // window behavior while the user keeps working after that failure.
  if (state.phase !== "ready" || state.message !== null) quitting = false;
  return state;
}

function installApplicationMenu() {
  const computerAccess: Electron.MenuItemConstructorOptions = {
    label: t("Computer Access…"),
    visible: isManagedLocalSetup(),
    click: () => mainWindow?.webContents.send("desktop.computer.configure"),
  };
  const revokeComputerAccess: Electron.MenuItemConstructorOptions = {
    label: t("Revoke Local Computer Access"),
    visible: remoteServerOrigin() === null && hostComputer?.isEnabled() === true,
    click: () => {
      void hostComputer
        ?.revoke()
        .finally(() => installApplicationMenu())
        .catch(() => undefined);
    },
  };
  // Cmd+, is the macOS Settings chord, and no page keydown can see it: the OS takes
  // it first, so the menu item is the only place it can be registered.
  const openSettings: Electron.MenuItemConstructorOptions = {
    label: t("Settings…"),
    accelerator: "CmdOrCtrl+,",
    click: () => mainWindow?.webContents.send("desktop.settings.open"),
  };
  const checkForUpdates: Electron.MenuItemConstructorOptions = {
    label: t("Check for Updates…"),
    visible: updaterSupport(updaterEnvironment).supported,
    click: () => void checkForUpdatesFromMenu(),
  };
  const changeServer: Electron.MenuItemConstructorOptions = {
    id: "change-rakazo-server",
    label: t("Change Sydney Server…"),
    accelerator: "CmdOrCtrl+Shift+K",
    click: () => showSetupWindow(),
  };
  const stopStack: Electron.MenuItemConstructorOptions = {
    id: "stop-local-stack",
    label: t("Stop Local Stack"),
    // The stack keeps running after quit (bots are always on); this is the explicit off switch.
    click: () => {
      if (isManagedLocalSetup()) {
        hostComputer?.activate(false);
        installApplicationMenu();
        void localStack.stop();
      }
    },
  };
  const isMac = process.platform === "darwin";
  // The page handles these chords itself and stops them, so a key press runs them once; the menu
  // shows them and runs them on click. The page decides whether each one applies right now.
  const command = (
    label: string,
    accelerator: string,
    name: DesktopMenuCommand,
  ): Electron.MenuItemConstructorOptions => ({
    label,
    accelerator,
    click: (_item, window) => {
      if (window && window === mainWindow)
        mainWindow.webContents.send("desktop.menu.command", name);
    },
  });
  const newItem = command(t("New…"), "CmdOrCtrl+N", "new");
  // Electron's own Edit menu, plus Search. Electron names role items in English, so each one
  // gets its label to translate it.
  const macEdit: Electron.MenuItemConstructorOptions[] = [
    { type: "separator" },
    {
      label: t("Speech"),
      submenu: [
        { role: "startSpeaking", label: t("Start Speaking") },
        { role: "stopSpeaking", label: t("Stop Speaking") },
      ],
    },
  ];
  const editMenu: Electron.MenuItemConstructorOptions = {
    label: t("Edit"),
    submenu: [
      { role: "undo", label: t("Undo") },
      { role: "redo", label: t("Redo") },
      { type: "separator" },
      { role: "cut", label: t("Cut") },
      { role: "copy", label: t("Copy") },
      { role: "paste", label: t("Paste") },
      ...(isMac
        ? [{ role: "pasteAndMatchStyle", label: t("Paste and Match Style") } as const]
        : []),
      { role: "delete", label: t("Delete") },
      { role: "selectAll", label: t("Select All") },
      { type: "separator" },
      command(t("Search…"), "CmdOrCtrl+F", "search"),
      ...(isMac ? macEdit : []),
    ],
  };
  const goMenu: Electron.MenuItemConstructorOptions = {
    label: t("Go"),
    submenu: [
      command(t("Back"), isMac ? "Cmd+[" : "Alt+Left", "back"),
      command(t("Forward"), isMac ? "Cmd+]" : "Alt+Right", "forward"),
      { type: "separator" },
      command(t("Next Bot"), "Ctrl+Tab", "next-bot"),
      command(t("Previous Bot"), "Ctrl+Shift+Tab", "previous-bot"),
      { type: "separator" },
      command(t("Command Menu…"), "CmdOrCtrl+K", "command-menu"),
    ],
  };
  const viewMenu: Electron.MenuItemConstructorOptions = {
    label: t("View"),
    submenu: [
      command(t("Toggle Sidebar"), "CmdOrCtrl+B", "toggle-sidebar"),
      { type: "separator" },
      { role: "resetZoom", label: t("Actual Size") },
      { role: "zoomIn", label: t("Zoom In") },
      // zoomIn's default accelerator is Cmd/Ctrl+Plus, which needs Shift on US layouts.
      { role: "zoomIn", accelerator: "CommandOrControl+=", visible: false },
      { role: "zoomOut", label: t("Zoom Out") },
      // macOS adds its own Enter Full Screen item to a menu named "View"; a translated title
      // may not be recognized, so it gets the item explicitly.
      ...(process.platform === "darwin" && desktopLocale() === "en"
        ? []
        : ([
            { type: "separator" },
            { role: "togglefullscreen", label: t("Toggle Full Screen") },
          ] as const)),
    ],
  };
  const template: Electron.MenuItemConstructorOptions[] =
    process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about", label: t("About {name}", { name: app.name }) },
              openSettings,
              checkForUpdates,
              { type: "separator" },
              computerAccess,
              revokeComputerAccess,
              changeServer,
              stopStack,
              { type: "separator" },
              { role: "hide", label: t("Hide {name}", { name: app.name }) },
              { role: "hideOthers", label: t("Hide Others") },
              { role: "unhide", label: t("Show All") },
              { type: "separator" },
              { role: "quit", label: t("Quit {name}", { name: app.name }) },
            ],
          },
          { label: t("File"), submenu: [newItem] },
          editMenu,
          viewMenu,
          goMenu,
          {
            label: t("Window"),
            role: "window",
            submenu: [
              { role: "minimize", label: t("Minimize") },
              { role: "zoom", label: t("Zoom") },
              { role: "close", label: t("Close Window") },
              { type: "separator" },
              { role: "front", label: t("Bring All to Front") },
            ],
          },
        ]
      : [
          {
            label: t("File"),
            submenu: [
              newItem,
              { type: "separator" },
              openSettings,
              computerAccess,
              revokeComputerAccess,
              changeServer,
              stopStack,
              { type: "separator" },
              checkForUpdates,
              { type: "separator" },
              { role: "quit", label: process.platform === "win32" ? t("Exit") : t("Quit") },
            ],
          },
          editMenu,
          viewMenu,
          goMenu,
          // The Window menu Electron builds for this role, with its items translated.
          {
            label: t("Window"),
            submenu: [
              { role: "minimize", label: t("Minimize") },
              { role: "zoom", label: t("Zoom") },
              { role: "close", label: t("Close") },
            ],
          },
        ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Setup IPC must only answer the setup window, never a connected Sydney server. */
function fromSetupWindow(event: Pick<Electron.IpcMainInvokeEvent, "sender">) {
  return (
    setupWindow !== null && !setupWindow.isDestroyed() && event.sender === setupWindow.webContents
  );
}

async function probeServer(
  rawUrl: string,
  signal?: AbortSignal,
  headers: Record<string, string> = {},
): Promise<DesktopReachability> {
  const url = normalizeServerUrl(rawUrl);
  if (url === null) return { ok: false, error: t("Enter a valid http:// or https:// address.") };
  const timeout = AbortSignal.timeout(PROBE_TIMEOUT_MS);

  try {
    const response = await net.fetch(`${url}/rpc/health`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ json: {} }),
      cache: "no-store",
      credentials: "omit",
      redirect: "manual",
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    });
    if (response.status >= 300 && response.status < 400) {
      return {
        ok: false,
        status: response.status,
        url,
        error: t("That address redirects elsewhere. Enter the final Sydney server address."),
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        url,
        error: t("The server answered with HTTP {status}.", { status: response.status }),
      };
    }
    const health = await readProbeJson(response);
    if (!isRakazoHealth(health)) {
      return {
        ok: false,
        status: response.status,
        url,
        error: t("That address did not respond like a Sydney server."),
      };
    }
    return {
      ok: true,
      status: response.status,
      url,
    };
  } catch (error) {
    return { ok: false, url, error: probeFailureMessage(error) };
  }
}

/** A public health response is not enough: another checkout may own the same fixed port. */
async function probeManagedStack(
  rawUrl: string,
  token: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const url = normalizeServerUrl(rawUrl);
  // Never put the private stack token on a cleartext LAN or .local hop.
  if (url === null || !maySendDesktopStackToken(url)) return null;
  const timeout = AbortSignal.timeout(PROBE_TIMEOUT_MS);
  try {
    const response = await net.fetch(`${url}${DESKTOP_STACK_PROBE_PATH}`, {
      method: "GET",
      headers: { [DESKTOP_STACK_TOKEN_HEADER]: token },
      cache: "no-store",
      credentials: "omit",
      redirect: "manual",
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    });
    if (!response.ok) return null;
    return desktopStackImageTag(await readProbeJson(response));
  } catch {
    return null;
  }
}

/**
 * Failures raised here carry their translated detail; any other is a network error. Their
 * messages stay English for error reports.
 */
function openFailureDetail(error: unknown): string {
  return errorDetail(error) ?? probeFailureMessage(error);
}

function activateDesktopMonitoring(
  url: string | undefined,
  targetSession?: Session,
  customFetch?: (path: string, init?: RequestInit) => Promise<Response>,
) {
  if (
    monitoringTargetUrl === url &&
    monitoringSession === targetSession &&
    monitoringFetchOverride === customFetch
  )
    return;
  stopMonitoringSession?.();
  stopMonitoringSession = undefined;
  monitoringTargetUrl = url;
  monitoringSession = targetSession;
  monitoringFetchOverride = customFetch;
  if (!url || !targetSession) {
    disableDesktopMonitoring();
    return;
  }
  const fetchMonitoringConfig = () =>
    customFetch
      ? customFetch("/api/monitoring/config", {
          signal: AbortSignal.timeout(8_000),
        })
      : targetSession.fetch(new URL("/api/monitoring/config", url).href, {
          signal: AbortSignal.timeout(8_000),
        });
  const refreshMonitoringUser = () => {
    if (
      monitoringSession === targetSession &&
      monitoringTargetUrl === url &&
      monitoringFetchOverride === customFetch
    )
      void refreshDesktopMonitoringUser(fetchMonitoringConfig);
  };
  targetSession.cookies.on("changed", refreshMonitoringUser);
  stopMonitoringSession = () =>
    targetSession.cookies.removeListener("changed", refreshMonitoringUser);
  void configureDesktopMonitoring(fetchMonitoringConfig, {
    version: app.getVersion(),
    base: url,
    reportsErrors,
  });
}

let headerSession: Session | undefined;

function configureHeaderSession(value: Session | undefined) {
  if (headerSession && !isStandaloneManagedSession(headerSession)) {
    headerSession.webRequest.onBeforeSendHeaders(null);
  }
  headerSession = undefined;
  if (!value || isStandaloneManagedSession(value)) return;
  if (!currentSetup?.headers || Object.keys(currentSetup.headers).length === 0) return;
  headerSession = value;
  installServerHeaders(
    value,
    () => currentSetup,
    () => mainWindow?.webContents.id,
  );
}

function isManagedLocalSetup(): boolean {
  return (
    managedLocalAvailable() &&
    currentSetup?.mode === "new" &&
    directWebOverrideUrl === null &&
    pcBackendOverrideUrl === null
  );
}

function managedLocalAvailable(): boolean {
  return process.platform !== "win32" || !app.isPackaged;
}

function standaloneRendererRoot(): string | null {
  if (process.env.RAKAZO_DISABLE_BUNDLED_RENDERER === "1") return null;
  if (app.isPackaged) return path.join(process.resourcesPath, "web");
  const override = process.env.SYDNEY_STANDALONE_RENDERER_DIR?.trim();
  return override ? path.resolve(override) : null;
}

function standaloneSetupForTarget(targetUrl: string): DesktopSetup | null {
  if (directWebOverrideUrl !== null && targetUrl === directWebOverrideUrl) return null;
  if (isManagedLocalSetup() && targetUrl === localStack.webUrl()) return null;
  const normalized = normalizeServerUrl(targetUrl);
  if (normalized === null) return null;
  if (currentSetup?.mode === "existing" && currentSetup.serverUrl === normalized) {
    return currentSetup;
  }
  return { mode: "existing", serverUrl: normalized };
}

function markPreProbed(url: string) {
  preProbedOrigin = normalizeServerUrl(url);
}

function consumePreProbed(normalizedOrigin: string): boolean {
  const matched = preProbedOrigin === normalizedOrigin;
  preProbedOrigin = null;
  return matched;
}

async function stopStandaloneContext(context: StandaloneContext | null | undefined) {
  if (!context) return;
  context.unbindSession();
  await context.proxy.stop().catch(() => undefined);
}

async function restorePausedStandalone(
  paused: Extract<PendingPreviousStandalone, { kind: "paused-same-origin" }>,
  previousWin: BrowserWindow | null,
): Promise<StandaloneContext> {
  const proxy = new StandaloneRendererProxy({
    rendererRoot: paused.rendererRoot,
    remoteOrigin: paused.remoteOrigin,
    setup: paused.setupSnapshot,
    port: paused.port,
    requireCapability: true,
  });
  const uiOrigin = await proxy.start();
  const bound = bindStandaloneSession(paused.session, {
    proxyOrigin: uiOrigin,
    remoteOrigin: paused.remoteOrigin,
    capability: proxy.capability,
    screenCapability: proxy.screenCapability,
    appContentsId: () =>
      previousWin && !previousWin.isDestroyed() ? previousWin.webContents.id : undefined,
  });
  if (previousWin && !previousWin.isDestroyed()) {
    appWindowTargets.set(previousWin, uiOrigin);
    appWindowRemoteOrigins.set(previousWin, paused.remoteOrigin);
  }
  return {
    window: previousWin,
    rendererRoot: paused.rendererRoot,
    remoteOrigin: paused.remoteOrigin,
    uiOrigin,
    port: paused.port,
    partition: paused.partition,
    session: paused.session,
    setupSnapshot: paused.setupSnapshot,
    proxy,
    unbindSession: bound.unbind,
    fetchBackend: bound.fetchBackend,
  };
}

async function openStandaloneOnce(
  rendererRoot: string,
  setupSnapshot: DesktopSetup,
  switching: boolean,
): Promise<boolean> {
  const remoteOrigin = setupSnapshot.serverUrl;
  const alreadyProbed = consumePreProbed(remoteOrigin);
  hostComputer?.activate(false);

  const partition = standaloneSessionPartitionForServerUrl(remoteOrigin);
  if (partition === null) {
    if (mainWindow === null) {
      showSetupWindow(
        t("Could not open that server. {detail}", {
          detail: t("Enter a valid http:// or https:// address."),
        }),
      );
    }
    return false;
  }

  if (!alreadyProbed) {
    const reachability = await probeServer(remoteOrigin, undefined, setupSnapshot.headers);
    if (!reachability.ok) {
      const detail = reachability.error ?? t("Could not reach that address.");
      if (mainWindow === null) {
        showSetupWindow(t("Could not open that server. {detail}", { detail }));
      }
      return false;
    }
  }

  const userDataDir = app.getPath("userData");
  const previous = mainWindow;
  const previousStandalone = activeStandalone;
  let pausedSameOrigin: Extract<PendingPreviousStandalone, { kind: "paused-same-origin" }> | null =
    null;

  if (previousStandalone?.remoteOrigin === remoteOrigin) {
    pausedSameOrigin = {
      kind: "paused-same-origin",
      rendererRoot: previousStandalone.rendererRoot,
      remoteOrigin: previousStandalone.remoteOrigin,
      port: previousStandalone.port,
      partition: previousStandalone.partition,
      session: previousStandalone.session,
      setupSnapshot: previousStandalone.setupSnapshot,
    };
    activeStandalone = null;
    await stopStandaloneContext(previousStandalone);
  }

  let win: BrowserWindow | null = null;
  let candidate: StandaloneContext | null = null;

  try {
    let existingPort: number | undefined;
    try {
      const registry = await readStandaloneOriginRegistry(userDataDir);
      existingPort = registry.get(remoteOrigin)?.port;
    } catch (error) {
      if (error instanceof StandaloneOriginStoreError) {
        throw withDetail(
          new ServerUnavailable(error.message),
          t(
            "The local renderer origin file could not be read. Repair or remove standalone-origins.json and retry.",
          ),
        );
      }
      throw error;
    }

    const proxy = new StandaloneRendererProxy({
      rendererRoot,
      remoteOrigin,
      setup: setupSnapshot,
      port: existingPort ?? 0,
      requireCapability: true,
    });
    let uiOrigin: string;
    try {
      uiOrigin = await proxy.start();
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "EADDRINUSE" && existingPort !== undefined) {
        throw withDetail(
          new ServerUnavailable(`Local renderer port ${existingPort} is already in use.`),
          t(
            "The local renderer port {port} is already in use. Close the conflicting app and retry.",
            { port: existingPort },
          ),
        );
      }
      throw error;
    }

    const boundPort = Number(new URL(uiOrigin).port);
    if (existingPort === undefined) {
      try {
        await recordStandaloneOrigin(userDataDir, {
          remoteOrigin,
          port: boundPort,
          partition,
        });
      } catch (error) {
        await proxy.stop().catch(() => undefined);
        if (error instanceof StandaloneOriginStoreError) {
          throw withDetail(
            new ServerUnavailable(error.message),
            t(
              "The local renderer origin file could not be read. Repair or remove standalone-origins.json and retry.",
            ),
          );
        }
        throw error;
      }
    }

    const targetSession = session.fromPartition(partition);
    win = buildAppWindow(uiOrigin, partition, remoteOrigin);
    const bound = bindStandaloneSession(targetSession, {
      proxyOrigin: uiOrigin,
      remoteOrigin,
      capability: proxy.capability,
      screenCapability: proxy.screenCapability,
      appContentsId: () => (win !== null && !win.isDestroyed() ? win.webContents.id : undefined),
    });
    candidate = {
      window: win,
      rendererRoot,
      remoteOrigin,
      uiOrigin,
      port: boundPort,
      partition,
      session: targetSession,
      setupSnapshot,
      proxy,
      unbindSession: bound.unbind,
      fetchBackend: bound.fetchBackend,
    };

    if (previous === null) {
      activateDesktopMonitoring(remoteOrigin, targetSession, bound.fetchBackend);
    }

    let state = await startAppWindowLoad(win, uiOrigin);
    const legacyPartition = sessionPartitionKey(remoteOrigin);
    if (
      previous === null &&
      state === "ready" &&
      legacyPartition !== null &&
      (await needsLegacySidebarDensity(win, uiOrigin).catch(() => false))
    ) {
      const prefersDefault = existsSync(legacyDefaultSessionFlag(legacyPartition));
      const legacySession = prefersDefault
        ? session.defaultSession
        : session.fromPartition(legacyPartition);
      let density = await readLegacySidebarDensity(legacySession, remoteOrigin).catch(() => null);
      if (density === null && !prefersDefault && defaultSessionProfileExists()) {
        density = await readLegacySidebarDensity(session.defaultSession, remoteOrigin).catch(
          () => null,
        );
      }
      if (
        density &&
        (await importLegacySidebarDensity(win, uiOrigin, density).catch(() => false))
      ) {
        state = await startAppWindowLoad(win, uiOrigin);
      }
    }
    if (switching && state === "pending") {
      throw withDetail(
        new ServerUnavailable("The server page did not become ready."),
        t("The server page did not become ready."),
      );
    }
    if (switching && state === "failed") {
      throw withDetail(
        new Error("The server page did not become ready."),
        t("The server page did not become ready."),
      );
    }

    activeStandalone = candidate;
    win.webContents.send("desktop.settings.legacyMigrationReady");
    currentTargetUrl = remoteOrigin;
    activateDesktopMonitoring(remoteOrigin, targetSession, bound.fetchBackend);
    setupError = null;

    const hasLivePrevious = previous !== null && !previous.isDestroyed() && previous !== win;
    pendingPreviousWindow = hasLivePrevious ? previous : null;
    if (pendingPreviousWindow !== null) pendingPreviousWindow.hide();
    if (pausedSameOrigin !== null) {
      pendingPreviousStandalone = hasLivePrevious ? pausedSameOrigin : null;
    } else if (previousStandalone !== null) {
      if (hasLivePrevious) {
        pendingPreviousStandalone = { kind: "live", context: previousStandalone };
      } else {
        await stopStandaloneContext(previousStandalone);
        pendingPreviousStandalone = null;
      }
    } else {
      pendingPreviousStandalone = null;
    }
    return true;
  } catch (error) {
    const closed = win?.isDestroyed() === true;
    if (!closed && !(error instanceof ServerUnavailable)) {
      reportDesktopError(error, "desktop.startup");
    }
    await stopStandaloneContext(candidate);
    pendingPreviousWindow = null;
    pendingPreviousStandalone = null;

    let destroyUnrestoredPrevious: BrowserWindow | null = null;
    if (previous !== null && !previous.isDestroyed()) {
      if (pausedSameOrigin !== null) {
        activeStandalone = await restorePausedStandalone(pausedSameOrigin, previous).catch(
          () => null,
        );
        if (activeStandalone !== null) {
          mainWindow = previous;
          activateDesktopMonitoring(
            activeStandalone.remoteOrigin,
            activeStandalone.session,
            activeStandalone.fetchBackend,
          );
        } else {
          mainWindow = null;
          activateDesktopMonitoring(undefined);
          destroyUnrestoredPrevious = previous;
        }
      } else {
        mainWindow = previous;
        if (activeStandalone !== null) {
          activateDesktopMonitoring(
            activeStandalone.remoteOrigin,
            activeStandalone.session,
            activeStandalone.fetchBackend,
          );
        }
      }
    } else {
      if (pausedSameOrigin === null && previousStandalone !== null) {
        await stopStandaloneContext(previousStandalone);
      }
      mainWindow = null;
      activeStandalone = null;
      activateDesktopMonitoring(undefined);
    }

    if (closed && destroyUnrestoredPrevious === null) return false;
    showSetupWindow(
      t("Could not open that server. {detail}", { detail: openFailureDetail(error) }),
    );
    if (destroyUnrestoredPrevious !== null && !destroyUnrestoredPrevious.isDestroyed()) {
      destroyUnrestoredPrevious.destroy();
    }
    if (win !== null && !win.isDestroyed()) win.destroy();
    return false;
  }
}

async function openAppOnce(targetUrl: string, switching: boolean) {
  const rendererRoot = standaloneRendererRoot();
  const standaloneSetup = rendererRoot !== null ? standaloneSetupForTarget(targetUrl) : null;
  if (rendererRoot !== null && standaloneSetup !== null) {
    return openStandaloneOnce(rendererRoot, standaloneSetup, switching);
  }
  consumePreProbed(normalizeServerUrl(targetUrl) ?? "");

  hostComputer?.activate(isManagedLocalSetup() && targetUrl === localStack.webUrl());
  const target = await resolveSessionForTarget(targetUrl);
  configureHeaderSession(target.value);
  // A failed switch must leave telemetry with the window that remains selected.
  if (mainWindow === null) activateDesktopMonitoring(targetUrl, target.value);
  const previous = mainWindow;
  const previousStandalone = activeStandalone;
  let win: BrowserWindow | null = null;
  try {
    const documentError = await probeDocument(targetUrl);
    if (documentError !== null) throw documentError;
    await installBundledRenderer(targetUrl, target.value, target.partition, isManagedLocalSetup());
    const created = createWindow(
      targetUrl,
      target.partition,
      isManagedLocalSetup() ? null : safeOrigin(targetUrl),
    );
    win = created.win;
    // On launch the window stays up: the web app shows its own loading, reconnecting or error
    // screen and recovers from it. Switching to a server that is not ready keeps the previous one.
    const state = await created.loaded;
    if (switching && state === "pending") {
      throw withDetail(
        new ServerUnavailable("The server page did not become ready."),
        t("The server page did not become ready."),
      );
    }
    if (switching && state === "failed") {
      throw withDetail(
        new Error("The server page did not become ready."),
        t("The server page did not become ready."),
      );
    }
    activeStandalone = null;
    currentTargetUrl = targetUrl;
    activateDesktopMonitoring(targetUrl, target.value);
    setupError = null;
    const hasLivePrevious = previous !== null && !previous.isDestroyed() && previous !== win;
    // Keep the previous window until the caller commits (after setup.json is written).
    pendingPreviousWindow = hasLivePrevious ? previous : null;
    if (pendingPreviousWindow !== null) pendingPreviousWindow.hide();
    if (previousStandalone !== null) {
      if (hasLivePrevious) {
        pendingPreviousStandalone = { kind: "live", context: previousStandalone };
      } else {
        await stopStandaloneContext(previousStandalone);
        pendingPreviousStandalone = null;
      }
    } else {
      pendingPreviousStandalone = null;
    }
    return true;
  } catch (error) {
    const closed = win?.isDestroyed() === true;
    if (!closed && !(error instanceof ServerUnavailable)) {
      reportDesktopError(error, "desktop.startup");
    }
    pendingPreviousWindow = null;
    pendingPreviousStandalone = null;
    // Keep the previous app window so Cancel / close can restore it.
    if (previous !== null && !previous.isDestroyed()) {
      mainWindow = previous;
    } else {
      mainWindow = null;
      activateDesktopMonitoring(undefined);
    }
    // Closing the window while it loads is the user leaving, not a failure to explain.
    if (closed) return false;
    // Show the setup window BEFORE destroying the failed one: on Windows/Linux,
    // destroying the last window fires "window-all-closed" -> app.quit() before
    // showSetupWindow() runs, so the app silently exits instead of showing this error.
    showSetupWindow(
      t("Could not open that server. {detail}", { detail: openFailureDetail(error) }),
    );
    if (win !== null && !win.isDestroyed()) win.destroy();
    return false;
  }
}

function syncHostComputerAccess(forceReconnectDevices = false) {
  hostComputer?.activate(
    isManagedLocalSetup() &&
      mainWindow !== null &&
      !mainWindow.isDestroyed() &&
      appWindowTargets.get(mainWindow) === localStack.webUrl(),
  );
  const origin = remoteServerOrigin();
  if (forceReconnectDevices && origin !== null) {
    void userDevices
      ?.select(null)
      .then(() => userDevices?.select(remoteServerOrigin()))
      .catch(() => undefined);
  } else {
    void userDevices?.select(origin).catch(() => undefined);
  }
  installApplicationMenu();
}

/** The server the app window shows, unless it is the app-managed local stack. */
function remoteServerOrigin() {
  if (mainWindow === null || mainWindow.isDestroyed()) return null;
  if (appWindowRemoteOrigins.has(mainWindow)) {
    return appWindowRemoteOrigins.get(mainWindow) ?? null;
  }
  if (isManagedLocalSetup()) return null;
  const target = appWindowTargets.get(mainWindow);
  return target === undefined ? null : safeOrigin(target);
}

/** The trust boundary: only a click on Allow here lets bots use this computer. */
async function confirmComputerAccess(detail: string) {
  const options: Electron.MessageBoxOptions = {
    type: "warning",
    title: t("Allow local computer access?"),
    message: t("Allow bots to use this computer?"),
    detail,
    buttons: [t("Cancel"), t("Allow")],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  };
  const win = mainWindow !== null && !mainWindow.isDestroyed() ? mainWindow : null;
  const result = await (win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options));
  return result.response === 1;
}

/** A bot asks while the person may be elsewhere, so bring the prompt to them. */
function confirmRemoteComputerAccess(host: string) {
  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    if (!mainWindow.isVisible()) mainWindow.show();
    else if (!mainWindow.isFocused()) app.dock?.bounce("informational");
  }
  return confirmComputerAccess(
    t(
      "Bots on {host} can run commands, read and change files, and launch apps with your account’s permissions. You can revoke access in Settings.",
      { host },
    ),
  );
}

function deviceTokenCipher() {
  return {
    // Linux without a keyring falls back to a fixed key; keep the token off disk there.
    available: async () =>
      (await safeStorage.isAsyncEncryptionAvailable()) &&
      !(process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text"),
    encrypt: (value: string) => safeStorage.encryptStringAsync(value),
    decrypt: async (value: Buffer) => (await safeStorage.decryptStringAsync(value)).result,
  };
}

/** Drop the previous app window after the new server is opened and persisted. */
function commitPendingAppSwitch() {
  if (activeStandalone !== null) {
    configureHeaderSession(undefined);
  }
  const previousStandalone = pendingPreviousStandalone;
  pendingPreviousStandalone = null;
  if (previousStandalone?.kind === "live") {
    void stopStandaloneContext(previousStandalone.context);
  }
  syncHostComputerAccess(previousStandalone?.kind === "paused-same-origin");
  const previous = pendingPreviousWindow;
  pendingPreviousWindow = null;
  if (previous !== null && !previous.isDestroyed() && previous !== mainWindow) previous.destroy();
}

/**
 * Undo an open that could not be persisted. When a prior session exists, restore
 * it. On first run keep the connected window so the user can retry save.
 */
async function abandonPendingAppSwitch(
  previousSetup: DesktopSetup | null,
  previousUrl: string | null,
  previousDirectOverride: string | null = directWebOverrideUrl,
  previousPcBackendOverride: string | null = pcBackendOverrideUrl,
): Promise<"restored" | "kept" | "unrestorable"> {
  const previous = pendingPreviousWindow;
  const previousStandalone = pendingPreviousStandalone;
  pendingPreviousWindow = null;
  pendingPreviousStandalone = null;
  if (previous !== null && !previous.isDestroyed()) {
    const failed = mainWindow;
    const failedStandalone = activeStandalone;
    mainWindow = previous;
    activeStandalone = null;
    await stopStandaloneContext(failedStandalone);
    if (failed !== null && !failed.isDestroyed() && failed !== previous) failed.destroy();
    currentSetup = previousSetup;
    directWebOverrideUrl = previousDirectOverride;
    pcBackendOverrideUrl = previousPcBackendOverride;
    currentTargetUrl = previousUrl;

    if (previousStandalone?.kind === "live") {
      activeStandalone = previousStandalone.context;
      configureHeaderSession(undefined);
      activateDesktopMonitoring(
        activeStandalone.remoteOrigin,
        activeStandalone.session,
        activeStandalone.fetchBackend,
      );
    } else if (previousStandalone?.kind === "paused-same-origin") {
      activeStandalone = await restorePausedStandalone(previousStandalone, previous).catch(
        () => null,
      );
      configureHeaderSession(undefined);
      if (activeStandalone !== null) {
        activateDesktopMonitoring(
          activeStandalone.remoteOrigin,
          activeStandalone.session,
          activeStandalone.fetchBackend,
        );
      } else {
        mainWindow = null;
        activateDesktopMonitoring(undefined);
        syncHostComputerAccess();
        if (setupWindow === null || setupWindow.isDestroyed()) {
          showSetupWindow(t("Could not save that address. Try again."));
        }
        if (!previous.isDestroyed()) previous.destroy();
        return "unrestorable";
      }
    } else {
      configureHeaderSession(mainWindow?.webContents.session);
      activateDesktopMonitoring(previousUrl ?? undefined, previous.webContents.session);
    }

    syncHostComputerAccess(previousStandalone?.kind === "paused-same-origin");
    // If setup was already closed (e.g. during a slow write), make the restored
    // session visible — otherwise macOS can be left with no shown window.
    if (setupWindow === null || setupWindow.isDestroyed()) {
      clearTimeout(warmWindowTimer);
      previous.show();
      previous.focus();
    }
    return "restored";
  }
  return "kept";
}

/** Watch for a renderer crash until setup is persisted (or the switch is abandoned). */
function watchRendererUntilCommitted(win: BrowserWindow) {
  let crashed = false;
  const onGone = () => {
    crashed = true;
  };
  win.webContents.once("render-process-gone", onGone);
  return {
    crashed: () => crashed || (!win.isDestroyed() && win.webContents.isCrashed()),
    dispose: () => {
      if (!win.isDestroyed()) win.webContents.removeListener("render-process-gone", onGone);
    },
  };
}

function destroySetupWindow() {
  const setup = setupWindow;
  setupWindow = null;
  if (setup !== null && !setup.isDestroyed()) setup.destroy();
}

/** Best-effort restore of setup.json after a failed save that already wrote disk. */
async function rollbackSetupFile(userDataDir: string, previousSetup: DesktopSetup | null) {
  try {
    if (previousSetup !== null) await writeSetup(userDataDir, previousSetup);
    else await clearSetup(userDataDir);
  } catch {
    // Disk rollback is best-effort; callers already restored in-memory state when possible.
  }
}

/**
 * After a renderer crash around save: restore prior setup when possible, otherwise
 * drop the crashed first-run window so setup remains the only recovery surface.
 */
async function recoverFromCrashedSave(
  userDataDir: string,
  previousSetup: DesktopSetup | null,
  previousUrl: string | null,
  previousDirectOverride: string | null = directWebOverrideUrl,
  previousPcBackendOverride: string | null = pcBackendOverrideUrl,
): Promise<string> {
  const outcome = await abandonPendingAppSwitch(
    previousSetup,
    previousUrl,
    previousDirectOverride,
    previousPcBackendOverride,
  );
  await rollbackSetupFile(userDataDir, previousSetup);
  if (outcome === "kept") {
    const crashedWindow = mainWindow;
    const crashedStandalone = activeStandalone;
    mainWindow = null;
    activeStandalone = null;
    await stopStandaloneContext(crashedStandalone);
    if (crashedWindow !== null && !crashedWindow.isDestroyed()) crashedWindow.destroy();
    currentSetup = previousSetup;
    directWebOverrideUrl = previousDirectOverride;
    pcBackendOverrideUrl = previousPcBackendOverride;
    configureHeaderSession(undefined);
    currentTargetUrl = previousUrl;
    if (
      previousUrl &&
      (standaloneRendererRoot() === null || standaloneSetupForTarget(previousUrl) === null)
    ) {
      const restored = await resolveSessionForTarget(previousUrl);
      activateDesktopMonitoring(previousUrl, restored.value);
    } else activateDesktopMonitoring(undefined);
    syncHostComputerAccess();
  }
  const message =
    previousSetup !== null
      ? t(
          "Could not open that server. Renderer stopped. The previous instance was restored for the next launch.",
        )
      : t("Could not open that server. Renderer stopped.");
  showSetupWindow(message);
  return message;
}

function safeOrigin(targetUrl: string) {
  try {
    return new URL(targetUrl).origin;
  } catch {
    return null;
  }
}

// A second launch on Linux/Windows would rerun host-computer setup, overwrite
// the saved token and restart the local stack under the running instance.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (startupWindow && !startupWindow.isDestroyed()) {
      startupWindow.show();
      startupWindow.focus();
      return;
    }
    const win = secondInstanceWindow(setupWindow, mainWindow);
    if (win === null) return;
    revealSecondInstanceWindow(win);
  });
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  const startup = createStartupWindow();
  await finishAfterStartup(startDesktop(), startup.shown, () => finishStartupWindow(startup));
});

async function startDesktop() {
  installSessionPermissions(session.defaultSession, permissionTarget);
  const userDataDir = app.getPath("userData");
  startDesktopLocale(
    await readUiLocale(userDataDir),
    app.getPreferredSystemLanguages()[0] ?? app.getLocale(),
  );
  desktopUpdater = new DesktopUpdateController(
    updaterEnvironment,
    // Loaded only when a packaged build actually checks for updates.
    async () => {
      const module = await import("electron-updater");
      return (module.default ?? module).autoUpdater as unknown as ElectronAutoUpdater;
    },
    undefined,
    () => {
      quitting = false;
    },
  );
  try {
    hostComputer = await prepareHostComputer(userDataDir);
  } catch {
    /* Local access fails closed; Docker remains available. */
  }
  const screenDriver = screenDriverRelease(process.platform);
  hostScreen =
    screenDriver &&
    createDesktopHostScreen({
      platform: process.platform,
      driver: screenDriverInstaller({
        dir: path.join(userDataDir, "screen-driver", "bin"),
        fetch: (url) => net.fetch(url),
        release: screenDriver,
      }),
      home: path.join(userDataDir, "screen-driver", "home"),
      permissions: {
        isTrustedAccessibilityClient: (prompt) =>
          systemPreferences.isTrustedAccessibilityClient(prompt),
        getMediaAccessStatus: (type) => systemPreferences.getMediaAccessStatus(type),
        requestScreenCapture: () =>
          desktopCapturer.getSources({ types: ["window"], thumbnailSize: { width: 0, height: 0 } }),
      },
      locked: () => powerMonitor.getSystemIdleState(1) === "locked",
      fitImage: (png, maxDimension) => {
        const image = nativeImage.createFromBuffer(png);
        const { width, height } = image.getSize();
        if (!width || !height) return undefined;
        const fitted = image.resize(
          width >= height ? { width: maxDimension } : { height: maxDimension },
        );
        return { png: fitted.toPNG(), ...fitted.getSize() };
      },
    });
  const deviceFetch = (url: string, init: RequestInit) => {
    if (activeStandalone !== null && safeOrigin(url) === activeStandalone.remoteOrigin)
      return activeStandalone.fetchBackend(url, init);
    return (mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents.session : net).fetch(url, {
      ...init,
      bypassCustomProtocolHandlers: true,
    });
  };
  const projectDirectories = createProjectDirectoryAccess({
    userDataDir,
    current: () => {
      const origin = remoteServerOrigin();
      const device = origin ? userDevices?.pairing(origin) : null;
      return origin && device ? { origin, device } : null;
    },
    fetch: deviceFetch,
    choose: async (scope) => {
      const window = mainWindow;
      if (!window || window.isDestroyed()) return null;
      const result = await dialog.showOpenDialog(window, {
        title: `Sydney — ${scope.projectName}`,
        message: "选择要绑定的项目目录。完整路径仅保存在本机。",
        buttonLabel: "绑定此目录",
        properties: ["openDirectory", "dontAddToRecent"],
      });
      return result.canceled ? null : result.filePaths[0] ?? null;
    },
    files: process.platform === "win32" ? {
      capture: captureWindowsProjectRoot,
      execute: executeWindowsProjectFile,
      confirm: async (scope, directory, origin) => {
        const window = mainWindow;
        if (!window || window.isDestroyed()) return null;
        const { response } = await dialog.showMessageBox(window, {
          type: "question",
          title: "Sydney 项目目录授权",
          message: `允许项目「${scope.projectName}」访问此目录？`,
          detail: [
            directory,
            `服务器 ${origin}`,
            "允许读取的文本可能发送给此服务器和任务所选的 AI 模型。完整目录路径留在本机。",
            "若允许新建，项目还可以在此目录内创建新的 Markdown 文件。已有文件会保留。",
          ].join("\n\n"),
          buttons: ["取消", "只读", "读取并允许新建"],
          defaultId: 1,
          cancelId: 0,
          noLink: true,
        });
        return response === 1 ? "read-only" : response === 2 ? "read-write" : null;
      },
    } : undefined,
  });
  userDevices = createUserDeviceAccess({
    userDataDir,
    cipher: deviceTokenCipher(),
    device: async () => ({
      name: await deviceName(),
      platform:
        process.platform === "win32" || process.platform === "linux" ? process.platform : "darwin",
    }),
    confirm: (host) => confirmRemoteComputerAccess(host),
    // The app window's session carries the sign-in for that server; the token never reaches it.
    fetch: deviceFetch,
    workspaceGrant: (origin, device, request) => projectDirectories.request(origin, device, request),
    projectFile: (origin, device, request, signal) =>
      projectDirectories.execute(origin, device, request, signal),
    projectWindowsTerminal: createProjectWindowsTerminal(async (origin, request, signal) => {
      const window = mainWindow;
      if (!window || window.isDestroyed()) return false;
      const { response } = await dialog.showMessageBox(window, {
        type: "question",
        title: "Sydney Windows 终端授权",
        message: "允许本次 Windows 诊断？",
        detail: [
          `项目：${request.projectName}`,
          `服务器：${origin}`,
          `任务：${request.runId}`,
          `执行位置：这台 Windows 电脑`,
          request.command === "ver" ? "ver · 读取 Windows 版本" : "chcp · 读取终端代码页",
          "结果将发送给该任务使用的 AI 模型。",
        ].join("\n"),
        buttons: ["取消", "仅允许本次"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        signal,
      });
      return response === 1;
    }),
    connect: (origin, token, events) =>
      startUserDeviceClient({
        serverUrl: origin,
        token,
        headers: serverHeadersFor(
          origin,
          activeStandalone?.remoteOrigin === origin ? activeStandalone.setupSnapshot : currentSetup,
        ),
        root: path.join(userDataDir, "computers"),
        screen: hostScreen,
        ...events,
      }),
  });
  localStack = new LocalStackController({
    hostComputer: hostComputer?.connection,
    platform: process.platform,
    env: process.env,
    exists: existsSync,
    run: runDocker,
    stackDir: stackDir(userDataDir),
    resourceDir: stackResourceDir({
      packaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      appPath: app.getAppPath(),
    }),
    localWebUrl:
      process.env.RAKAZO_LOCAL_WEB_URL?.trim() ||
      (await readStackWebUrl(stackDir(userDataDir), LOCAL_WEB_URL)),
    imageTag: resolveImageTag({
      version: app.getVersion(),
      packaged: app.isPackaged,
      override: process.env.RAKAZO_IMAGE_TAG,
    }),
    probe: (url, signal, token) => probeManagedStack(url, token, signal),
    randomHex: (bytes) => randomBytes(bytes).toString("hex"),
    onState: (state) => {
      if (setupWindow !== null && !setupWindow.isDestroyed()) {
        setupWindow.webContents.send("desktop.setup.stack.changed", state);
      }
    },
  });
  currentSetup = await readSetup(userDataDir);
  const target = resolveStartupTarget({
    envUrl: process.env.RAKAZO_WEB_URL,
    pcBackendUrl: process.env.SYDNEY_PC_BACKEND_URL,
    saved: currentSetup,
    forceSetup: process.env.RAKAZO_FORCE_SETUP === "1",
    managedLocalAvailable: managedLocalAvailable(),
  });
  directWebOverrideUrl = target.kind === "app" && target.source === "env" ? target.url : null;
  pcBackendOverrideUrl =
    target.kind === "app" && target.source === "pc-env"
      ? (normalizeServerUrl(target.url) ?? target.url)
      : null;
  if (process.env.RAKAZO_PERFORMANCE_CLEAR_CACHE === "1") {
    const cacheSessions = new Set<Session>([session.defaultSession]);
    if (target.kind === "app") {
      const standaloneSetup =
        standaloneRendererRoot() !== null ? standaloneSetupForTarget(target.url) : null;
      const standalonePartition = standaloneSetup
        ? standaloneSessionPartitionForServerUrl(standaloneSetup.serverUrl)
        : null;
      if (standalonePartition !== null) {
        cacheSessions.add(session.fromPartition(standalonePartition));
      } else {
        cacheSessions.add((await resolveSessionForTarget(target.url)).value);
      }
    }
    await Promise.all(
      [...cacheSessions].flatMap((value) => [value.clearCache(), value.clearCodeCaches({})]),
    );
    markOnce("rk:main:caches-cleared");
  }

  const icon = developmentIcon();
  if (process.platform === "darwin" && icon) app.dock?.setIcon(icon);
  installApplicationMenu();
  const browserAuthAttempts = new Map<string, AbortController>();
  const cancelBrowserAuth = () => {
    for (const attempt of browserAuthAttempts.values()) attempt.abort();
    browserAuthAttempts.clear();
  };
  app.on("before-quit", cancelBrowserAuth);
  ipcMain.handle("desktop.oauth.open", async (event, url: unknown) => {
    if (!fromAppFrame(permissionTarget(), event) || typeof url !== "string" || url.length > 16_384)
      throw new Error("Invalid sign-in request.");
    if (browserAuthAttempts.has(url) || browserAuthAttempts.size >= 8) {
      throw new Error(t("A sign-in attempt is already active. Cancel it and retry."));
    }
    const controller = new AbortController();
    browserAuthAttempts.set(url, controller);
    const stop = () => controller.abort();
    const expiry = setTimeout(stop, 10 * 60_000);
    expiry.unref();
    event.sender.once("destroyed", stop);
    event.sender.once("did-navigate", stop);
    controller.signal.addEventListener(
      "abort",
      () => {
        clearTimeout(expiry);
        event.sender.removeListener("destroyed", stop);
        event.sender.removeListener("did-navigate", stop);
        if (browserAuthAttempts.get(url) === controller) browserAuthAttempts.delete(url);
      },
      { once: true },
    );
    try {
      await openBrowserAuth(url, {
        signal: controller.signal,
        onClose: stop,
        openExternal: (target) => shell.openExternal(target),
        onCallback: (callback) => {
          if (!event.sender.isDestroyed()) event.sender.send("desktop.oauth.callback", callback);
        },
      });
    } catch {
      controller.abort();
      throw new Error(t("Could not open browser sign-in. Close other sign-in attempts and retry."));
    }
  });
  ipcMain.handle("desktop.oauth.cancel", (event, url: unknown) => {
    if (!fromAppFrame(permissionTarget(), event) || typeof url !== "string") return;
    browserAuthAttempts.get(url)?.abort();
  });
  const isManagedComputerRequest = (event: Electron.IpcMainInvokeEvent) =>
    fromMainWindow(event) &&
    event.senderFrame === event.sender.mainFrame &&
    isManagedLocalSetup() &&
    appWindowTargets.get(mainWindow!) === localStack.webUrl() &&
    safeOrigin(event.senderFrame.url) === safeOrigin(localStack.webUrl());
  const persistHostChoice = async (computerHost: "docker" | "this-mac") => {
    const origin = new URL(localStack.webUrl()).origin;
    const token = await readStackToken(stackDir(app.getPath("userData")));
    if (!token || !(await localStack.matchesDesiredStack()))
      throw new Error(t("Local server is unavailable"));
    await saveLocalComputerHost({ origin, token }, computerHost, (input, init) =>
      net.fetch(input instanceof URL ? input.href : input, {
        ...init,
        bypassCustomProtocolHandlers: true,
      }),
    );
  };
  ipcMain.handle("desktop.computer.requestAccess", async (event) => {
    if (!isManagedComputerRequest(event) || !hostComputer)
      throw new Error(t("Local computer access requires an app-managed local instance."));
    if (requestingComputerAccess) return false;
    requestingComputerAccess = true;
    try {
      if (!(await localStack.matchesDesiredStack()) || !isManagedComputerRequest(event))
        return false;
      if (hostComputer.isEnabled()) {
        await persistHostChoice("this-mac");
        return true;
      }
      const allowed = await confirmComputerAccess(
        t(
          "Bots on this local instance can run commands, read and change files, and launch apps with your account’s permissions. You can revoke access from the app menu.",
        ),
      );
      if (!allowed || !isManagedComputerRequest(event)) return false;
      hostComputer.activate(true);
      await hostComputer.grant();
      try {
        await persistHostChoice("this-mac");
      } catch (error) {
        await hostComputer.revoke();
        throw error;
      }
      installApplicationMenu();
      return hostComputer.isEnabled();
    } finally {
      requestingComputerAccess = false;
    }
  });
  ipcMain.handle("desktop.computer.revokeAccess", async (event) => {
    if (isManagedComputerRequest(event)) {
      try {
        await persistHostChoice("docker");
      } finally {
        await hostComputer?.revoke();
        installApplicationMenu();
      }
    }
  });
  /** The remote server's own page in the app window, never a frame or another window. */
  const remoteDeviceOrigin = (event: Electron.IpcMainInvokeEvent) => {
    const origin = remoteServerOrigin();
    return origin !== null && fromAppFrame(permissionTarget(), event) ? origin : null;
  };
  const deviceState = async (origin: string | null): Promise<RakazoDesktopDevice | null> => {
    const state = origin === null ? null : userDevices?.state(origin);
    return state ? { ...state, name: await deviceName() } : null;
  };
  ipcMain.handle("desktop.settings.serverOrigin", (event) => remoteDeviceOrigin(event));
  ipcMain.handle(
    "desktop.settings.readLegacyDraft",
    async (event, key: unknown, space: unknown) => {
      const context = activeStandalone;
      const target = context?.window;
      if (
        !context ||
        !target ||
        event.sender !== target.webContents ||
        !fromAppFrame(permissionTarget(), event) ||
        typeof key !== "string" ||
        typeof space !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(space)
      )
        return null;
      const thread = /^(bot|group):([A-Za-z0-9_-]{1,128})$/.exec(key);
      if (!thread) return null;
      try {
        const signal = AbortSignal.timeout(5000);
        const response = await context.fetchBackend("/api/auth/get-session", {
          credentials: "include",
          signal,
        });
        const sessionData = (await response.json()) as { user?: { id?: unknown } } | null;
        const owner = sessionData?.user?.id;
        if (!response.ok || typeof owner !== "string" || !owner) return null;
        const access = await context.fetchBackend("/rpc/threads/head", {
          method: "POST",
          credentials: "include",
          signal,
          headers: { "Content-Type": "application/json", "x-rakazo-space-id": space },
          body: JSON.stringify({
            json: { [thread[1] === "bot" ? "botId" : "groupId"]: thread[2] },
          }),
        });
        if (!access.ok || activeStandalone !== context) return null;
        const head = (await access.json()) as { json?: { threadId?: unknown } } | null;
        if (typeof head?.json?.threadId !== "string" || !head.json.threadId) return null;
        const partition = sessionPartitionKey(context.remoteOrigin);
        if (partition === null) return null;
        const script = `(async () => {
        if (localStorage.getItem("rakazo.signedInUser") !== ${JSON.stringify(owner)} ||
            localStorage.getItem("rakazo:space-id") !== ${JSON.stringify(space)}) return null;
        const draft = localStorage.getItem(${JSON.stringify(`rakazo.composerDraft.${key}`)});
        const bindings = localStorage.getItem(${JSON.stringify(`rakazo.composerBindings.${key}`)});
        let backgroundId = null;
        if ((await indexedDB.databases()).some((entry) => entry.name === "sydney-chat-appearance")) {
          backgroundId = await new Promise((resolve, reject) => {
            const open = indexedDB.open("sydney-chat-appearance", 1);
            open.onupgradeneeded = () => open.transaction.abort();
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const database = open.result;
              const transaction = database.transaction("settings");
              const read = transaction.objectStore("settings").get("appearance");
              transaction.oncomplete = () => {
                database.close();
                const id = read.result?.chatBackgrounds?.[${JSON.stringify(JSON.stringify([owner, thread[1], thread[2]]))}];
                resolve(typeof id === "string" && id.length > 0 && id.length <= 100 ? id : null);
              };
              transaction.onabort = () => { database.close(); reject(transaction.error); };
            };
          }).catch(() => null);
        }
        const text = draft && draft.length <= 262144 ? draft : "";
        if (!text && !backgroundId) return null;
        return { owner: ${JSON.stringify(owner)}, draft: text, backgroundId,
          bindings: bindings?.length <= 262144 ? bindings : null };
      })()`;
        const prefersDefault = existsSync(legacyDefaultSessionFlag(partition));
        const source = prefersDefault ? session.defaultSession : session.fromPartition(partition);
        const data = await readLegacyStorage(source, context.remoteOrigin, script);
        if (activeStandalone !== context || !fromAppFrame(permissionTarget(), event)) return null;
        if (data || prefersDefault || !defaultSessionProfileExists()) return data;
        const fallback = await readLegacyStorage(
          session.defaultSession,
          context.remoteOrigin,
          script,
        );
        return activeStandalone === context && fromAppFrame(permissionTarget(), event)
          ? fallback
          : null;
      } catch {
        return null;
      }
    },
  );
  ipcMain.handle("desktop.settings.migrateLegacyAvatars", async (event, userId: unknown) => {
    const context = activeStandalone;
    const target = context?.window;
    if (
      !context ||
      !target ||
      !fromAppFrame(permissionTarget(), event) ||
      event.sender !== target.webContents ||
      typeof userId !== "string" ||
      userId.length === 0 ||
      userId.length > 256
    )
      return false;
    try {
      const response = await context.fetchBackend("/api/auth/get-session", {
        credentials: "include",
        signal: AbortSignal.timeout(5000),
      });
      const body = (await response.json()) as { user?: { id?: unknown } } | null;
      if (!response.ok || body?.user?.id !== userId) return false;
      if (activeStandalone !== context || !fromAppFrame(permissionTarget(), event)) return false;
      const partition = sessionPartitionKey(context.remoteOrigin);
      if (partition === null) return false;
      const prefersDefault = existsSync(legacyDefaultSessionFlag(partition));
      const source = prefersDefault ? session.defaultSession : session.fromPartition(partition);
      const migrate = async (legacy: Session) => {
        const avatars = await migrateLegacyAvatars(
          legacy,
          context.remoteOrigin,
          target,
          context.uiOrigin,
          userId,
        ).catch(() => false);
        const appearance =
          activeStandalone === context &&
          (await migrateLegacyAppearance(
            legacy,
            context.remoteOrigin,
            target,
            context.uiOrigin,
            userId,
          ).catch(() => false));
        return avatars || appearance;
      };
      const imported = await migrate(source);
      if (!prefersDefault && defaultSessionProfileExists() && activeStandalone === context) {
        return (await migrate(session.defaultSession)) || imported;
      }
      return imported;
    } catch {
      return false;
    }
  });
  ipcMain.handle("desktop.device.state", (event) => deviceState(remoteDeviceOrigin(event)));
  ipcMain.handle("desktop.projectDirectory.choose", async (event, input) => {
    const origin = remoteDeviceOrigin(event);
    if (!origin) throw new Error("Project selection is unavailable");
    const parsed = ProjectDirectoryInput.parse(input);
    await userDevices?.pairForDirectory(origin);
    return projectDirectories.choose(parsed, () => remoteDeviceOrigin(event) === origin);
  });
  ipcMain.handle("desktop.device.setAllowed", async (event, allowed: unknown) => {
    const origin = remoteDeviceOrigin(event);
    if (origin === null || typeof allowed !== "boolean") return null;
    await userDevices?.setAllowed(origin, allowed);
    return deviceState(remoteDeviceOrigin(event));
  });
  ipcMain.handle(
    "desktop.locale.set",
    createLocaleHandler(
      permissionTarget,
      (locale) => writeUiLocale(userDataDir, locale),
      installApplicationMenu,
    ),
  );
  ipcMain.handle(
    "desktop.badge.set",
    createBadgeHandler(permissionTarget, (count) => app.setBadgeCount(count)),
  );
  if (process.platform === "darwin") {
    // Installed builds ship the helper as an extra resource; `pnpm build` compiles it for development.
    const helper = app.isPackaged
      ? path.join(process.resourcesPath, "speech", "rakazo-speech")
      : path.join(app.getAppPath(), "build", "speech", "rakazo-speech");
    const speech = createSystemSpeech(permissionTarget, (language) =>
      spawn(helper, [language], { stdio: "pipe" }),
    );
    ipcMain.handle("desktop.speech.start", (event, language: unknown, session: unknown) =>
      speech.start(event, language, session),
    );
    ipcMain.handle("desktop.speech.stop", (event, session: unknown) => speech.stop(event, session));
    ipcMain.handle("desktop.speech.abort", (event, session: unknown) =>
      speech.abort(event, session),
    );
  }
  ipcMain.handle("desktop.platform", () => process.platform);
  ipcMain.handle("desktop.passkeys.rpIds", () => passkeyRpIds);
  ipcMain.handle("desktop.monitoring.enabled", () => reportsErrors);
  ipcMain.handle("desktop.window.close", (event) => {
    windowFrom(event)?.close();
  });
  ipcMain.handle("desktop.window.minimize", (event) => {
    windowFrom(event)?.minimize();
  });
  ipcMain.handle("desktop.window.toggleMaximize", (event) => {
    const win = windowFrom(event);
    if (!win) return;
    if (win.isMaximized() || win.isFullScreen()) {
      win.setFullScreen(false);
      if (win.isMaximized()) win.unmaximize();
    } else {
      win.maximize();
    }
  });
  ipcMain.handle("desktop.window.state", (event) => {
    const win = windowFrom(event);
    return {
      minimized: win?.isMinimized() ?? false,
      maximized: win?.isMaximized() ?? false,
      fullScreen: win?.isFullScreen() ?? false,
    };
  });
  ipcMain.handle("desktop.update.state", () => desktopUpdater.state());
  ipcMain.handle("desktop.update.check", (event) =>
    fromAppFrame(permissionTarget(), event) ? desktopUpdater.check(true) : desktopUpdater.state(),
  );
  ipcMain.handle("desktop.update.download", (event) =>
    fromAppFrame(permissionTarget(), event) ? desktopUpdater.download() : desktopUpdater.state(),
  );
  ipcMain.handle("desktop.update.install", (event) =>
    fromAppFrame(permissionTarget(), event) ? installUpdate() : desktopUpdater.state(),
  );
  // Synchronous so the setup page has its language before it first paints.
  ipcMain.on("desktop.setup.locale", (event) => {
    event.returnValue = fromSetupWindow(event)
      ? { lang: desktopLocale(), dir: desktopDirection(), messages: desktopMessages() }
      : null;
  });
  ipcMain.handle("desktop.setup.state", (event) => {
    if (!fromSetupWindow(event)) return null;
    return {
      defaultLocalUrl: localStack.webUrl(),
      managedLocalAvailable: managedLocalAvailable(),
      cloudUrl: RAKAZO_CLOUD_URL,
      saved: currentSetup,
      error: setupError ?? undefined,
    };
  });

  ipcMain.handle("desktop.setup.test", async (event, url: unknown, headers: unknown) => {
    if (!fromSetupWindow(event)) return { ok: false, error: "Setup is not active." };
    if (typeof url !== "string") return { ok: false, error: t("Enter a server address.") };
    const parsedHeaders = parseServerHeaders(headers ?? {});
    if (parsedHeaders === null) return { ok: false, error: t("Invalid custom headers") };
    return probeServer(url, undefined, parsedHeaders);
  });

  ipcMain.handle("desktop.setup.save", async (event, payload: unknown) => {
    if (!fromSetupWindow(event)) return { ok: false, error: "Setup is not active." };
    // A launch still loading counts too: the switch must open and check its own server.
    if (setupSaveInProgress || appOpener.busy())
      return { ok: false, error: t("A connection attempt is already running.") };
    setupSaveInProgress = true;
    const previousSetup = currentSetup;
    const previousUrl = currentTargetUrl;
    const previousDirectOverride = directWebOverrideUrl;
    const previousPcBackendOverride = pcBackendOverrideUrl;
    try {
      const setup = parseSetupInput(payload);
      if (setup === null) {
        return {
          ok: false,
          error: t(
            "Enter a valid server address. Public servers require HTTPS; a new local instance must use localhost.",
          ),
        };
      }

      // Only open the exact origin selected and authenticated by the managed stack.
      let openSetup = setup;
      if (setup.mode === "new") {
        if (!managedLocalAvailable()) {
          return { ok: false, error: t("Enter a server address.") };
        }
        const managedUrl = managedLocalOpenUrl(setup.serverUrl, localStack.webUrl());
        if (managedUrl === null || !(await localStack.matchesDesiredStack())) {
          return {
            ok: false,
            error: t("The app-managed Sydney services are not ready. Retry setup."),
          };
        }
        openSetup = { mode: "new", serverUrl: managedUrl };
      }

      const reachability = await probeServer(openSetup.serverUrl, undefined, openSetup.headers);
      if (!reachability.ok) return { ok: false, error: reachability.error };

      // Open before persisting so a failed renderer load keeps the last working setup.
      currentSetup = openSetup;
      directWebOverrideUrl = null;
      pcBackendOverrideUrl = null;
      markPreProbed(openSetup.serverUrl);
      const opened = await appOpener.open(openSetup.serverUrl, { switching: true });
      if (!opened) {
        currentSetup = previousSetup;
        directWebOverrideUrl = previousDirectOverride;
        pcBackendOverrideUrl = previousPcBackendOverride;
        configureHeaderSession(mainWindow?.webContents.session);
        syncHostComputerAccess();
        const hasRestoredWindow = mainWindow !== null && !mainWindow.isDestroyed();
        return {
          ok: false,
          error: hasRestoredWindow
            ? t("Could not open that server. The previous instance was left unchanged.")
            : (setupError ?? t("Could not save that address. Try again.")),
        };
      }

      const appWindow = mainWindow;
      const rendererWatch =
        appWindow !== null && !appWindow.isDestroyed()
          ? watchRendererUntilCommitted(appWindow)
          : null;
      try {
        await writeSetup(userDataDir, openSetup);
        if (rendererWatch?.crashed()) {
          const message = await recoverFromCrashedSave(
            userDataDir,
            previousSetup,
            previousUrl,
            previousDirectOverride,
            previousPcBackendOverride,
          );
          return { ok: false, error: message };
        }
        // Commit while the crash listener is still armed.
        commitPendingAppSwitch();
        if (rendererWatch?.crashed()) {
          const message = await recoverFromCrashedSave(
            userDataDir,
            previousSetup,
            previousUrl,
            previousDirectOverride,
            previousPcBackendOverride,
          );
          return { ok: false, error: message };
        }
        destroySetupWindow();
        // Final check after setup closes — a crash in this gap still rolls back.
        if (rendererWatch?.crashed()) {
          const message = await recoverFromCrashedSave(
            userDataDir,
            previousSetup,
            previousUrl,
            previousDirectOverride,
            previousPcBackendOverride,
          );
          return { ok: false, error: message };
        }
        return { ok: true };
      } catch {
        const outcome = await abandonPendingAppSwitch(
          previousSetup,
          previousUrl,
          previousDirectOverride,
          previousPcBackendOverride,
        );
        return {
          ok: false,
          error:
            outcome === "restored"
              ? t("Could not save setup. The previous instance was restored.")
              : outcome === "unrestorable"
                ? t("Could not save that address. Try again.")
                : t("Connected, but could not save setup for the next launch. Try Continue again."),
        };
      } finally {
        rendererWatch?.dispose();
      }
    } finally {
      setupSaveInProgress = false;
    }
  });

  ipcMain.handle("desktop.setup.quit", (event) => {
    if (fromSetupWindow(event)) app.quit();
  });
  ipcMain.handle("desktop.setup.openLink", async (event, link: unknown) => {
    if (!fromSetupWindow(event) || !isDesktopSetupLink(link)) return;
    await shell.openExternal(DOCKER_INSTALL_LINKS[link]);
  });
  ipcMain.handle("desktop.setup.stack.state", (event) =>
    managedLocalAvailable() && fromSetupWindow(event) ? localStack.state() : null,
  );
  ipcMain.handle("desktop.setup.stack.start", (event) => {
    if (!managedLocalAvailable() || !fromSetupWindow(event)) return null;
    // Respond right away; the setup window polls `stack.state` until a terminal phase.
    void localStack.start();
    return localStack.state();
  });

  // Register before startup awaits so macOS dock clicks during probe/open are handled.
  app.on("activate", () => {
    if (startupWindow !== null && !startupWindow.isDestroyed()) {
      startupWindow.show();
      startupWindow.focus();
      return;
    }
    if (setupWindow !== null && !setupWindow.isDestroyed()) {
      setupWindow.show();
      setupWindow.focus();
      return;
    }
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      clearTimeout(warmWindowTimer);
      mainWindow.show();
      mainWindow.focus();
      return;
    }
    if (appOpener.busy()) return;
    if (currentTargetUrl === null) showSetupWindow(setupError);
    else
      void appOpener.open(currentTargetUrl).then((opened) => {
        if (opened) commitPendingAppSwitch();
      });
  });

  if (target.kind === "setup") {
    showSetupWindow();
  } else if (target.source === "pc-env") {
    const reachability = await probeServer(
      target.url,
      undefined,
      serverHeadersFor(target.url, currentSetup),
    );
    if (reachability.ok && reachability.url) {
      markPreProbed(reachability.url);
      if (await appOpener.open(reachability.url)) {
        commitPendingAppSwitch();
        destroySetupWindow();
      }
    } else {
      showSetupWindow(reachability.error ?? t("Could not reach that address."));
    }
  } else if (target.source === "saved") {
    if (currentSetup?.mode === "new") {
      const managedUrl = managedLocalOpenUrl(target.url, localStack.webUrl());
      const managedStackReady =
        managedUrl !== null ? await localStack.matchesDesiredStack() : false;
      if (managedStackReady && managedUrl !== null) {
        if (await appOpener.open(managedUrl)) {
          commitPendingAppSwitch();
          destroySetupWindow();
        }
      } else {
        // Missing, stale, foreign, or owned by another process: reconcile the
        // app-managed stack before any API or computer traffic is allowed.
        void localStack.start();
        showSetupWindow();
      }
    } else {
      const reachability = await probeServer(target.url, undefined, currentSetup?.headers);
      if (reachability.ok) {
        markPreProbed(target.url);
        if (await appOpener.open(target.url)) {
          commitPendingAppSwitch();
          destroySetupWindow();
        }
      } else {
        showSetupWindow(
          t("Could not reconnect to the saved server. {detail}", {
            detail: reachability.error ?? "",
          }),
        );
      }
    }
  } else {
    if (await appOpener.open(target.url)) {
      commitPendingAppSwitch();
      destroySetupWindow();
    }
  }
}

app.on("window-all-closed", () => {
  // A hidden session probe (defaultSessionHasOriginData) can be the only window
  // during startup; its teardown must not quit the app.
  if (liveProbeWindows > 0) return;
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  quitting = true;
  clearTimeout(warmWindowTimer);
  const currentStandalone = activeStandalone;
  const pendingStandalone = pendingPreviousStandalone;
  activeStandalone = null;
  pendingPreviousStandalone = null;
  void stopStandaloneContext(currentStandalone);
  if (pendingStandalone?.kind === "live") {
    void stopStandaloneContext(pendingStandalone.context);
  }
  // Containers keep running; only an in-flight pull/up is cut short.
  hostComputer?.activate(false);
  void hostComputer?.close();
  userDevices?.close();
  void hostScreen?.close();
  localStack?.abort();
});
