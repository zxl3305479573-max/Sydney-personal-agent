import { afterEach, describe, expect, it, vi } from "vitest";

const updates = vi.hoisted(() => ({
  isEnabled: true,
  createdAt: new Date("2026-10-22T09:30:15Z") as Date | null,
  checkForUpdateAsync: vi.fn(async () => ({ isAvailable: false })),
  fetchUpdateAsync: vi.fn(async () => ({ isNew: true })),
  reloadAsync: vi.fn(async () => {}),
}));
const appConfig = vi.hoisted(() => ({ expoConfig: { extra: { sydneySideload: false } } }));
const rn = vi.hoisted(() => {
  const listeners: Array<(state: string) => void> = [];
  return {
    listeners,
    Alert: { alert: vi.fn() },
    AppState: {
      currentState: "active",
      addEventListener: vi.fn((_type: string, listener: (state: string) => void) => {
        listeners.push(listener);
        return { remove: () => listeners.splice(listeners.indexOf(listener), 1) };
      }),
    },
    Linking: { openURL: vi.fn(async () => true) },
    Platform: { OS: "ios" },
  };
});

vi.mock("expo-updates", () => updates);
vi.mock("expo-constants", () => ({ default: appConfig }));
vi.mock("react-native", () => rn);
vi.mock("./api", () => ({ configureClientBuild: vi.fn() }));
vi.mock("./i18n", () => ({ t: (message: string) => message }));

import { IOS_APP_STORE_URL } from "@rakazo/contracts";
import {
  checkForManualUpdate,
  clientBuildHeaders,
  FOREGROUND_UPDATE_CHECK_MS,
  mobileClientBuild,
  noteClientUpdateRequired,
  watchForegroundUpdates,
} from "./client-update";

afterEach(() => {
  updates.isEnabled = true;
  updates.createdAt = new Date("2026-10-22T09:30:15Z");
  appConfig.expoConfig.extra.sydneySideload = false;
  vi.clearAllMocks();
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function pressUpdate() {
  const buttons = rn.Alert.alert.mock.calls.at(-1)?.[2] as Array<{ onPress: () => void }>;
  buttons[0]?.onPress();
}

describe("mobile client build", () => {
  it("names the running bundle by when its update was created", () => {
    expect(mobileClientBuild()).toBe("20261022093015");
    expect(clientBuildHeaders()).toEqual({ "x-rakazo-client-build": "mobile/20261022093015" });
  });

  it("names no build where expo-updates is off", () => {
    updates.isEnabled = false;
    expect(clientBuildHeaders()).toEqual({});
    updates.isEnabled = true;
    updates.createdAt = null;
    expect(mobileClientBuild()).toBeNull();
  });
});

describe("manual update checks", () => {
  it("distinguishes disabled, current and downloaded updates", async () => {
    updates.isEnabled = false;
    expect(await checkForManualUpdate()).toBe("disabled");
    updates.isEnabled = true;
    updates.checkForUpdateAsync.mockResolvedValueOnce({ isAvailable: false });
    expect(await checkForManualUpdate()).toBe("current");
    updates.checkForUpdateAsync.mockResolvedValueOnce({ isAvailable: true });
    expect(await checkForManualUpdate()).toBe("downloaded");
    expect(updates.fetchUpdateAsync).toHaveBeenCalledOnce();
    expect(updates.reloadAsync).not.toHaveBeenCalled();
  });

  it("reports network errors to the caller", async () => {
    updates.checkForUpdateAsync.mockRejectedValueOnce(new Error("offline"));
    await expect(checkForManualUpdate()).rejects.toThrow("offline");
  });
});

describe("update required", () => {
  it("shows one alert, then applies an available update and reloads", async () => {
    updates.checkForUpdateAsync.mockResolvedValueOnce({ isAvailable: true });
    noteClientUpdateRequired();
    noteClientUpdateRequired();
    expect(rn.Alert.alert).toHaveBeenCalledOnce();
    expect(rn.Alert.alert.mock.calls[0]?.[0]).toBe("Update required");
    expect(rn.Alert.alert.mock.calls[0]?.[3]).toEqual({ cancelable: false });
    pressUpdate();
    await flush();
    expect(updates.fetchUpdateAsync).toHaveBeenCalledOnce();
    expect(updates.reloadAsync).toHaveBeenCalledOnce();
    expect(rn.Linking.openURL).not.toHaveBeenCalled();
  });

  it("opens the store when no over-the-air update can fix it, and asks again next time", async () => {
    noteClientUpdateRequired();
    pressUpdate();
    await flush();
    expect(updates.reloadAsync).not.toHaveBeenCalled();
    expect(rn.Linking.openURL).toHaveBeenCalledWith(IOS_APP_STORE_URL);
    noteClientUpdateRequired();
    expect(rn.Alert.alert).toHaveBeenCalledTimes(2);
    pressUpdate();
    await flush();
  });

  it("does not send a sideload installation to an unrelated store", async () => {
    appConfig.expoConfig.extra.sydneySideload = true;
    noteClientUpdateRequired();
    pressUpdate();
    await flush();
    expect(rn.Linking.openURL).not.toHaveBeenCalled();
    expect(rn.Alert.alert).toHaveBeenLastCalledWith("This update needs a new app installation.");
  });

  it("reports a failed sideload update check without requiring a reinstall", async () => {
    appConfig.expoConfig.extra.sydneySideload = true;
    updates.checkForUpdateAsync.mockRejectedValueOnce(new Error("offline"));
    noteClientUpdateRequired();
    pressUpdate();
    await flush();
    expect(rn.Linking.openURL).not.toHaveBeenCalled();
    expect(rn.Alert.alert).toHaveBeenLastCalledWith(
      "Could not check for updates. Try again later.",
    );
  });
});

describe("foreground update checks", () => {
  it("downloads an update when the app returns from the background, at most every 15 minutes", async () => {
    let now = 0;
    const stop = watchForegroundUpdates(() => now);
    const emit = (state: string) => {
      for (const listener of [...rn.listeners]) listener(state);
    };
    updates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    now = FOREGROUND_UPDATE_CHECK_MS;
    emit("inactive");
    emit("active");
    expect(updates.checkForUpdateAsync).not.toHaveBeenCalled();
    emit("background");
    emit("active");
    await flush();
    expect(updates.checkForUpdateAsync).toHaveBeenCalledOnce();
    expect(updates.fetchUpdateAsync).toHaveBeenCalledOnce();
    // Downloaded for the next launch; nothing reloads under the user.
    expect(updates.reloadAsync).not.toHaveBeenCalled();
    now += FOREGROUND_UPDATE_CHECK_MS - 1;
    emit("background");
    emit("active");
    expect(updates.checkForUpdateAsync).toHaveBeenCalledOnce();
    stop();
    expect(rn.listeners).toHaveLength(0);
  });
});
