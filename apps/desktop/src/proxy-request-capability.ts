import type {
  OnBeforeSendHeadersListenerDetails,
  Session,
  WebContents,
  WebFrameMain,
} from "electron";

/** Carries the proxy capability from the app's own window to its loopback proxy. */
export const PROXY_CAPABILITY_HEADER = "x-sydney-proxy-capability";
/** One-time main-process request nonce consumed and stripped in `onBeforeSendHeaders`. */
export const MAIN_PROCESS_NONCE_HEADER = "x-sydney-main-nonce";

const OPAQUE_SCREEN_ASSETS = new Set([
  "/wuying/screen.js",
  "/wuying/storage.js",
  "/wuying/WuyingWebSDK.js",
  "/wuying/sdk/ASP/container.html",
]);
const NOVNC_SESSION_PATH =
  /^\/novnc\/session\/(?:view|control)\/\d{1,16}\.[A-Za-z0-9_-]{1,8192}\/.+$/;
const SCREEN_WEBSOCKET_PATH =
  /^\/{1,2}novnc\/session\/(?:view|control)\/\d{1,16}\.[A-Za-z0-9_-]{1,8192}\/websockify$/;

export interface ProxyCapabilityOptions {
  proxyOrigin: () => string | undefined;
  token: () => string | undefined;
  /**
   * Narrower per-run capability accepted by the proxy only on anonymous screen
   * subresources and screen WebSocket upgrades. Defaults to `token()` when omitted.
   */
  screenToken?: () => string | undefined;
  appContentsId: () => number | undefined;
  /**
   * Validates and atomically consumes a one-time nonce issued by the main process
   * for `session.fetch` calls targeting the active loopback proxy.
   */
  consumeMainRequestNonce?: (nonce: string) => boolean;
}

/**
 * Adds the per-run loopback capability to requests the app window makes to its
 * own proxy origin, and to no other destination:
 * - The full app token is granted only to the app window's top-level frame (its
 *   initial/recovery/in-app GET/HEAD navigation, its subresources/fetch/XHR/workers,
 *   same-origin downloads/CSP reports, and its initial GET/HEAD navigation of
 *   explicit child shell/screen documents).
 * - Opaque sandboxed screen child frames (`/novnc/session/...`, `/wuying/...`)
 *   receive only the narrow `screenToken`, and only for anonymous screen assets
 *   and the noVNC `websockify` upgrade; `/html-viewer.html` receives no token
 *   for any subrequest or worker.
 * - Any value the page or another window set for the capability header is always
 *   removed or replaced, and disposed-frame exceptions fail closed without hanging
 *   the request.
 */
export function installProxyCapability(value: Session, options: ProxyCapabilityOptions) {
  value.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    let extractedNonce: string | undefined;
    let seenNonceHeader = false;
    let invalidNonceHeader = false;
    for (const name of Object.keys(requestHeaders)) {
      const lower = name.toLowerCase();
      if (lower === PROXY_CAPABILITY_HEADER) {
        delete requestHeaders[name];
      } else if (lower === MAIN_PROCESS_NONCE_HEADER) {
        const raw = requestHeaders[name];
        if (seenNonceHeader || typeof raw !== "string" || raw.length === 0 || raw.includes(",")) {
          invalidNonceHeader = true;
        } else {
          extractedNonce = raw;
        }
        seenNonceHeader = true;
        delete requestHeaders[name];
      }
    }

    try {
      const token = options.token();
      const canonicalOrigin = parseHttpOrigin(options.proxyOrigin());
      if (token && canonicalOrigin) {
        if (
          (details.webContentsId === undefined || details.webContentsId === -1) &&
          details.webContents === undefined &&
          (details.frame ?? null) === null
        ) {
          if (!invalidNonceHeader && extractedNonce && options.consumeMainRequestNonce) {
            const target = parseTargetForProxy(details.url, canonicalOrigin);
            if (
              target &&
              !target.isWebSocketUrl &&
              options.consumeMainRequestNonce(extractedNonce)
            ) {
              requestHeaders[PROXY_CAPABILITY_HEADER] = token;
              const method = (details.method ?? "GET").toUpperCase();
              if (
                method !== "GET" &&
                method !== "HEAD" &&
                !hasHeaderCaseInsensitive(requestHeaders, "origin")
              ) {
                requestHeaders.origin = canonicalOrigin;
              }
            }
          }
        } else {
          const appContentsId = options.appContentsId();
          if (appContentsId !== undefined) {
            const scope = classifyRequestScope(details, canonicalOrigin, appContentsId);
            if (scope === "app") {
              requestHeaders[PROXY_CAPABILITY_HEADER] = token;
            } else if (scope === "screen") {
              requestHeaders[PROXY_CAPABILITY_HEADER] = options.screenToken?.() ?? token;
            }
          }
        }
      }
    } catch {
      // A frame or WebContents disposed mid-flight fails closed with the header stripped.
    }
    callback({ requestHeaders });
  });
}

function hasHeaderCaseInsensitive(headers: Record<string, unknown>, targetLower: string): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === targetLower);
}

