import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  platform: "ios" as "ios" | "android",
  scheduleNotificationAsync: vi.fn(async () => "expo-notif-1"),
}));

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return fixture.platform;
    },
  },
}));
vi.mock("expo-notifications", () => ({
  scheduleNotificationAsync: fixture.scheduleNotificationAsync,
}));

import {
  deliverBotLocalNotification,
  setNativeBotNotificationModuleForTest,
} from "./bot-local-notification";
import {
  clearBotNotificationProfiles,
  registerBotNotificationProfiles,
} from "./bot-notification-registry";
import { resetCompanionSessionStateForTest } from "./companion-session-state";

const SAMPLE_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

beforeEach(() => {
  vi.clearAllMocks();
  fixture.platform = "ios";
  clearBotNotificationProfiles();
  resetCompanionSessionStateForTest();
  setNativeBotNotificationModuleForTest(undefined);
});

afterEach(() => {
  setNativeBotNotificationModuleForTest(undefined);
});

describe("deliverBotLocalNotification", () => {
  it("resolves bot avatar from registry and schedules native iOS bot notification with encoded avatar", async () => {
    const scheduleBotNotification = vi.fn(async (..._args: unknown[]) => undefined);
    setNativeBotNotificationModuleForTest({
      supportsBotNotifications: () => true,
      scheduleBotNotification,
    });
    registerBotNotificationProfiles([
      {
        id: "bot-photo",
        name: "小花",
        color: SAMPLE_PNG_DATA_URI,
        avatarSet: "organic",
      },
      {
        id: "bot-color",
        name: "大肥鱼",
        color: "#E07A5F",
        avatarSet: "organic",
      },
    ]);

    await deliverBotLocalNotification({
      kind: "message",
      botId: "bot-photo",
      botName: "小花",
      spaceId: "space-1",
      body: "晚饭想吃什么？",
      deliveryId: "reply-1",
      playSound: true,
    });

    expect(scheduleBotNotification).toHaveBeenCalledTimes(1);
    expect(scheduleBotNotification).toHaveBeenCalledWith(
      "reply-1",
      "bot-photo",
      "小花",
      "小花",
      "晚饭想吃什么？",
      `r|${SAMPLE_PNG_DATA_URI}`,
      true,
      expect.objectContaining({
        kind: "message",
        botId: "bot-photo",
        name: "小花",
        spaceId: "space-1",
        deliveryId: "reply-1",
        botColor: SAMPLE_PNG_DATA_URI,
        botAvatarSet: "organic",
      }),
    );
    expect(fixture.scheduleNotificationAsync).not.toHaveBeenCalled();

    await deliverBotLocalNotification({
      kind: "attention",
      botId: "bot-color",
      botName: "大肥鱼",
      spaceId: "space-1",
      body: "正在等待你的确认或回复",
      deliveryId: "attn-2",
      playSound: false,
    });

    const secondCall = scheduleBotNotification.mock.calls[1];
    expect(secondCall?.[1]).toBe("bot-color");
    expect(secondCall?.[2]).toBe("大肥鱼");
    expect(String(secondCall?.[5])).toMatch(/^o\|E07A5F\|/);
    expect(secondCall?.[6]).toBe(false);
  });

  it("falls back to expo-notifications with resolved botColor when native module is unavailable or fails", async () => {
    setNativeBotNotificationModuleForTest(null);
    registerBotNotificationProfiles([
      { id: "bot-2", name: "管家", color: "#3D8A6E", avatarSet: "rakazo" },
    ]);

    await deliverBotLocalNotification({
      kind: "message",
      botId: "bot-2",
      botName: "管家",
      spaceId: "space-2",
      body: "服务器已就绪",
      deliveryId: "reply-2",
      playSound: true,
    });

    expect(fixture.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: "管家",
        body: "服务器已就绪",
        sound: "default",
        data: expect.objectContaining({
          kind: "message",
          botId: "bot-2",
          name: "管家",
          spaceId: "space-2",
          deliveryId: "reply-2",
          botColor: "#3D8A6E",
          botAvatarSet: "rakazo",
        }),
      },
      trigger: null,
    });

    fixture.scheduleNotificationAsync.mockClear();
    setNativeBotNotificationModuleForTest({
      supportsBotNotifications: () => true,
      scheduleBotNotification: vi.fn(async () => {
        throw new Error("native unavailable");
      }),
    });

    await deliverBotLocalNotification({
      kind: "message",
      botId: "bot-2",
      botName: "管家",
      spaceId: "space-2",
      body: "降级通知测试",
      deliveryId: "reply-3",
      playSound: false,
    });

    expect(fixture.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(fixture.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          sound: false,
          data: expect.objectContaining({ botId: "bot-2", botColor: "#3D8A6E" }),
        }),
      }),
    );
  });
});
