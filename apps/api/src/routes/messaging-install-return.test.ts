import { createRouterClient, implement, ORPCError } from "@orpc/server";
import type { Actor } from "@rakazo/contracts";
import { appContract } from "@rakazo/contracts";
import { createLogger, createTestSink } from "@rakazo/logging";
import { requestLogging } from "@rakazo/logging/hono";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RouterContext } from "./context.js";
import {
  MOBILE_MESSAGING_INSTALL_REDIRECT,
  messagingRoutes,
  mountMessagingInstallReturn,
} from "./messaging.js";

const validState = "A".repeat(43);
const validCode = "oauth-code_1";
const returnToForState = vi.hoisted(() => vi.fn());
const claimMobileReturn = vi.hoisted(() => vi.fn());

describe("Slack install return", () => {
  let app: Hono;

  beforeEach(() => {
    vi.resetAllMocks();
    claimMobileReturn.mockResolvedValue(true);
    app = new Hono();
    mountMessagingInstallReturn({
      app,
      webOrigin: "https://web.example.test",
      installations: { returnToForState, claimMobileReturn },
    });
  });

  it("keeps legacy web sessions on the web callback and never consumes them", async () => {
    returnToForState.mockResolvedValueOnce("web");
    const response = await app.request(
      `/api/v1/messaging/install/slack/callback?state=${validState}&code=${validCode}`,
    );
    expect(response.status).toBe(302);
    const target = new URL(response.headers.get("location")!);
    expect(target.origin).toBe("https://web.example.test");
    expect(target.pathname).toBe("/messaging/slack/callback");
    expect(new Set(target.searchParams.keys())).toEqual(new Set(["code", "state"]));
    expect(target.searchParams.get("state")).toBe(validState);
    expect(target.searchParams.get("code")).toBe(validCode);
    expect(returnToForState).toHaveBeenCalledWith(validState);
    expect(claimMobileReturn).not.toHaveBeenCalled();
  });

  it("sends explicit mobile sessions to the fixed app link with only state and code", async () => {
    returnToForState.mockResolvedValueOnce("mobile");
    const response = await app.request(
      `/api/v1/messaging/install/slack/callback?state=${validState}&code=${validCode}`,
    );
    expect(response.status).toBe(302);
    const location = response.headers.get("location")!;
    const target = new URL(location);
    expect(`${target.protocol}//${target.host}${target.pathname}`).toBe(
      MOBILE_MESSAGING_INSTALL_REDIRECT,
    );
    expect([...target.searchParams.keys()]).toEqual(["code", "state"]);
    expect(target.searchParams.get("state")).toBe(validState);
    expect(target.searchParams.get("code")).toBe(validCode);
    expect(target.hash).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(claimMobileReturn).toHaveBeenCalledWith(validState);
  });

  it.each([
    "",
    `?state=${validState}`,
    `?error=access_denied&state=${validState}&code=${validCode}`,
    `?state=${validState}&code=${validCode}&state=duplicate`,
    `?state=${validState}&code=${validCode}&extra=https://attacker.example.test`,
    `?error=access_denied&state=${validState}&state=${validState}`,
    "?state=short&code=code",
    `?state=${validState}&code=${encodeURIComponent("bad\ncode")}`,
    `?state=${validState}&code=bad%ZZ`,
    `?state=${validState}&code=${"a".repeat(4097)}`,
    `?state=${validState}&code=${validCode}&code=${validCode}`,
    `?state=${validState}&error=`,
  ])("rejects an invalid public callback %s without forwarding", async (query) => {
    const response = await app.request(`/api/v1/messaging/install/slack/callback${query}`);
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    expect(returnToForState).not.toHaveBeenCalled();
  });

  it("rejects unknown or expired state and never exchanges the code", async () => {
    returnToForState.mockResolvedValueOnce(null);
    const response = await app.request(
      `/api/v1/messaging/install/slack/callback?state=${validState}&code=${validCode}`,
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    const body = await response.text();
    expect(body).not.toContain(validCode);
    expect(body).not.toContain(validState);
  });

  it("fails closed when the return target cannot be resolved", async () => {
    returnToForState.mockRejectedValueOnce(new Error("database unavailable"));
    const response = await app.request(
      `/api/v1/messaging/install/slack/callback?state=${validState}&code=${validCode}`,
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
    const body = await response.text();
    expect(body).not.toContain(validCode);
    expect(body).not.toContain(validState);
  });

  it("does not reflect extra parameters into an error page", async () => {
    const response = await app.request(
      `/api/v1/messaging/install/slack/callback?state=${validState}&code=${validCode}&note=private-note`,
    );
    const body = await response.text();
    expect(body).not.toContain("private-note");
    expect(body).not.toContain(validCode);
    expect(body).not.toContain(validState);
  });

  it("keeps web cancellations on the legacy callback without returning a code", async () => {
    returnToForState.mockResolvedValueOnce("web");
    const response = await app.request(
      `/api/v1/messaging/install/slack/callback?error=access_denied&state=${validState}`,
    );
    expect(response.status).toBe(302);
    const target = new URL(response.headers.get("location")!);
    expect(target.pathname).toBe("/messaging/slack/callback");
    expect(target.searchParams.get("error")).toBe("access_denied");
    expect(target.searchParams.get("state")).toBe(validState);
    expect(target.searchParams.has("code")).toBe(false);
  });

  it("shows a safe closing page for mobile cancellations without the state", async () => {
    returnToForState.mockResolvedValueOnce("mobile");
    const response = await app.request(
      `/api/v1/messaging/install/slack/callback?error=access_denied&state=${validState}&error_description=private`,
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("window.close();");
    expect(body).not.toContain(validState);
    expect(body).not.toContain("private");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("location")).toBeNull();
    expect(claimMobileReturn).not.toHaveBeenCalled();
  });
  it("rejects a duplicate mobile handoff while leaving completion to the original user", async () => {
    returnToForState.mockResolvedValue("mobile");
    claimMobileReturn.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const url = `/api/v1/messaging/install/slack/callback?state=${validState}&code=${validCode}`;
    const results = await Promise.all([app.request(url), app.request(url)]);
    expect(results.map((response) => response.status)).toEqual([302, 400]);
    expect(results[1]?.headers.get("location")).toBeNull();
    expect(await results[1]?.text()).not.toContain(validCode);
  });
  it.each(["HEAD", "POST", "OPTIONS"])(
    "does not claim or expose credentials for %s",
    async (method) => {
      const response = await app.request(
        `/api/v1/messaging/install/slack/callback?state=${validState}&code=${validCode}`,
        { method },
      );
      expect(response.status).toBe(405);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("location")).toBeNull();
      expect(returnToForState).not.toHaveBeenCalled();
      expect(claimMobileReturn).not.toHaveBeenCalled();
    },
  );
  it("does not put callback credentials or store errors into application request logs", async () => {
    const sink = createTestSink();
    const logged = new Hono();
    logged.use("*", requestLogging(createLogger({ service: "rakazo-api", sinks: [sink] })));
    mountMessagingInstallReturn({
      app: logged,
      installations: { returnToForState, claimMobileReturn },
      webOrigin: "https://web.example.test",
    });
    returnToForState.mockResolvedValueOnce("mobile");
    const url = `/api/v1/messaging/install/slack/callback?state=${validState}&code=${validCode}`;
    const forwarded = await logged.request(url);
    expect(await forwarded.text()).toBe("");
    returnToForState.mockRejectedValueOnce(new Error(`sensitive ${validCode} ${validState}`));
    const failed = await logged.request(url);
    expect(failed.status).toBe(503);
    for (const serialized of [JSON.stringify(sink.events), await failed.text()]) {
      expect(serialized).not.toContain(validState);
      expect(serialized).not.toContain(validCode);
      expect(serialized).not.toContain("sensitive");
    }
    expect(sink.events).toHaveLength(2);
  });
});

describe("authenticated installation RPC", () => {
  const actor: Actor = {
    userId: "user-a",
    spaceId: "space-a",
    email: "fake@example.test",
    isDeploymentOwner: false,
  };
  function clientFor(user: Actor | null = actor) {
    const builder = implement(appContract).$context<{ actor: Actor | null }>();
    const authed = builder.use(({ context, next }) => {
      if (!context.actor) throw new ORPCError("UNAUTHORIZED");
      return next({ context: { actor: context.actor } });
    });
    const start = vi.fn(async () => "https://slack.com/oauth/v2/authorize");
    const complete = vi.fn(async () => undefined);
    const routes = messagingRoutes({
      authed,
      deps: { messagingInstallations: { start, complete } },
    } as unknown as RouterContext);
    return { client: createRouterClient(routes, { context: { actor: user } }), start, complete };
  }
  it("defaults old callers to web and acknowledges explicit mobile mode", async () => {
    const { client, start } = clientFor();
    expect(await client.messaging.installations.start({})).toEqual({
      url: "https://slack.com/oauth/v2/authorize",
    });
    expect(start).toHaveBeenLastCalledWith(actor, undefined, "web");
    expect(
      await client.messaging.installations.start({ returnTo: "mobile", botId: "bot-a" }),
    ).toEqual({ url: "https://slack.com/oauth/v2/authorize", returnTo: "mobile" });
    expect(start).toHaveBeenLastCalledWith(actor, "bot-a", "mobile");
  });
  it("requires a logged-in actor for completion and does not expose adapter errors", async () => {
    const guest = clientFor(null);
    await expect(
      guest.client.messaging.installations.complete({ state: validState, code: validCode }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(guest.complete).not.toHaveBeenCalled();
    const signedIn = clientFor();
    signedIn.complete.mockRejectedValueOnce(new Error(`sensitive ${validCode}`));
    await expect(
      signedIn.client.messaging.installations.complete({ state: validState, code: validCode }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(signedIn.complete).toHaveBeenCalledWith(actor, validState, validCode);
  });
});

describe("messaging install start contract", () => {
  const input = () =>
    (
      appContract.messaging.installations.start as unknown as {
        "~orpc": { inputSchema: { safeParse(value: unknown): { success: boolean } } };
      }
    )["~orpc"].inputSchema;

  it("keeps the legacy empty and bot-only inputs valid", () => {
    expect(input().safeParse({}).success).toBe(true);
    expect(input().safeParse({ botId: "bot-1" }).success).toBe(true);
  });

  it("accepts only fixed return targets and rejects arbitrary URLs", () => {
    expect(input().safeParse({ returnTo: "web" }).success).toBe(true);
    expect(input().safeParse({ returnTo: "mobile" }).success).toBe(true);
    expect(input().safeParse({ returnTo: "https://attacker.example.test" }).success).toBe(false);
    expect(input().safeParse({ returnTo: "desktop" }).success).toBe(false);
  });
});