function classifyRequestScope(
  details: OnBeforeSendHeadersListenerDetails,
  canonicalOrigin: string,
  appContentsId: number,
): "app" | "screen" | "none" {
  if (details.webContentsId !== appContentsId) return "none";
  if (!details.webContents || details.webContents.isDestroyed()) return "none";
  const target = parseTargetForProxy(details.url, canonicalOrigin);
  if (!target) return "none";

  const method = (details.method ?? "GET").toUpperCase();
  const resourceType = details.resourceType;
  const frame = details.frame && !details.frame.isDestroyed?.() ? details.frame : null;
  const initiator = details.initiatorOrigin;

  if (resourceType === "mainFrame") {
    if (target.isWebSocketUrl || (method !== "GET" && method !== "HEAD")) return "none";
    if (frame !== null && (frame.parent ?? null) !== null) return "none";
    if (initiator === undefined) return "app";
    if (
      initiator === canonicalOrigin &&
      mainFrameCommittedToOrigin(details.webContents, canonicalOrigin) &&
      (frame === null || frame.origin === canonicalOrigin)
    ) {
      return "app";
    }
    return "none";
  }

  if (!mainFrameCommittedToOrigin(details.webContents, canonicalOrigin)) return "none";

  if (resourceType === "subFrame") {
    if (target.isWebSocketUrl || (method !== "GET" && method !== "HEAD")) return "none";
    if (initiator === canonicalOrigin) {
      if (
        frame !== null &&
        ((frame.parent ?? null) === null ||
          (frame.top != null && frame.top.origin !== canonicalOrigin))
      ) {
        return "none";
      }
      return isAllowedChildDocumentPath(target.url.pathname) ? "app" : "none";
    }
    if (
      initiator === "null" &&
      target.url.pathname === "/wuying/sdk/ASP/container.html" &&
      target.url.search === "" &&
      frame !== null &&
      frame.parent != null &&
      (frame.top == null || frame.top.origin === canonicalOrigin) &&
      (isUncommittedBlankFrame(frame) || isWuyingDocumentUrl(frame.url, canonicalOrigin)) &&
      isWuyingDocumentUrl(frame.parent.url, canonicalOrigin)
    ) {
      return "screen";
    }
    return "none";
  }

  if (frame !== null) {
    if (
      (frame.parent ?? null) === null &&
      frame.origin === canonicalOrigin &&
      (initiator === undefined || initiator === canonicalOrigin)
    ) {
      return "app";
    }
    if (
      (frame.parent ?? null) !== null &&
      frame.origin === "null" &&
      (frame.top == null || frame.top.origin === canonicalOrigin) &&
      (initiator === undefined || initiator === "null") &&
      isScreenDocumentUrl(frame.url, canonicalOrigin)
    ) {
      if (target.isWebSocketUrl) {
        return (resourceType === "webSocket" || resourceType === undefined) &&
          method === "GET" &&
          SCREEN_WEBSOCKET_PATH.test(target.url.pathname)
          ? "screen"
          : "none";
      }
      return (method === "GET" || method === "HEAD") && isOpaqueScreenAssetUrl(target.url)
        ? "screen"
        : "none";
    }
    return "none";
  }

  if (
    initiator === canonicalOrigin &&
    !target.isWebSocketUrl &&
    (method === "GET" ||
      method === "HEAD" ||
      (resourceType === "cspReport" &&
        method === "POST" &&
        target.url.pathname === "/api/csp-report"))
  ) {
    return "app";
  }

  return "none";
}

function parseHttpOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  try {
    const parsed = new URL(origin);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function parseTargetForProxy(
  rawUrl: string,
  canonicalOrigin: string,
): { url: URL; isWebSocketUrl: boolean } | null {
  try {
    const url = new URL(rawUrl);
    if (url.username || url.password) return null;
    const isWebSocketUrl = url.protocol === "ws:" || url.protocol === "wss:";
    const normalized = new URL(rawUrl);
    if (normalized.protocol === "ws:") normalized.protocol = "http:";
    else if (normalized.protocol === "wss:") normalized.protocol = "https:";
    else if (normalized.protocol !== "http:" && normalized.protocol !== "https:") return null;
    return normalized.origin === canonicalOrigin ? { url, isWebSocketUrl } : null;
  } catch {
    return null;
  }
}

function isUncommittedBlankFrame(frame: Pick<WebFrameMain, "url">): boolean {
  return frame.url === "" || frame.url === "about:blank";
}

function mainFrameCommittedToOrigin(contents: WebContents, canonicalOrigin: string): boolean {
  const top = contents.mainFrame;
  return Boolean(top && !top.isDestroyed?.() && top.origin === canonicalOrigin);
}

function isAllowedChildDocumentPath(pathname: string): boolean {
  return (
    pathname === "/html-viewer.html" ||
    pathname === "/wuying" ||
    pathname === "/wuying/" ||
    pathname === "/wuying/screen.html" ||
    NOVNC_SESSION_PATH.test(pathname)
  );
}

function isOpaqueScreenAssetUrl(url: URL): boolean {
  return (
    (url.search === "" && OPAQUE_SCREEN_ASSETS.has(url.pathname)) ||
    NOVNC_SESSION_PATH.test(url.pathname)
  );
}

function isScreenDocumentUrl(rawUrl: string, canonicalOrigin: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.origin !== canonicalOrigin) return false;
    return NOVNC_SESSION_PATH.test(parsed.pathname) || isWuyingDocumentUrl(rawUrl, canonicalOrigin);
  } catch {
    return false;
  }
}

function isWuyingDocumentUrl(rawUrl: string, canonicalOrigin: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.origin === canonicalOrigin &&
      (parsed.pathname === "/wuying" || parsed.pathname.startsWith("/wuying/"))
    );
  } catch {
    return false;
  }
}
