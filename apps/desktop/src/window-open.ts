const OAUTH_POPUP_NAMES = new Set([
  "rakazo-app-connect",
  "rakazo-mcp-oauth",
  "rakazo-sso-oauth",
  "rakazo-model-oauth",
  "rakazo-plugin-connect",
]);

const BLANK_OAUTH_POPUP_NAMES = new Set([
  "rakazo-app-connect",
  "rakazo-mcp-oauth",
  "rakazo-plugin-connect",
  "rakazo-sso-oauth",
]);

export function shouldOpenInAppPopup(
  appOrigin: string | null,
  childUrl: string,
  frameName: string,
) {
  let target: URL;
  try {
    target = new URL(childUrl);
  } catch {
    return false;
  }

  if (childUrl === "about:blank" && BLANK_OAUTH_POPUP_NAMES.has(frameName)) return true;

  const isHttp = target.protocol === "http:" || target.protocol === "https:";
  if (appOrigin !== null && target.origin === appOrigin) return isHttp;
  return target.protocol === "https:" && OAUTH_POPUP_NAMES.has(frameName);
}

/** Keep auth cookies in the parent app's server-specific session. */
export function oauthPopupSessionPreferences(partition: string | null) {
  return {
    preload: "",
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    ...(partition === null ? {} : { partition }),
  };
}
