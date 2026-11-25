import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const base = {
  DATABASE_URL: "postgres://rakazo:rakazo@127.0.0.1:5433/rakazo",
  NODE_ENV: "test",
};

describe("loadEnv", () => {
  it("validates the integration API callback opt-in", () => {
    expect(loadEnv(base).integrationApiCallbackEnabled).toBe(false);
    expect(
      loadEnv({ ...base, SYDNEY_INTEGRATION_API_CALLBACK: "true" }).integrationApiCallbackEnabled,
    ).toBe(true);
    expect(() => loadEnv({ ...base, SYDNEY_INTEGRATION_API_CALLBACK: "yes" })).toThrow(
      "SYDNEY_INTEGRATION_API_CALLBACK must be true or false",
    );
  });

  it("requires an explicit opt-in and secure origins for API email verification returns", () => {
    expect(loadEnv(base).nativeEmailVerificationOnApi).toBe(false);
    const enabled = { ...base, SYDNEY_NATIVE_EMAIL_VERIFICATION_ON_API: "true" };
    expect(loadEnv(enabled).nativeEmailVerificationOnApi).toBe(true);
    expect(() => loadEnv({ ...enabled, BETTER_AUTH_URL: "http://auth.example.test" })).toThrow(
      "HTTPS email verification links",
    );
    expect(() => loadEnv({ ...enabled, WEB_ORIGIN: "http://web.example.test" })).toThrow(
      "HTTPS email verification links",
    );
    expect(() => loadEnv({ ...base, SYDNEY_NATIVE_EMAIL_VERIFICATION_ON_API: "yes" })).toThrow(
      "must be true or false",
    );
    expect(
      loadEnv({
        ...enabled,
        BETTER_AUTH_URL: "http://auth.example.test",
        WEB_ORIGIN: "http://web.example.test",
        AUTH_PUBLIC_LINK_ORIGIN: "https://public.example.test",
        EXTRA_TRUSTED_ORIGINS: "https://public.example.test",
      }).nativeEmailVerificationOnApi,
    ).toBe(true);
  });
  it("keeps the legacy sign-in compatibility page off unless explicitly enabled", () => {
    expect(loadEnv(base).legacySignInReturnOnApi).toBe(false);
    expect(
      loadEnv({ ...base, SYDNEY_LEGACY_SIGN_IN_RETURN_ON_API: "true" }).legacySignInReturnOnApi,
    ).toBe(true);
    expect(() => loadEnv({ ...base, SYDNEY_LEGACY_SIGN_IN_RETURN_ON_API: "yes" })).toThrow(
      "must be true or false",
    );
  });
  it("rejects public HTTP reset emails and accepts a trusted public HTTPS mapping", () => {
    const enabled = { ...base, SYDNEY_NATIVE_PASSWORD_RESET_ON_API: "true" };
    expect(loadEnv(enabled).nativePasswordResetOnApi).toBe(true);
    expect(() => loadEnv({ ...enabled, BETTER_AUTH_URL: "http://internal.example" })).toThrow(
      "HTTPS password-reset email links",
    );
    expect(
      loadEnv({
        ...enabled,
        BETTER_AUTH_URL: "http://internal.example",
        AUTH_PUBLIC_LINK_ORIGIN: "https://public.example",
        EXTRA_TRUSTED_ORIGINS: "https://public.example",
      }).nativePasswordResetOnApi,
    ).toBe(true);
  });
  it("requires explicit opt-in and an absolute directory for Wuying assets", () => {
    expect(loadEnv(base).wuyingAssetsOnApi).toBe(false);
    expect(loadEnv(base).nativePasswordResetOnApi).toBe(false);
    const assetsDir = resolve("wuying-assets");
    expect(
      loadEnv({
        ...base,
        SYDNEY_WUYING_ASSETS_ON_API: "true",
        SYDNEY_WUYING_ASSETS_DIR: assetsDir,
      }),
    ).toMatchObject({ wuyingAssetsOnApi: true, wuyingAssetsDir: assetsDir });
    expect(() => loadEnv({ ...base, SYDNEY_WUYING_ASSETS_ON_API: "yes" })).toThrow(
      "SYDNEY_WUYING_ASSETS_ON_API must be true or false",
    );
    for (const dir of [undefined, "relative"]) {
      expect(() =>
        loadEnv({
          ...base,
          SYDNEY_WUYING_ASSETS_ON_API: "true",
          SYDNEY_WUYING_ASSETS_DIR: dir,
        }),
      ).toThrow("absolute SYDNEY_WUYING_ASSETS_DIR");
    }
  });
  it("enables the API screen proxy only by explicit configuration", () => {
    expect(loadEnv(base).screenProxyOnApi).toBe(false);
    expect(loadEnv({ ...base, SYDNEY_SCREEN_PROXY_ON_API: "true" }).screenProxyOnApi).toBe(true);
    expect(() => loadEnv({ ...base, SYDNEY_SCREEN_PROXY_ON_API: "yes" })).toThrow(
      "SYDNEY_SCREEN_PROXY_ON_API must be true or false",
    );
    for (const API_PORT of ["0", "-1", "65536", "abc"]) {
      expect(() => loadEnv({ ...base, SYDNEY_SCREEN_PROXY_ON_API: "true", API_PORT })).toThrow(
        "SYDNEY_SCREEN_PROXY_ON_API requires a fixed API_PORT",
      );
    }
    expect(loadEnv({ ...base, SYDNEY_SCREEN_PROXY_ON_API: "true", API_PORT: "3101" }).port).toBe(
      3101,
    );
  });
  it("keeps the API integration callback opt-in", () => {
    expect(loadEnv(base).integrationApiCallbackEnabled).toBe(false);
    expect(
      loadEnv({ ...base, SYDNEY_INTEGRATION_API_CALLBACK: "true" }).integrationApiCallbackEnabled,
    ).toBe(true);
  });
  it("accepts only a canonical HTTPS origin for the optional MCP native callback", () => {
    expect(loadEnv(base).mcpNativeCallbackOrigin).toBeUndefined();
    expect(
      loadEnv({ ...base, SYDNEY_MCP_NATIVE_CALLBACK_ORIGIN: "https://api.example.test" })
        .mcpNativeCallbackOrigin,
    ).toBe("https://api.example.test");
    for (const value of [
      "http://api.example.test",
      "https://api.example.test/",
      "https://user:pass@api.example.test",
      "https://api.example.test/path",
      "https://*.example.test",
    ]) {
      expect(() => loadEnv({ ...base, SYDNEY_MCP_NATIVE_CALLBACK_ORIGIN: value })).toThrow(
        "SYDNEY_MCP_NATIVE_CALLBACK_ORIGIN must be a canonical HTTPS origin",
      );
    }
  });
  it("enables project conversation creation only when explicitly configured", () => {
    expect(loadEnv(base).projectConversationCreateExperiment).toBe(false);
    expect(
      loadEnv({ ...base, SYDNEY_PROJECT_CONVERSATION_CREATE_EXPERIMENT: "true" })
        .projectConversationCreateExperiment,
    ).toBe(true);
    expect(
      loadEnv({
        ...base,
        NODE_ENV: "development",
        SYDNEY_PROJECT_CONVERSATION_CREATE_EXPERIMENT: "true",
      }).projectConversationCreateExperiment,
    ).toBe(true);
    expect(
      loadEnv({
        ...base,
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "prod-auth-secret-with-enough-length",
        ENCRYPTION_KEY: "prod-encryption-key-with-enough-length",
        SCREEN_PROXY_SECRET: "prod-screen-proxy-secret-with-enough-length",
        SYDNEY_PROJECT_CONVERSATION_CREATE_EXPERIMENT: "true",
      }).projectConversationCreateExperiment,
    ).toBe(true);
    expect(
      loadEnv({
        ...base,
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "prod-auth-secret-with-enough-length",
        ENCRYPTION_KEY: "prod-encryption-key-with-enough-length",
        SCREEN_PROXY_SECRET: "prod-screen-proxy-secret-with-enough-length",
      }).projectConversationCreateExperiment,
    ).toBe(false);
  });
  it("allows project creation only when explicitly configured", () => {
    expect(loadEnv(base).projectWorkspaceCreateExperiment).toBe(false);
    expect(
      loadEnv({ ...base, SYDNEY_PROJECT_CREATE_EXPERIMENT: "true" })
        .projectWorkspaceCreateExperiment,
    ).toBe(true);
    expect(
      loadEnv({
        ...base,
        NODE_ENV: "development",
        SYDNEY_PROJECT_CREATE_EXPERIMENT: "true",
      }).projectWorkspaceCreateExperiment,
    ).toBe(true);
    expect(
      loadEnv({
        ...base,
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "prod-auth-secret-with-enough-length",
        ENCRYPTION_KEY: "prod-encryption-key-with-enough-length",
        SCREEN_PROXY_SECRET: "prod-screen-proxy-secret-with-enough-length",
        SYDNEY_PROJECT_CREATE_EXPERIMENT: "true",
      }).projectWorkspaceCreateExperiment,
    ).toBe(true);
    expect(
      loadEnv({
        ...base,
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "prod-auth-secret-with-enough-length",
        ENCRYPTION_KEY: "prod-encryption-key-with-enough-length",
        SCREEN_PROXY_SECRET: "prod-screen-proxy-secret-with-enough-length",
      }).projectWorkspaceCreateExperiment,
    ).toBe(false);
  });
  it("keeps project device tools off when only project chat is enabled", () => {
    const chatEnv = {
      ...base,
      SYDNEY_PROJECT_CREATE_EXPERIMENT: "true",
      SYDNEY_PROJECT_CONVERSATION_CREATE_EXPERIMENT: "true",
    };
    expect(loadEnv(chatEnv).projectDeviceToolsEnabled).toBe(false);
    expect(
      loadEnv({ ...chatEnv, SYDNEY_PROJECT_DEVICE_TOOLS_ENABLED: "true" })
        .projectDeviceToolsEnabled,
    ).toBe(true);
  });
  it("enables screen companion only when explicitly requested in test or development", () => {
    expect(loadEnv(base).companionScreenExperimental).toBe(false);
    expect(
      loadEnv({ ...base, SYDNEY_COMPANION_SCREEN_EXPERIMENT: "true" }).companionScreenExperimental,
    ).toBe(true);
    expect(
      loadEnv({
        ...base,
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "prod-auth-secret-with-enough-length",
        ENCRYPTION_KEY: "prod-encryption-key-with-enough-length",
        SCREEN_PROXY_SECRET: "prod-screen-proxy-secret-with-enough-length",
        SYDNEY_COMPANION_SCREEN_EXPERIMENT: "true",
      }).companionScreenExperimental,
    ).toBe(false);
  });
  it("allows only explicitly trusted canonical HTTPS auth email origins", () => {
    const configured = {
      ...base,
      WEB_ORIGIN: "https://old.example.test",
      EXTRA_TRUSTED_ORIGINS: "https://192.0.2.10",
    };
    expect(loadEnv(configured).authPublicLinkOrigin).toBeUndefined();
    expect(
      loadEnv({ ...configured, AUTH_PUBLIC_LINK_ORIGIN: "https://192.0.2.10" })
        .authPublicLinkOrigin,
    ).toBe("https://192.0.2.10");
    for (const origin of [
      "http://192.0.2.10",
      "https://192.0.2.10/",
      "https://192.0.2.10/path",
      "https://other.example.test",
      "https://user@192.0.2.10",
    ]) {
      expect(() => loadEnv({ ...configured, AUTH_PUBLIC_LINK_ORIGIN: origin })).toThrow(
        "AUTH_PUBLIC_LINK_ORIGIN",
      );
    }
  });
  it("defaults the attachment count to four and accepts configured bounds", () => {
    expect(loadEnv(base).maxAttachmentsPerMessage).toBe(4);
    expect(loadEnv({ ...base, MAX_ATTACHMENTS_PER_MESSAGE: " " }).maxAttachmentsPerMessage).toBe(4);
    for (const count of [1, 8, 100]) {
      expect(
        loadEnv({ ...base, MAX_ATTACHMENTS_PER_MESSAGE: ` ${count} ` }).maxAttachmentsPerMessage,
      ).toBe(count);
    }
  });
  it.each(["0", "1e2", "101"])("rejects invalid attachment count %s", (value) => {
    expect(() => loadEnv({ ...base, MAX_ATTACHMENTS_PER_MESSAGE: value })).toThrow(
      "MAX_ATTACHMENTS_PER_MESSAGE",
    );
  });

  it("keeps calls off unless explicitly enabled", () => {
    expect(loadEnv(base).phoneCallsEnabled).toBe(false);
    for (const value of ["false", "1", ""]) {
      expect(loadEnv({ ...base, PHONE_CALLS_ENABLED: value }).phoneCallsEnabled).toBe(false);
    }
    expect(loadEnv({ ...base, PHONE_CALLS_ENABLED: "true" }).phoneCallsEnabled).toBe(true);
  });
  it("parses the call ring window and falls back for invalid values", () => {
    expect(loadEnv(base).phoneCallRingSeconds).toBe(45);
    expect(loadEnv({ ...base, PHONE_CALL_RING_SECONDS: "90" }).phoneCallRingSeconds).toBe(90);
    for (const value of ["", "0", "-1", "invalid", "NaN", "Infinity"]) {
      expect(loadEnv({ ...base, PHONE_CALL_RING_SECONDS: value }).phoneCallRingSeconds).toBe(45);
    }
  });

  it("defaults uploads to 10 MiB and parses a configured limit", () => {
    expect(loadEnv(base).maxUploadSizeBytes).toBe(10 * 1024 * 1024);
    expect(loadEnv({ ...base, MAX_UPLOAD_SIZE_MB: "" }).maxUploadSizeBytes).toBe(10 * 1024 * 1024);
    expect(loadEnv({ ...base, MAX_UPLOAD_SIZE_MB: " 25 " }).maxUploadSizeBytes).toBe(
      25 * 1024 * 1024,
    );
  });

  it.each(["0", "1e3", "9007199254740991"])("rejects invalid upload limit %s", (value) => {
    expect(() => loadEnv({ ...base, MAX_UPLOAD_SIZE_MB: value })).toThrow("MAX_UPLOAD_SIZE_MB");
  });
  it("keeps the ticket board off unless explicitly enabled", () => {
    expect(loadEnv(base).ticketBoardEnabled).toBe(false);
    for (const value of ["false", "1", ""])
      expect(loadEnv({ ...base, TICKET_BOARD_ENABLED: value }).ticketBoardEnabled).toBe(false);
    expect(loadEnv({ ...base, TICKET_BOARD_ENABLED: "true" }).ticketBoardEnabled).toBe(true);
  });
  it("loads operator menu links and refuses to start on a bad value", () => {
    expect(loadEnv(base).navLinks).toEqual([]);
    expect(
      loadEnv({
        ...base,
        RAKAZO_NAV_LINKS: '[{"id":"clients","label":"Clients","path":"/ext/clients/"}]',
      }).navLinks,
    ).toEqual([{ id: "clients", label: "Clients", path: "/ext/clients/", trusted: false }]);
    expect(() =>
      loadEnv({ ...base, RAKAZO_NAV_LINKS: '[{"id":"x","label":"X","path":"/api/me"}]' }),
    ).toThrow("RAKAZO_NAV_LINKS");
  });
  it("keeps Crisp chat off unless a valid website ID is set", () => {
    expect(loadEnv(base).crispWebsiteId).toBeNull();
    expect(
      loadEnv({ ...base, CRISP_WEBSITE_ID: "c2c27ea6-4fdb-4350-a9fc-4b5b052dc5ec" }).crispWebsiteId,
    ).toBe("c2c27ea6-4fdb-4350-a9fc-4b5b052dc5ec");
    expect(() => loadEnv({ ...base, CRISP_WEBSITE_ID: "nope" })).toThrow("CRISP_WEBSITE_ID");
  });
  it("defaults the product path to Pi, Docker, and Graphile Worker", () => {
    const env = loadEnv(base);
    expect(env.agentRuntime).toBe("pi");
    expect(env.sandboxProvider).toBe("docker");
    expect(env.wakeupDriver).toBe("graphile");
    expect(env.apiHost).toBe("127.0.0.1");
    expect(env.nodeEnv).toBe("test");
  });

  it("defaults Pi JSONL session recording to off", () => {
    expect(loadEnv(base).piSessionRecording).toBe(false);
    expect(loadEnv({ ...base, PI_SESSION_RECORDING: "false" }).piSessionRecording).toBe(false);
    expect(loadEnv({ ...base, PI_SESSION_RECORDING: "1" }).piSessionRecording).toBe(false);
    expect(loadEnv({ ...base, PI_SESSION_RECORDING: "true" }).piSessionRecording).toBe(true);
  });

  it("keeps explicit emulator settings for pnpm test", () => {
    const env = loadEnv({
      ...base,
      AGENT_RUNTIME: "scripted",
      SANDBOX_PROVIDER: "fake",
      WAKEUP_DRIVER: "memory",
    });
    expect(env.agentRuntime).toBe("scripted");
    expect(env.sandboxProvider).toBe("fake");
    expect(env.wakeupDriver).toBe("memory");
  });

  it("loads an optional integrations catalog mirror", () => {
    expect(loadEnv(base).integrationsCatalogUrl).toBeUndefined();
    expect(
      loadEnv({ ...base, INTEGRATIONS_CATALOG_URL: " https://catalog.example.test/feed " })
        .integrationsCatalogUrl,
    ).toBe("https://catalog.example.test/feed");
  });

  it("falls back to none when a remote provider key is missing", () => {
    expect(
      loadEnv({
        ...base,
        SANDBOX_PROVIDER: "e2b",
      }).sandboxProvider,
    ).toBe("none");
    expect(
      loadEnv({
        ...base,
        SANDBOX_PROVIDER: "createos",
      }).sandboxProvider,
    ).toBe("none");
    expect(
      loadEnv({
        ...base,
        SANDBOX_PROVIDER: "none",
      }).sandboxProvider,
    ).toBe("none");
    expect(
      loadEnv({
        ...base,
        SANDBOX_PROVIDER: "",
      }).sandboxProvider,
    ).toBe("none");
  });

  it("loads provider-specific Daytona configuration", () => {
    const env = loadEnv({
      ...base,
      SANDBOX_PROVIDER: "daytona",
      DAYTONA_API_KEY: "test-daytona-key",
      DAYTONA_API_URL: "https://daytona.test/api",
      DAYTONA_TARGET: "test-target",
    });
    expect(env).toMatchObject({
      sandboxProvider: "daytona",
      daytonaApiKey: "test-daytona-key",
      daytonaApiUrl: "https://daytona.test/api",
      daytonaTarget: "test-target",
    });
  });

  it("loads Novita credentials and the shared sandbox template", () => {
    expect(
      loadEnv({
        ...base,
        SANDBOX_PROVIDER: "novita",
        NOVITA_API_KEY: "test-novita-key",
        SANDBOX_TEMPLATE: "custom-desktop",
      }),
    ).toMatchObject({
      sandboxProvider: "novita",
      novitaApiKey: "test-novita-key",
      sandboxTemplate: "custom-desktop",
    });
    expect(
      loadEnv({ ...base, SANDBOX_PROVIDER: "novita", E2B_API_KEY: "test-e2b-key" }).sandboxProvider,
    ).toBe("none");
  });

  it("loads provider-specific Boat configuration", () => {
    const env = loadEnv({
      ...base,
      SANDBOX_PROVIDER: "boat",
      BOAT_API_KEY: "test-boat-key",
      BOAT_API_URL: "https://boat.test/api/v1",
    });
    expect(env).toMatchObject({
      sandboxProvider: "boat",
      boatApiKey: "test-boat-key",
      boatApiUrl: "https://boat.test/api/v1",
    });
  });

  it("throws when production omits secrets", () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: base.DATABASE_URL,
        NODE_ENV: "production",
      }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("throws when production uses placeholder secrets", () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: base.DATABASE_URL,
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "dev-secret-change-me-please-32chars",
        ENCRYPTION_KEY: "real-encryption-key-value",
        SANDBOX_SUPERVISOR_TOKEN: "real-supervisor-token-with-enough-length",
        SCREEN_PROXY_SECRET: "real-screen-proxy-secret-with-enough-length",
      }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("loads real secrets in production", () => {
    const env = loadEnv({
      DATABASE_URL: base.DATABASE_URL,
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "prod-auth-secret-with-enough-length",
      ENCRYPTION_KEY: "prod-encryption-key-with-enough-length",
      SCREEN_PROXY_SECRET: "prod-screen-proxy-secret-with-enough-length",
      SANDBOX_PROVIDER: "e2b",
      API_HOST: "0.0.0.0",
    });
    expect(env.authSecret).toBe("prod-auth-secret-with-enough-length");
    expect(env.encryptionKey).toBe("prod-encryption-key-with-enough-length");
    expect(env.sandboxSupervisorToken).toBeUndefined();
    expect(env.screenProxySecret).toBe("prod-screen-proxy-secret-with-enough-length");
    expect(env.apiHost).toBe("0.0.0.0");
  });

  it("encrypts content on servers by default and fails startup on an invalid switch", () => {
    const production = {
      DATABASE_URL: base.DATABASE_URL,
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "prod-auth-secret-with-enough-length",
      ENCRYPTION_KEY: "prod-encryption-key-with-enough-length",
      SCREEN_PROXY_SECRET: "prod-screen-proxy-secret-with-enough-length",
      SANDBOX_PROVIDER: "e2b",
    };
    expect(loadEnv(production).contentEncryption).toBe(true);
    expect(loadEnv({ ...production, CONTENT_ENCRYPTION: "off" }).contentEncryption).toBe(false);
    expect(
      loadEnv({ DATABASE_URL: base.DATABASE_URL, NODE_ENV: "development" }).contentEncryption,
    ).toBe(false);
    expect(() => loadEnv({ ...production, CONTENT_ENCRYPTION: "maybe" })).toThrow(
      /CONTENT_ENCRYPTION must be "on" or "off"/,
    );
  });

  it("falls back to none in production when Docker has no supervisor token", () => {
    const env = loadEnv({
      DATABASE_URL: base.DATABASE_URL,
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "prod-auth-secret-with-enough-length",
      ENCRYPTION_KEY: "prod-encryption-key-with-enough-length",
      SCREEN_PROXY_SECRET: "prod-screen-proxy-secret-with-enough-length",
      SANDBOX_PROVIDER: "docker",
    });
    expect(env.sandboxProvider).toBe("none");
    expect(env.sandboxSupervisorToken).toBeUndefined();
  });

  it("requires a dedicated supervisor token when Docker stays selected", () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: base.DATABASE_URL,
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "prod-auth-secret-with-enough-length",
        ENCRYPTION_KEY: "prod-encryption-key-with-enough-length",
        SCREEN_PROXY_SECRET: "prod-screen-proxy-secret-with-enough-length",
        SANDBOX_PROVIDER: "docker",
        SANDBOX_SUPERVISOR_TOKEN: "too-short",
      }),
    ).toThrow(/SANDBOX_SUPERVISOR_TOKEN/);
  });

  it("exposes a deployed git revision when GIT_SHA is set", () => {
    expect(loadEnv(base).gitSha).toBeUndefined();
    expect(loadEnv({ ...base, GIT_SHA: "  3c6e209  " }).gitSha).toBe("3c6e209");
    expect(loadEnv({ ...base, RAKAZO_GIT_SHA: "abc1234" }).gitSha).toBe("abc1234");
  });

  it("loads per-client minimum builds and refuses a malformed one", () => {
    expect(loadEnv(base).minimumClientBuilds).toEqual({});
    expect(
      loadEnv({ ...base, RAKAZO_MIN_CLIENT_BUILD: "web=20261022093015" }).minimumClientBuilds,
    ).toEqual({ web: "20261022093015" });
    expect(() => loadEnv({ ...base, RAKAZO_MIN_CLIENT_BUILD: "latest" })).toThrow(
      /RAKAZO_MIN_CLIENT_BUILD/,
    );
  });

  it("loads an optional Expo access token", () => {
    expect(loadEnv(base).expoAccessToken).toBeUndefined();
    expect(loadEnv({ ...base, EXPO_ACCESS_TOKEN: " fake-expo-token " }).expoAccessToken).toBe(
      "fake-expo-token",
    );
  });

  it("loads SMTP configuration and keeps the email emulator out of production", () => {
    expect(
      loadEnv({
        ...base,
        SMTP_URL: " smtps://user:secret@smtp.example.test:465 ",
        EMAIL_FROM: " Rakazo <no-reply@example.test> ",
        EMAIL_EMULATOR: "true",
      }),
    ).toMatchObject({
      smtpUrl: "smtps://user:secret@smtp.example.test:465",
      emailFrom: "Rakazo <no-reply@example.test>",
      emailEmulator: true,
    });
    expect(
      loadEnv({
        ...base,
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "prod-auth-secret-with-enough-length",
        ENCRYPTION_KEY: "prod-encryption-key-with-enough-length",
        SCREEN_PROXY_SECRET: "prod-screen-proxy-secret-with-enough-length",
        SANDBOX_PROVIDER: "none",
        EMAIL_EMULATOR: "true",
      }).emailEmulator,
    ).toBe(false);
    expect(loadEnv({ ...base, NODE_ENV: "development" }).nodeEnv).toBe("development");
  });

  it("loads generic email API connection settings", () => {
    expect(
      loadEnv({ ...base, EMAIL_PROVIDER: " resend ", EMAIL_API_KEY: " fake-key " }),
    ).toMatchObject({
      emailProvider: "resend",
      emailApiKey: "fake-key",
    });
    expect(loadEnv(base).emailProvider).toBeUndefined();
    expect(loadEnv(base).emailApiKey).toBeUndefined();
  });

  it("defaults the remote MCP private-endpoint escape to off", () => {
    expect(loadEnv(base).mcpAllowPrivateEndpoint).toBe(false);
    expect(loadEnv({ ...base, MCP_ALLOW_PRIVATE_ENDPOINT: "true" }).mcpAllowPrivateEndpoint).toBe(
      true,
    );
    expect(loadEnv({ ...base, MCP_ALLOW_PRIVATE_ENDPOINT: "1" }).mcpAllowPrivateEndpoint).toBe(
      false,
    );
  });
});

