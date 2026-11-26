import type { MobileBridgePermissions, MobileBridgeSnapshot } from "@rakazo/contracts";
import { DEFAULT_MOBILE_BRIDGE_PERMISSIONS, MOBILE_APP_TOOL_NAMES } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import type { RunContext } from "./run-context.js";
import type { ToolCall } from "./run-tool-gate.js";
import { selectBuiltinToolsForRun } from "./run-tool-selection.js";
import {
  buildServerAmapNavigationUrls,
  gcj02ToWgs84,
  mobileAppTools,
  wgs84ToGcj02,
} from "./run-tools-mobile-app.js";

const mockPublishMessage = vi.hoisted(() => vi.fn(async () => ({ id: "msg-1" })));
const mockGetBridge = vi.hoisted(() => vi.fn());
const mockEnqueueAction = vi.hoisted(() => vi.fn());
const mockAudit = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("./run-messages.js", () => ({
  publishMessage: mockPublishMessage,
}));

vi.mock("@rakazo/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@rakazo/db")>();
  return {
    ...actual,
    getUserMobileBridge: mockGetBridge,
    enqueueUserMobileBridgeAction: mockEnqueueAction,
    recordAuditEvent: mockAudit,
  };
});

function makeContext(overrides?: { ownerStartedRun?: boolean }): RunContext {
  return {
    bot: { id: "bot-1", name: "大肥鱼-总管" },
    runId: "run-1",
    run: {
      id: "run-1",
      userId: "user-1",
      spaceId: "space-1",
      threadId: "thread-1",
      botId: "bot-1",
      trigger: "user",
    },
    source: {
      ownerStartedRun: overrides?.ownerStartedRun ?? true,
    },
    context: {
      signal: new AbortController().signal,
    },
    deps: {
      prisma: {},
      events: { notify: vi.fn(async () => undefined) },
    },
  } as unknown as RunContext;
}

function makeCall(name: string, args: Record<string, unknown> = {}): ToolCall {
  return {
    name,
    args,
    executionId: "exec-1",
    observer: undefined,
    connectorCall: {} as ToolCall["connectorCall"],
    effectKey: "eff-1",
    applied: undefined,
    nextApprovedTool: undefined,
    bypassApproval: true,
    claimedEffect: false,
    persistEffectResult: async () => true,
    finish: async (result) => result,
    claimOrReturn: async () => undefined,
  };
}

function bridgeFixture(
  permissions: Partial<MobileBridgePermissions> = {},
  snapshot: Partial<MobileBridgeSnapshot> = {},
) {
  return {
    permissions: { ...DEFAULT_MOBILE_BRIDGE_PERMISSIONS, ...permissions },
    snapshot: {
      location: {
        latitude: 31.2304,
        longitude: 121.4737,
        city: "上海市",
        district: "黄浦区",
        label: "上海市 · 黄浦区",
        source: "gps" as const,
        updatedAt: Date.now(),
      },
      weather: {
        temperatureC: 22,
        condition: "sunny" as const,
        isDay: true,
        fetchedAt: Date.now(),
        locationLabel: "上海市 · 黄浦区",
        highC: 25,
        lowC: 16,
      },
      companion: {
        active: true,
        mode: "live-activity" as const,
        botId: "bot-1",
        botName: "大肥鱼-总管",
        updatedAt: Date.now(),
      },
      calendar: {
        authorizationStatus: "authorized" as const,
        syncedAt: Date.now(),
        events: [
          {
            id: "ev-1",
            title: "产品评审会",
            startAt: "2026-11-26T07:00:00Z",
            endAt: "2026-11-26T08:00:00Z",
            location: "陆家嘴会议室",
          },
        ],
      },
      reminders: {
        authorizationStatus: "authorized" as const,
        syncedAt: Date.now(),
        items: [
          { id: "rem-1", title: "取快递", completed: false },
          { id: "rem-2", title: "已寄出合同", completed: true },
        ],
      },
      contacts: {
        authorizationStatus: "authorized" as const,
        syncedAt: Date.now(),
        totalCount: 2,
        items: [
          {
            id: "c-1",
            name: "张三",
            phones: ["13800138000"],
            emails: ["zhangsan@example.com"],
            organization: "星辰科技",
          },
          {
            id: "c-2",
            name: "李四",
            phones: ["13900139000"],
            emails: [],
          },
        ],
      },
      clipboard: {
        hasText: true,
        textPreview: "外滩18号",
        updatedAt: Date.now(),
      },
      ...snapshot,
    },
    pendingActions: [],
    updatedAt: new Date().toISOString(),
  };
}

