import type { ConfigContext, ExpoConfig } from "expo/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import appConfig from "../app.config";

beforeEach(() => {
  vi.stubEnv("EAS_BUILD_PROFILE", "production");
  vi.stubEnv("EXPO_PUBLIC_API_URL", "https://app.example.com");
  vi.stubEnv("EXPO_PUBLIC_SYDNEY_SIDELOAD", "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const config: ExpoConfig = {
  name: "Example",
  slug: "example",
  android: { package: "com.example.app", permissions: ["POST_NOTIFICATIONS"] },
  ios: { bundleIdentifier: "com.example.app" },
  extra: { example: true },
};

function context(config: ExpoConfig): ConfigContext {
  return { config, projectRoot: "/project", staticConfigPath: null, packageJsonPath: null };
}

const passkeys = {
  ios: { ...config.ios, associatedDomains: ["webcredentials:app.example.com"] },
  extra: { ...config.extra, passkeyRpIds: ["app.example.com"] },
};

describe("mobile app config", () => {
  it("only enables the companion widget for an isolated sideload without OTA", () => {
    vi.stubEnv("SYDNEY_COMPANION_EXPERIMENT", "1");
    expect(() => appConfig(context(config))).toThrow("isolated sideload");
    vi.stubEnv("SYDNEY_SIDELOAD_IOS", "1");
    vi.stubEnv("SYDNEY_IOS_BUNDLE_ID", "xin.zxlup.sydney");
    vi.stubEnv("EXPO_PUBLIC_API_URL", "https://pc.zxlup.xin");
    expect(() => appConfig(context(config))).toThrow("separate bundle ID");
    vi.stubEnv("SYDNEY_IOS_BUNDLE_ID", "xin.example.companion");
    expect(appConfig(context(config)).plugins).toContain("./plugins/with-companion-widget");
    vi.stubEnv("SYDNEY_OTA_PROJECT_ID", "7e638919-de89-4bea-a7a3-3a2d6902640e");
    expect(() => appConfig(context(config))).toThrow("separate bundle ID");
  });

  it.each([
    undefined,
    "not a url",
    "http://app.example.com",
    "https://localhost:3100",
    "https://localhost.:3100",
    "https://api.localhost:3100",
    "https://127.0.0.1:3100",
    "https://[::1]:3100",
    "https://[::ffff:127.0.0.1]:3100",
  ])("rejects a preview build with an invalid API URL: %s", (url) => {
    vi.stubEnv("EAS_BUILD_PROFILE", "preview");
    vi.stubEnv("EXPO_PUBLIC_API_URL", url);

    expect(() => appConfig(context(config))).toThrow("EXPO_PUBLIC_API_URL");
  });

  it("accepts a preview build with an HTTPS API URL", () => {
    vi.stubEnv("EAS_BUILD_PROFILE", "preview");

    expect(appConfig(context(config))).toEqual({ ...config, ...passkeys });
  });

  it("isolates sideload builds from upstream identity and native capabilities", () => {
    vi.stubEnv("SYDNEY_SIDELOAD_IOS", "1");
    vi.stubEnv("SYDNEY_IOS_BUNDLE_ID", "xin.example.sydney");
    const upstream = {
      ...config,
      owner: "upstream",
      ios: { ...config.ios, associatedDomains: ["webcredentials:upstream.example"] },
      extra: { example: true, eas: { projectId: "upstream" }, passkeyRpIds: ["upstream.example"] },
      updates: { url: "https://u.expo.dev/upstream" },
      plugins: [
        "expo-router",
        "./plugins/with-app-intents",
        ["expo-notifications", {}],
      ] as ExpoConfig["plugins"],
    };

    expect(appConfig(context(upstream))).toMatchObject({
      slug: "sydney-sideload",
      ios: { bundleIdentifier: "xin.example.sydney" },
      extra: { example: true, sydneySideload: true },
      updates: { enabled: false },
      plugins: ["expo-router"],
    });
    const result = appConfig(context(upstream));
    expect(result.owner).toBeUndefined();
    expect(result.ios?.associatedDomains).toBeUndefined();
    expect(result.extra?.eas).toBeUndefined();
    expect(result.extra?.passkeyRpIds).toBeUndefined();
  });

  it("requires an explicit valid sideload identity and server", () => {
    vi.stubEnv("SYDNEY_SIDELOAD_IOS", "1");
    vi.stubEnv("SYDNEY_IOS_BUNDLE_ID", "invalid");
    expect(() => appConfig(context(config))).toThrow("SYDNEY_IOS_BUNDLE_ID");
    vi.stubEnv("SYDNEY_IOS_BUNDLE_ID", "xin.example.sydney");
    vi.stubEnv("EXPO_PUBLIC_API_URL", "https://localhost");
    expect(() => appConfig(context(config))).toThrow("EXPO_PUBLIC_API_URL");
  });

  it("requires the sideload runtime safety flag", () => {
    vi.stubEnv("SYDNEY_SIDELOAD_IOS", "1");
    vi.stubEnv("EXPO_PUBLIC_SYDNEY_SIDELOAD", undefined);
    expect(() => appConfig(context(config))).toThrow("EXPO_PUBLIC_SYDNEY_SIDELOAD");
  });

  it("allows the production IP with the production identity but isolates other servers", () => {
    vi.stubEnv("SYDNEY_SIDELOAD_IOS", "1");
    vi.stubEnv("SYDNEY_IOS_BUNDLE_ID", "XIN.ZXLUP.SYDNEY");
    vi.stubEnv("EXPO_PUBLIC_API_URL", "https://124.221.182.39");
    expect(appConfig(context(config)).ios?.bundleIdentifier).toBe("XIN.ZXLUP.SYDNEY");
    vi.stubEnv("EXPO_PUBLIC_API_URL", "https://203.0.113.10");
    expect(() => appConfig(context(config))).toThrow("separate iOS bundle identifier");
    vi.stubEnv("SYDNEY_IOS_BUNDLE_ID", "xin.zxlup.sydney.staging");
    expect(appConfig(context(config)).ios?.bundleIdentifier).toBe("xin.zxlup.sydney.staging");
  });

  it("keeps the existing sideload identity available for the current server", () => {
    vi.stubEnv("SYDNEY_SIDELOAD_IOS", "1");
    vi.stubEnv("SYDNEY_IOS_BUNDLE_ID", "xin.zxlup.sydney");
    vi.stubEnv("EXPO_PUBLIC_API_URL", "https://pc.zxlup.xin");
    expect(appConfig(context(config)).ios?.bundleIdentifier).toBe("xin.zxlup.sydney");
  });

  it("enables sideload updates only for an explicitly configured Sydney project", () => {
    vi.stubEnv("SYDNEY_SIDELOAD_IOS", "1");
    vi.stubEnv("SYDNEY_IOS_BUNDLE_ID", "xin.example.sydney");
    vi.stubEnv("EXPO_PUBLIC_API_URL", "https://pc.zxlup.xin");
    vi.stubEnv("SYDNEY_OTA_PROJECT_ID", "12345678-1234-4234-8234-123456789abc");
    vi.stubEnv("SYDNEY_OTA_OWNER", "sydney");
    vi.stubEnv("SYDNEY_OTA_RUNTIME_VERSION", "sydney-ios-1");
    expect(
      appConfig(context({ ...config, extra: { eas: { projectId: "upstream" } } })),
    ).toMatchObject({
      owner: "sydney",
      runtimeVersion: "sydney-ios-1",
      extra: { eas: { projectId: "12345678-1234-4234-8234-123456789abc" } },
      updates: {
        url: "https://u.expo.dev/12345678-1234-4234-8234-123456789abc",
        requestHeaders: { "expo-channel-name": "sideload" },
      },
    });
  });

  it.each(["https://203.0.113.10", "https://other.example.com"])(
    "rejects sideload updates for %s while allowing builds with updates disabled",
    (apiUrl) => {
      vi.stubEnv("SYDNEY_SIDELOAD_IOS", "1");
      vi.stubEnv("SYDNEY_IOS_BUNDLE_ID", "xin.example.sydney");
      vi.stubEnv("EXPO_PUBLIC_API_URL", apiUrl);
      expect(appConfig(context(config)).updates).toEqual({ enabled: false });

      vi.stubEnv("SYDNEY_OTA_PROJECT_ID", "12345678-1234-4234-8234-123456789abc");
      vi.stubEnv("SYDNEY_OTA_OWNER", "sydney");
      vi.stubEnv("SYDNEY_OTA_RUNTIME_VERSION", "sydney-ios-1");
      expect(() => appConfig(context(config))).toThrow("Sydney OTA is restricted");
    },
  );

  it("rejects incomplete or upstream sideload update configuration", () => {
    vi.stubEnv("SYDNEY_SIDELOAD_IOS", "1");
    vi.stubEnv("SYDNEY_IOS_BUNDLE_ID", "xin.example.sydney");
    vi.stubEnv("SYDNEY_OTA_PROJECT_ID", "12345678-1234-4234-8234-123456789abc");
    expect(() => appConfig(context(config))).toThrow("Sydney OTA");
    vi.stubEnv("SYDNEY_OTA_OWNER", "sydney");
    vi.stubEnv("SYDNEY_OTA_RUNTIME_VERSION", "sydney-ios-1");
    expect(() =>
      appConfig(
        context({
          ...config,
          extra: { eas: { projectId: "12345678-1234-4234-8234-123456789abc" } },
        }),
      ),
    ).toThrow("Sydney OTA");
  });

  it.each([
    "https://app.example.com/api",
    "https://user:pass@app.example.com",
    "https://app.example.com/?q=x",
  ])("rejects sideload server URLs with unsupported parts: %s", (url) => {
    vi.stubEnv("SYDNEY_SIDELOAD_IOS", "1");
    vi.stubEnv("SYDNEY_IOS_BUNDLE_ID", "xin.example.sydney");
    vi.stubEnv("EXPO_PUBLIC_API_URL", url);
    expect(() => appConfig(context(config))).toThrow("EXPO_PUBLIC_API_URL");
  });

  it("loads the Firebase file path while preserving the existing config", () => {
    vi.stubEnv("GOOGLE_SERVICES_JSON", "/build/google-services.json");

    expect(appConfig(context(config))).toEqual({
      ...config,
      ...passkeys,
      android: { ...config.android, googleServicesFile: "/build/google-services.json" },
    });
    expect(config.android).not.toHaveProperty("googleServicesFile");
  });

  it("leaves the config unchanged when no variable applies", () => {
    vi.stubEnv("EAS_BUILD_PROFILE", "development");
    vi.stubEnv("EXPO_PUBLIC_API_URL", undefined);
    vi.stubEnv("GOOGLE_SERVICES_JSON", undefined);
    const existing = {
      ...config,
      android: { ...config.android, googleServicesFile: "./custom-google-services.json" },
    };

    expect(appConfig(context(existing))).toBe(existing);
    expect(appConfig(context(config))).toBe(config);
  });

  it("adds Android config when none exists", () => {
    vi.stubEnv("GOOGLE_SERVICES_JSON", "/build/google-services.json");
    const { android: _android, ...withoutAndroid } = config;

    expect(appConfig(context(withoutAndroid))).toEqual({
      ...withoutAndroid,
      ...passkeys,
      android: { googleServicesFile: "/build/google-services.json" },
    });
  });

  it("associates the default server's domain for passkeys and keeps other domains", () => {
    vi.stubEnv("EXPO_PUBLIC_API_URL", "https://App.Example.com:8443/api");
    const existing = { ...config, ios: { ...config.ios, associatedDomains: ["applinks:x.test"] } };

    expect(appConfig(context(existing))).toEqual({
      ...config,
      ios: {
        ...config.ios,
        associatedDomains: ["applinks:x.test", "webcredentials:app.example.com"],
      },
      extra: { ...config.extra, passkeyRpIds: ["app.example.com"] },
    });
  });

  it("asks a development build to fetch the association itself in developer mode", () => {
    vi.stubEnv("EAS_BUILD_PROFILE", "development");
    vi.stubEnv("RAKAZO_PASSKEY_DEVELOPER_MODE", "1");

    expect(appConfig(context(config))).toEqual({
      ...config,
      ios: { ...config.ios, associatedDomains: ["webcredentials:app.example.com?mode=developer"] },
      extra: { ...config.extra, passkeyRpIds: ["app.example.com"] },
    });
  });

  it.each([
    "http://app.example.com",
    "https://localhost:3100",
    "https://192.168.1.20",
    "https://[::1]",
    "not a url",
  ])("skips passkey domains for %s", (url) => {
    vi.stubEnv("EAS_BUILD_PROFILE", "development");
    vi.stubEnv("EXPO_PUBLIC_API_URL", url);
    vi.stubEnv("GOOGLE_SERVICES_JSON", undefined);

    expect(appConfig(context(config))).toBe(config);
  });
});
