import type { RakazoDesktopOAuthCallback } from "@rakazo/contracts";

export type OAuthCallbackFromOptions = {
  /** SSO callbacks must reach the API, including a loopback API on a separate port. */
  frameName?: string;
  /** App renderer origins — their `/callback` routes must not be treated as paste-flow codes. */
  excludeOrigins?: readonly string[];
  serverOrigin?: string | null;
};

export const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Loopback-redirect providers (e.g. `http://localhost:53692/callback`) put the
 * code in a URL the address-bar-less sign-in popup cannot show, so the main
 * process reads it from the navigation instead.
 */
export function oauthCallbackFrom(
  url: string,
  options: OAuthCallbackFromOptions = {},
): RakazoDesktopOAuthCallback | undefined {
  if (options.frameName === "rakazo-sso-oauth") return undefined;
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return undefined;
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") return undefined;
  const nativePath =
    options.frameName === "rakazo-slack-install"
      ? "/api/v1/messaging/install/slack/callback"
      : options.frameName === "rakazo-mcp-oauth"
        ? "/api/mcp/oauth/callback"
        : null;
  if (nativePath && options.serverOrigin) {
    if (
      target.origin !== options.serverOrigin ||
      target.pathname !== nativePath ||
      target.username ||
      target.password ||
      target.hash ||
      target.searchParams.has("error") ||
      target.searchParams.getAll("code").length !== 1 ||
      target.searchParams.getAll("state").length !== 1
    )
      return undefined;
    const code = target.searchParams.get("code");
    const state = target.searchParams.get("state");
    return code && state && code.length <= 4096 && !/\p{Cc}/u.test(code)
      ? { code, state }
      : undefined;
  }
  if (!LOOPBACK_HOSTS.has(target.hostname)) return undefined;
  if (options.excludeOrigins?.includes(target.origin)) return undefined;
  const code = target.searchParams.get("code")?.trim();
  if (!code) return undefined;
  const state = target.searchParams.get("state")?.trim();
  return state ? { code, state } : { code };
}