describe("OIDC environment", () => {
  const oidc = {
    OIDC_ISSUER: "https://identity.example.test",
    OIDC_CLIENT_ID: "fake-client",
    OIDC_CLIENT_SECRET: "fake-secret",
  };
  it("requires all credentials and an HTTPS issuer", () => {
    for (const [key, value] of Object.entries(oidc))
      expect(() => loadEnv({ ...base, [key]: value })).toThrow(/configured together/);
    expect(() =>
      loadEnv({ ...base, ...oidc, OIDC_ISSUER: "http://identity.example.test" }),
    ).toThrow(/HTTPS/);
  });
  it.each(["identity.example.test", "/issuer", "https://"])(
    "reports invalid issuer %s as a configuration error",
    (issuer) => {
      expect(() => loadEnv({ ...base, ...oidc, OIDC_ISSUER: issuer })).toThrow(
        "OIDC_ISSUER must be an HTTPS issuer URL",
      );
    },
  );
  it("guards password-only lockout without contacting discovery", () => {
    expect(() => loadEnv({ ...base, AUTH_PASSWORD_ENABLED: "false" })).toThrow(/requires OIDC/);
    expect(loadEnv({ ...base, ...oidc, AUTH_PASSWORD_ENABLED: "false" }).passwordAuth).toBe(false);
  });
  it("leaves the breached password check off unless explicitly enabled", () => {
    expect(loadEnv(base).breachedPasswordCheck).toBe(false);
    expect(
      loadEnv({ ...base, AUTH_BREACHED_PASSWORD_CHECK_ENABLED: "true" }).breachedPasswordCheck,
    ).toBe(true);
    expect(() => loadEnv({ ...base, AUTH_BREACHED_PASSWORD_CHECK_ENABLED: "yes" })).toThrow(
      "AUTH_BREACHED_PASSWORD_CHECK_ENABLED must be true or false",
    );
  });
  it("defaults to SSO with no policy bypass", () => {
    expect(loadEnv({ ...base, ...oidc }).oidc).toMatchObject({
      name: "SSO",
      allowSignupBypass: false,
      scopes: ["openid", "email", "profile"],
    });
    expect(
      loadEnv({ ...base, ...oidc, OIDC_ALLOW_SIGNUP_BYPASS: "true" }).oidc?.allowSignupBypass,
    ).toBe(true);
  });
});

