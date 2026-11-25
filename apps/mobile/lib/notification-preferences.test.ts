import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  sideload: true,
  store: new Map<string, string>(),
  getItemAsync: vi.fn(async (key: string) => fixture.store.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    fixture.store.set(key, value);
  }),
  requestPermissionsAsync: vi.fn(async () => ({ granted: true, status: "granted" })),
  getPermissionsAsync: vi.fn(async () => ({
    granted: false,
    status: "undetermined",
    canAskAgain: true,
  })),
  scheduleNotificationAsync: vi.fn(async () => "notif-1"),
  registerPushToken: vi.fn(async () => undefined),
}));

vi.mock("expo-constants", () => ({
  default: {
    get expoConfig() {
      return { extra: { sydneySideload: fixture.sideload } };
    },
  },
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: fixture.getItemAsync,
  setItemAsync: fixture.setItemAsync,
}));
vi.mock("expo-notifications", () => ({
  requestPermissionsAsync: fixture.requestPermissionsAsync,
  getPermissionsAsync: fixture.getPermissionsAsync,
  scheduleNotificationAsync: fixture.scheduleNotificationAsync,
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("./push", () => ({ registerPushToken: fixture.registerPushToken }));

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  enableNotificationsWithPrompt,
  getCachedNotificationPreferences,
  getSystemNotificationPermissionStatus,
  loadNotificationPreferences,
  resetNotificationPreferencesCacheForTest,
  sendTestLocalNotification,
  updateNotificationPreferences,
} from "./notification-preferences";

beforeEach(() => {
  vi.clearAllMocks();
  fixture.store.clear();
  fixture.sideload = true;
  fixture.requestPermissionsAsync.mockResolvedValue({ granted: true, status: "granted" });
  fixture.getPermissionsAsync.mockResolvedValue({
    granted: false,
    status: "undetermined",
    canAskAgain: true,
  });
  resetNotificationPreferencesCacheForTest();
});

describe("notification preferences", () => {
  it("loads defaults and recovers safely from corrupt storage without calling getPermissionsAsync", async () => {
    fixture.store.set("sydney.mobile.notifications.v1", "{bad-json");
    const prefs = await loadNotificationPreferences();
    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(fixture.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it("persists preference updates and reads them back on reload", async () => {
    await updateNotificationPreferences({
      prompted: true,
      enabled: true,
      completions: true,
      sound: true,
    });
    resetNotificationPreferencesCacheForTest();
    const reloaded = await loadNotificationPreferences();
    expect(reloaded).toMatchObject({
      prompted: true,
      enabled: true,
      completions: true,
      sound: true,
    });
  });

  it("requests system permission on enable and skips remote push registration in sideload builds", async () => {
    fixture.sideload = true;
    const result = await enableNotificationsWithPrompt();
    expect(result.granted).toBe(true);
    expect(result.preferences.prompted).toBe(true);
    expect(result.preferences.enabled).toBe(true);
    expect(fixture.requestPermissionsAsync).toHaveBeenCalledOnce();
    expect(fixture.registerPushToken).not.toHaveBeenCalled();
  });

  it("registers remote push token when granted on non-sideload builds", async () => {
    fixture.sideload = false;
    const result = await enableNotificationsWithPrompt();
    expect(result.granted).toBe(true);
    expect(fixture.registerPushToken).toHaveBeenCalledOnce();
  });

  it("records prompted=true and enabled=false when permission is denied", async () => {
    fixture.requestPermissionsAsync.mockResolvedValueOnce({ granted: false, status: "denied" });
    const result = await enableNotificationsWithPrompt();
    expect(result.granted).toBe(false);
    expect(getCachedNotificationPreferences()).toMatchObject({ prompted: true, enabled: false });
  });

  it("schedules a local test notification when granted and reports denied otherwise", async () => {
    await updateNotificationPreferences({ sound: true });
    await expect(sendTestLocalNotification("zh-CN")).resolves.toBe("sent");
    expect(fixture.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: "Sydney 测试通知",
          sound: "default",
          data: { kind: "test" },
        }),
        trigger: null,
      }),
    );

    fixture.requestPermissionsAsync.mockResolvedValueOnce({ granted: false, status: "denied" });
    await expect(sendTestLocalNotification("en")).resolves.toBe("denied");
  });

  it("maps denied permission status accurately for settings screen", async () => {
    fixture.getPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      status: "denied",
      canAskAgain: false,
    });
    await expect(getSystemNotificationPermissionStatus()).resolves.toBe("denied");
  });
});