describe("mobile app builtin tools", () => {
  it("converts WGS-84 <-> GCJ-02 and builds official Amap iOS/Android/Web URLs", () => {
    const wgs = { latitude: 31.2304, longitude: 121.4737 };
    const gcj = wgs84ToGcj02(wgs);
    expect(gcj.latitude).not.toBeCloseTo(wgs.latitude, 4);
    const back = gcj02ToWgs84(gcj);
    expect(back.latitude).toBeCloseTo(wgs.latitude, 4);
    expect(back.longitude).toBeCloseTo(wgs.longitude, 4);

    const urls = buildServerAmapNavigationUrls({
      origin: { name: "我的位置", ...wgs },
      destination: { name: "东方明珠", latitude: 31.2397, longitude: 121.4998 },
      mode: "driving",
    });
    expect(urls.nativeUrlIos).toContain("iosamap://path?");
    expect(urls.nativeUrlAndroid).toContain("amapuri://route/plan/?");
    expect(urls.webUrl).toContain("https://uri.amap.com/navigation?");
    expect(urls.webUrl).toContain("coordinate=gaode");
  });

  it("refuses non-owner runs and respects per-category permission switches", async () => {
    mockGetBridge.mockResolvedValue(bridgeFixture());
    const nonOwner = await mobileAppTools.app_get_location!(
      makeContext({ ownerStartedRun: false }),
      makeCall("app_get_location"),
    );
    expect(nonOwner).toMatchObject({ error: expect.stringContaining("account owner") });

    mockGetBridge.mockResolvedValue(bridgeFixture({ contacts: false }));
    const blocked = await mobileAppTools.app_search_contacts!(
      makeContext(),
      makeCall("app_search_contacts", { query: "张三" }),
    );
    expect(blocked).toMatchObject({ error: expect.stringContaining("contacts") });
  });

  it("reads authorized location, weather, calendar, reminders, contacts, and clipboard", async () => {
    mockGetBridge.mockResolvedValue(bridgeFixture());
    const ctx = makeContext();

    const loc = (await mobileAppTools.app_get_location!(
      ctx,
      makeCall("app_get_location"),
    )) as Record<string, unknown>;
    expect(loc.available).toBe(true);
    expect(loc.label).toBe("上海市 · 黄浦区");

    const weather = (await mobileAppTools.app_get_weather!(
      ctx,
      makeCall("app_get_weather"),
    )) as Record<string, unknown>;
    expect(weather.temperatureC).toBe(22);
    expect(weather.condition).toBe("sunny");

    const cal = (await mobileAppTools.app_get_calendar!(
      ctx,
      makeCall("app_get_calendar", { query: "评审" }),
    )) as { count: number; events: Array<{ title: string }> };
    expect(cal.count).toBe(1);
    expect(cal.events[0]?.title).toBe("产品评审会");

    const rems = (await mobileAppTools.app_get_reminders!(ctx, makeCall("app_get_reminders"))) as {
      count: number;
      items: Array<{ title: string }>;
    };
    expect(rems.count).toBe(1);
    expect(rems.items[0]?.title).toBe("取快递");

    const contacts = (await mobileAppTools.app_search_contacts!(
      ctx,
      makeCall("app_search_contacts", { query: "张三" }),
    )) as { results: Array<{ name: string; phones: string[] }> };
    expect(contacts.results).toHaveLength(1);
    expect(contacts.results[0]?.phones).toEqual(["13800138000"]);

    const clip = (await mobileAppTools.app_get_clipboard!(ctx, makeCall("app_get_clipboard"))) as {
      textPreview: string;
    };
    expect(clip.textPreview).toBe("外滩18号");
  });

  it("publishes app_action card and enqueues pending action for Amap navigation and calendar writes", async () => {
    mockPublishMessage.mockClear();
    mockEnqueueAction.mockClear();
    mockGetBridge.mockResolvedValue(bridgeFixture());
    mockEnqueueAction.mockResolvedValue(bridgeFixture());
    const ctx = makeContext();

    const nav = (await mobileAppTools.app_open_amap_navigation!(
      ctx,
      makeCall("app_open_amap_navigation", {
        destinationName: "东方明珠",
        destinationLatitude: 31.2397,
        destinationLongitude: 121.4998,
        mode: "transit",
      }),
    )) as { dispatched: boolean; actionId: string; autoExecute: boolean };
    expect(nav.dispatched).toBe(true);
    expect(nav.autoExecute).toBe(true);
    expect(mockEnqueueAction).toHaveBeenCalledTimes(1);
    expect(mockPublishMessage).toHaveBeenCalledWith(
      ctx.deps,
      ctx.run,
      "bot",
      expect.arrayContaining([
        expect.objectContaining({
          kind: "app_action",
          actionId: nav.actionId,
          payload: expect.objectContaining({
            actionKind: "open_amap_navigation",
            destinationName: "东方明珠",
            mode: "transit",
          }),
        }),
      ]),
    );

    const cal = (await mobileAppTools.app_create_calendar_event!(
      ctx,
      makeCall("app_create_calendar_event", {
        title: "牙医预约",
        startAt: "2026-11-27T02:00:00Z",
        endAt: "2026-11-27T03:00:00Z",
      }),
    )) as { dispatched: boolean };
    expect(cal.dispatched).toBe(true);
    expect(mockEnqueueAction).toHaveBeenCalledTimes(2);
  });

  it("offers mobile app tools only on owner-started interactive runs", () => {
    const ownerTools = selectBuiltinToolsForRun({
      graphicalToolsAllowed: false,
      groupId: null,
      trigger: "user",
      semanticMemoryEnabled: false,
      messagingChannelRun: false,
    }).map((tool) => tool.name);
    for (const name of MOBILE_APP_TOOL_NAMES) {
      expect(ownerTools).toContain(name);
    }

    const webhookTools = selectBuiltinToolsForRun({
      graphicalToolsAllowed: false,
      groupId: null,
      trigger: "webhook",
      semanticMemoryEnabled: false,
      messagingChannelRun: false,
    }).map((tool) => tool.name);
    for (const name of MOBILE_APP_TOOL_NAMES) {
      expect(webhookTools).not.toContain(name);
    }

    const channelTools = selectBuiltinToolsForRun({
      graphicalToolsAllowed: false,
      groupId: null,
      trigger: "user",
      semanticMemoryEnabled: false,
      messagingChannelRun: true,
    }).map((tool) => tool.name);
    for (const name of MOBILE_APP_TOOL_NAMES) {
      expect(channelTools).not.toContain(name);
    }
  });
});
