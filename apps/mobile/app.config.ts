import type { ConfigContext, ExpoConfig } from "expo/config";

const RELEASE_PROFILES = new Set(["preview", "production", "android-apk", "diagnostic"]);

export default ({ config }: ConfigContext): ExpoConfig => {
  const sideload = process.env.SYDNEY_SIDELOAD_IOS === "1";
  if (sideload && process.env.EXPO_PUBLIC_SYDNEY_SIDELOAD !== "1") {
    throw new Error("EXPO_PUBLIC_SYDNEY_SIDELOAD must be set for Sydney sideload builds.");
  }
  if (sideload || RELEASE_PROFILES.has(process.env.EAS_BUILD_PROFILE ?? "")) {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    if (!apiUrl) {
      throw new Error(
        "EXPO_PUBLIC_API_URL must be set in the EAS build environment before building a release.",
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(apiUrl);
    } catch {
      throw new Error("EXPO_PUBLIC_API_URL must be a valid URL.");
    }
    if (parsed.protocol !== "https:") {
      throw new Error("EXPO_PUBLIC_API_URL must use HTTPS for release builds.");
    }
    if (
      sideload &&
      (parsed.username ||
        parsed.password ||
        parsed.pathname !== "/" ||
        parsed.search ||
        parsed.hash)
    ) {
      throw new Error("EXPO_PUBLIC_API_URL must be an HTTPS origin without credentials or a path.");
    }
    const hostname = parsed.hostname.replace(/\.$/, "");
    if (
      (sideload || process.env.EAS_BUILD_PROFILE === "preview") &&
      (hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname === "[::1]" ||
        /^127\./.test(hostname) ||
        /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(hostname))
    ) {
      throw new Error("EXPO_PUBLIC_API_URL must not point to the device itself.");
    }
  }

  let result = config as ExpoConfig;
  const companionExperiment = process.env.SYDNEY_COMPANION_EXPERIMENT === "1";
  if (companionExperiment && !sideload) {
    throw new Error("The companion experiment requires an isolated sideload build.");
  }
  if (result.autolinking?.nativeModulesDir) {
    const existingExclusions = result.autolinking.exclude ?? [];
    const exclude = (
      companionExperiment
        ? existingExclusions.filter((name) => name !== "sydney-companion")
        : [...new Set([...existingExclusions, "sydney-companion"])]
    );
    result = {
      ...result,
      autolinking: { ...result.autolinking, exclude },
    };
  }
  if (sideload) {
    const bundleIdentifier = process.env.SYDNEY_IOS_BUNDLE_ID;
    if (!bundleIdentifier || !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(bundleIdentifier)) {
      throw new Error("SYDNEY_IOS_BUNDLE_ID must be a valid iOS bundle identifier.");
    }
    if (
      new URL(process.env.EXPO_PUBLIC_API_URL!).origin !== "https://pc.zxlup.xin" &&
      new URL(process.env.EXPO_PUBLIC_API_URL!).origin !== "https://124.221.182.39" &&
      bundleIdentifier.toLowerCase() === "xin.zxlup.sydney"
    ) {
      throw new Error("A different server requires a separate iOS bundle identifier.");
    }
    const { eas: _eas, passkeyRpIds: _passkeyRpIds, ...extra } = result.extra ?? {};
    const { associatedDomains: _associatedDomains, ...ios } = result.ios ?? {};
    const updateProject = process.env.SYDNEY_OTA_PROJECT_ID;
    const updateOwner = process.env.SYDNEY_OTA_OWNER;
    const updateRuntime = process.env.SYDNEY_OTA_RUNTIME_VERSION;
    const updatesRequested = updateProject || updateOwner || updateRuntime;
    if (
      companionExperiment &&
      (bundleIdentifier.toLowerCase() === "xin.zxlup.sydney" || updatesRequested)
    ) {
      throw new Error("The companion experiment requires a separate bundle ID and no OTA updates.");
    }
    if (
      updatesRequested &&
      (!updateProject ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(updateProject) ||
        !updateOwner ||
        !/^[a-z0-9][a-z0-9._-]*$/i.test(updateOwner) ||
        !updateRuntime ||
        !/^[a-z0-9][a-z0-9._-]*$/i.test(updateRuntime) ||
        updateProject.toLowerCase() ===
          (result.extra?.eas as { projectId?: string } | undefined)?.projectId?.toLowerCase())
    ) {
      throw new Error("Sydney OTA requires its own valid project ID, owner and runtime version.");
    }
    if (updatesRequested && process.env.EXPO_PUBLIC_API_URL !== "https://pc.zxlup.xin") {
      throw new Error(
        "Sydney OTA is restricted to the existing server until update isolation is verified.",
      );
    }
    result = {
      ...result,
      owner: updatesRequested ? updateOwner : undefined,
      slug: "sydney-sideload",
      ios: { ...ios, bundleIdentifier },
      extra: {
        ...extra,
        sydneySideload: true,
        ...(updatesRequested ? { eas: { projectId: updateProject } } : {}),
      },
      ...(updatesRequested ? { runtimeVersion: updateRuntime } : {}),
      updates: updatesRequested
        ? {
            url: `https://u.expo.dev/${updateProject}`,
            requestHeaders: { "expo-channel-name": "sideload" },
          }
        : { enabled: false },
      plugins: result.plugins?.filter((plugin) => {
        const name = typeof plugin === "string" ? plugin : plugin[0];
        return name !== "./plugins/with-app-intents" && name !== "expo-notifications";
      }),
    };
    if (companionExperiment) {
      result.plugins = [...(result.plugins ?? []), "./plugins/with-companion-widget"];
    }
  }
  const rpId = sideload ? null : passkeyRpId(process.env.EXPO_PUBLIC_API_URL);
  if (rpId) {
    // Native passkeys only work for domains the binary is associated with, so the app reads the
    // same list at runtime to hide passkeys on other servers. Developer mode makes a
    // development-signed build fetch the association file itself, for a server on a private
    // network or VPN that Apple's CDN cannot reach.
    const mode = process.env.RAKAZO_PASSKEY_DEVELOPER_MODE === "1" ? "?mode=developer" : "";
    result = {
      ...result,
      ios: {
        ...result.ios,
        associatedDomains: [
          ...(result.ios?.associatedDomains ?? []),
          `webcredentials:${rpId}${mode}`,
        ],
      },
      extra: { ...result.extra, passkeyRpIds: [rpId] },
    };
  }

  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  if (googleServicesFile) {
    result = { ...result, android: { ...result.android, googleServicesFile } };
  }

  // Native crash handling autolinks; upload build hooks are optional and require credentials.
  if (process.env.SENTRY_AUTH_TOKEN) {
    result = {
      ...result,
      plugins: [
        ...(result.plugins ?? []),
        [
          "@sentry/react-native/expo",
          {
            organization: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            url: process.env.SENTRY_URL,
          },
        ],
      ],
    };
  }
  return result;
};

/** The default server's host when native passkeys can use it: HTTPS and a domain name. */
function passkeyRpId(apiUrl: string | undefined): string | null {
  let url: URL;
  try {
    url = new URL(apiUrl ?? "");
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !host.includes(".")) return null;
  if (host.startsWith("[") || /^\d+(\.\d+){3}$/.test(host)) return null;
  return host;
}