describe("web origin", () => {
  it("leaves the screen proxy origin unset unless explicitly configured", () => {
    expect(loadEnv(base).screenProxyPublicOrigin).toBeUndefined();
    expect(
      loadEnv({ ...base, SCREEN_PROXY_PUBLIC_ORIGIN: "" }).screenProxyPublicOrigin,
    ).toBeUndefined();
    for (const origin of ["https://screen.example", "https://192.0.2.10:8443", "https://[::1]"]) {
      expect(loadEnv({ ...base, SCREEN_PROXY_PUBLIC_ORIGIN: origin }).screenProxyPublicOrigin).toBe(
        origin,
      );
    }
  });

  it.each([
    " ",
    "http://screen.example",
    "https://screen.example/",
    "https://SCREEN.example",
    "https://screen.example:443",
    "https://screen.example/path",
    "https://screen.example?token=x",
    "https://screen.example#fragment",
    "https://user:password@screen.example",
    "https://*.example",
    "https://127.1",
    "https://screen.example\\path",
  ])("rejects noncanonical screen proxy origin %j", (value) => {
    expect(() => loadEnv({ ...base, SCREEN_PROXY_PUBLIC_ORIGIN: value })).toThrow(
      "SCREEN_PROXY_PUBLIC_ORIGIN must be a canonical HTTPS origin",
    );
  });

  it("drops trailing slashes so links never double up", () => {
    expect(loadEnv({ ...base, WEB_ORIGIN: "https://app.example.com/" }).webOrigin).toBe(
      "https://app.example.com",
    );
    expect(loadEnv({ ...base, WEB_ORIGIN: "https://app.example.com///" }).webOrigin).toBe(
      "https://app.example.com",
    );
    expect(loadEnv({ ...base, WEB_ORIGIN: " https://app.example.com " }).webOrigin).toBe(
      "https://app.example.com",
    );
  });

  it("keeps the local default when none is set", () => {
    expect(loadEnv(base).webOrigin).toBe("http://127.0.0.1:5173");
    expect(loadEnv(base).authUrl).toBe("http://127.0.0.1:5173");
  });

  it.each(["", " \t "])("uses the local default for blank WEB_ORIGIN %j", (value) => {
    const env = loadEnv({ ...base, WEB_ORIGIN: value });
    expect(env.webOrigin).toBe("http://127.0.0.1:5173");
    expect(env.authUrl).toBe("http://127.0.0.1:5173");
  });

  it.each(["", " \t "])("uses webOrigin for blank BETTER_AUTH_URL %j", (value) => {
    const env = loadEnv({
      ...base,
      WEB_ORIGIN: "https://app.example.com/",
      BETTER_AUTH_URL: value,
    });
    expect(env.authUrl).toBe("https://app.example.com");
  });

  it("normalises BETTER_AUTH_URL the same way and keeps a path", () => {
    const env = loadEnv({
      ...base,
      WEB_ORIGIN: "https://app.example.com/",
      BETTER_AUTH_URL: "https://auth.example.com/base/",
    });
    expect(env.authUrl).toBe("https://auth.example.com/base");
    expect(env.webOrigin).toBe("https://app.example.com");
  });

  it("refuses something that is not an absolute URL", () => {
    expect(() => loadEnv({ ...base, WEB_ORIGIN: "app.example.com" })).toThrow(
      "WEB_ORIGIN must be an absolute http(s) URL",
    );
  });

  it("names BETTER_AUTH_URL when it is invalid", () => {
    expect(() => loadEnv({ ...base, BETTER_AUTH_URL: "app.example.com" })).toThrow(
      "BETTER_AUTH_URL must be an absolute http(s) URL",
    );
  });

  it.each(["WEB_ORIGIN", "BETTER_AUTH_URL"])("refuses non-HTTP URLs for %s", (name) => {
    expect(() => loadEnv({ ...base, [name]: "app.example.com:5173" })).toThrow(
      `${name} must be an absolute http(s) URL`,
    );
  });

  it.each(["WEB_ORIGIN", "BETTER_AUTH_URL"])("does not expose invalid %s values", (name) => {
    const value = "postgres://user:password@db.example.test/database";
    const load = () => loadEnv({ ...base, [name]: value });
    expect(load).toThrow(`${name} must be an absolute http(s) URL`);
    expect(load).not.toThrow(value);
  });
});

