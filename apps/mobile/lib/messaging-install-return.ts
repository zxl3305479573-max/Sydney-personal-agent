import {
  captureApiRequestContext,
  captureServerSessionScope,
  isServerSessionScopeCurrent,
  rpc,
  subscribeApiBase,
} from "./api";
import { t } from "./i18n";
import { subscribeSessionGeneration } from "./session";

export const MESSAGING_INSTALL_CALLBACK_URL = "rakazo://messaging/slack/callback";
const INSTALL_TIMEOUT_MS = 10 * 60_000;
let inFlight = false;

export function parseMessagingInstallCallback(
  input: string,
  expectedState: string,
): { state: string; code: string } | null {
  if (input.length > 16_384 || !/^[A-Za-z0-9_-]{43}$/.test(expectedState)) return null;
  try {
    const link = new URL(input);
    if (
      !input.startsWith(`${MESSAGING_INSTALL_CALLBACK_URL}?`) ||
      /%(?![0-9a-f]{2})/i.test(link.search) ||
      link.protocol !== "rakazo:" ||
      link.host !== "messaging" ||
      link.pathname !== "/slack/callback" ||
      link.username ||
      link.password ||
      link.hash ||
      link.searchParams.getAll("state").length !== 1 ||
      link.searchParams.getAll("code").length !== 1 ||
      [...link.searchParams.keys()].some((key) => key !== "state" && key !== "code")
    )
      return null;
    const state = link.searchParams.get("state");
    const code = link.searchParams.get("code");
    return state === expectedState && code && /^[\x21-\x7e]{1,4096}$/.test(code)
      ? { state, code }
      : null;
  } catch {
    return null;
  }
}

export async function installSlackWorkspace(
  signal?: AbortSignal,
): Promise<"installed" | "cancelled"> {
  if (inFlight) throw new Error(t("Could not continue"));
  inFlight = true;
  const controller = new AbortController();
  const expiresAt = Date.now() + INSTALL_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), INSTALL_TIMEOUT_MS);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  let unsubscribeServer: (() => void) | undefined;
  let unsubscribeSession: (() => void) | undefined;
  let dismissBrowser: (() => void) | undefined;
  try {
    const scope = captureServerSessionScope();
    const requireCurrent = () => {
      if (
        signal?.aborted ||
        controller.signal.aborted ||
        Date.now() >= expiresAt ||
        !isServerSessionScopeCurrent(scope)
      )
        throw new Error(t("Could not continue"));
    };
    const cancelIfChanged = () => {
      if (!isServerSessionScopeCurrent(scope)) controller.abort();
    };
    unsubscribeServer = subscribeApiBase(cancelIfChanged);
    unsubscribeSession = subscribeSessionGeneration(cancelIfChanged);
    requireCurrent();
    const context = await captureApiRequestContext();
    requireCurrent();
    if (
      !context.headers.authorization ||
      context.apiBase !== scope.apiBase ||
      context.endpointGeneration !== scope.endpointGeneration ||
      context.sessionGeneration !== scope.sessionGeneration
    )
      throw new Error(t("Could not continue"));
    const options = { requestContext: context, signal: controller.signal };
    const previous = await rpc("me", {}, options);
    requireCurrent();
    if (!previous.userId) throw new Error(t("Could not continue"));
    const browser = await import("expo-web-browser").catch(() => {
      throw new Error(t("Could not continue"));
    });
    requireCurrent();
    const started = await rpc("messaging/installations/start", { returnTo: "mobile" }, options);
    requireCurrent();
    const authorization = new URL(started.url);
    const state = authorization.searchParams.get("state") ?? "";
    if (
      started.returnTo !== "mobile" ||
      authorization.origin !== "https://slack.com" ||
      authorization.pathname !== "/oauth/v2/authorize" ||
      authorization.username ||
      authorization.password ||
      authorization.hash ||
      authorization.searchParams.getAll("state").length !== 1 ||
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      authorization.searchParams.getAll("redirect_uri").length !== 1 ||
      authorization.searchParams.get("redirect_uri") !==
        `${scope.apiBase}/api/v1/messaging/install/slack/callback`
    )
      throw new Error(t("Could not continue"));
    dismissBrowser = () => {
      try {
        browser.dismissAuthSession();
      } catch {}
    };
    controller.signal.addEventListener("abort", dismissBrowser, { once: true });
    const result = await waitForBrowser(
      browser.openAuthSessionAsync(started.url, MESSAGING_INSTALL_CALLBACK_URL, {
        preferEphemeralSession: true,
      }),
      controller.signal,
    );
    controller.signal.removeEventListener("abort", dismissBrowser);
    requireCurrent();
    if (result.type === "cancel" || result.type === "dismiss") return "cancelled";
    if (result.type !== "success") throw new Error(t("Could not continue"));
    const callback = parseMessagingInstallCallback(result.url, state);
    if (!callback) throw new Error(t("Could not continue"));
    const current = await rpc("me", {}, options);
    requireCurrent();
    if (current.userId !== previous.userId) throw new Error(t("Could not continue"));
    await rpc("messaging/installations/complete", callback, options);
    requireCurrent();
    return "installed";
  } catch {
    throw new Error(t("Could not continue"));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    if (dismissBrowser) controller.signal.removeEventListener("abort", dismissBrowser);
    unsubscribeServer?.();
    unsubscribeSession?.();
    inFlight = false;
  }
}

function waitForBrowser<Result>(pending: Promise<Result>, signal: AbortSignal): Promise<Result> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error(t("Could not continue")));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    void pending.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      () => {
        signal.removeEventListener("abort", abort);
        reject(new Error(t("Could not continue")));
      },
    );
  });
}
