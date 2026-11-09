import type { ConfigContext, ExpoConfig } from "expo/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import appConfig from "../app.config";

beforeEach(() => {
  vi.stubEnv("EAS_BUILD_PROFILE", "production");
  vi.stubEnv("EXPO_PUBLIC_API_URL", "https://app.example.com");
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