describe("extra trusted origins", () => {
  it("defaults to none and normalizes and deduplicates explicit HTTPS origins", () => {
    expect(loadEnv(base).extraTrustedOrigins).toEqual([]);
    expect(
      loadEnv({
        ...base,
        EXTRA_TRUSTED_ORIGINS:
          " https://192.0.2.10:443/, HTTPS://Example.TEST:8443,https://192.0.2.10 ",
      }).extraTrustedOrigins,
    ).toEqual(["https://192.0.2.10", "https://example.test:8443"]);
  });

  it.each([
    "http://192.0.2.10",
    "https://*.example.test",
    "https://%2a.example.test",
    "https://user:password@example.test",
    "https://@example.test",
    "https://example.test/path",
    "https://example.test?",
    "https://example.test#",
    "https://example.test\\evil",
    "https://example.test:",
    "https://127.0.0.1:",
    "https://[::1]:",
    "https://127.1",
    "https://0x7f000001",
    "https://0177.0.0.1",
    "https://2130706433",
    "https://192.0.2.010",
    "https://example.test,",
    "null",
  ])("rejects invalid origin %j without exposing it", (value) => {
    const load = () => loadEnv({ ...base, EXTRA_TRUSTED_ORIGINS: value });
    expect(load).toThrow("EXTRA_TRUSTED_ORIGINS must contain comma-separated HTTPS origins");
    expect(load).not.toThrow(value);
  });
});
