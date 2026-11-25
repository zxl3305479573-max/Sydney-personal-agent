import { afterEach, describe, expect, it, vi } from "vitest";
import sydneyRelease from "../sydney-release.json";

const updates = vi.hoisted(() => ({
  isEnabled: true,
  createdAt: new Date("2026-10-22T09:30:15Z") as Date | null,
  checkForUpdateAsync: vi.fn(
    async (): Promise<{ isAvailable: boolean; manifest?: unknown }> => ({ isAvailable: false }),
  ),
  fetchUpdateAsync: vi.fn(
    async (): Promise<{ isNew: boolean; manifest?: unknown }> => ({
      isNew: true,
    }),
  ),
  reloadAsync: vi.fn(async () => {}),
}));
const storage = vi.hoisted(() => ({
  getItemAsync: vi.fn(async (): Promise<string | null> => null),
  setItemAsync: vi.fn(async () => undefined),
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
vi.mock("expo-secure-store", () => storage);
vi.mock("expo-constants", () => ({ default: appConfig }));
vi.mock("react-native", () => rn);
vi.mock("./api", () => ({ configureClientBuild: vi.fn() }));
vi.mock("./i18n", () => ({
  getActiveUiLocale: () => "en",
  t: (message: string, values?: { version: string }) =>
    values ? message.replace("{version}", values.version) : message,
}));

import { IOS_INSTALL_GUIDE_URL } from "@rakazo/contracts";
import {
  checkForManualUpdate,
  clientBuildHeaders,
  FOREGROUND_UPDATE_CHECK_MS,
  mobileClientBuild,
  noteClientUpdateRequired,
  promptForAvailableUpdate,
  promptForStartupUpdate,
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

function pressOptionalUpdate(text: string) {
  const buttons = rn.Alert.alert.mock.calls.at(-1)?.[2] as Array<{
    text: string;
    onPress: () => void;
  }>;
  buttons.find((button) => button.text === text)?.onPress();
}

const updateManifest = {
  id: "new-update",
  extra: { expoClient: { extra: { sydneyMobileRelease: sydneyRelease } } },
};

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
  it("distinguishes disabled, current and available updates without downloading", async () => {
    updates.isEnabled = false;
    expect(await checkForManualUpdate()).toEqual({ status: "disabled" });
    updates.isEnabled = true;
    updates.checkForUpdateAsync.mockResolvedValueOnce({ isAvailable: false });
    expect(await checkForManualUpdate()).toEqual({ status: "current" });
    updates.checkForUpdateAsync.mockResolvedValueOnce({ isAvailable: true });
    expect(await checkForManualUpdate()).toEqual({
      status: "available",
      update: { id: undefined, release: null },
    });
    expect(updates.fetchUpdateAsync).not.toHaveBeenCalled();
    expect(updates.reloadAsync).not.toHaveBeenCalled();
  });

  it("uses release notes from the available manifest before downloading", async () => {
    updates.checkForUpdateAsync.mockResolvedValueOnce({
      isAvailable: true,
      manifest: updateManifest,
    });
    expect(await checkForManualUpdate()).toEqual({
      status: "available",
      update: { id: updateManifest.id, release: sydneyRelease },
    });
    expect(updates.fetchUpdateAsync).not.toHaveBeenCalled();
  });

  it("reports network errors to the caller", async () => {
    updates.checkForUpdateAsync.mockRejectedValueOnce(new Error("offline"));
    await expect(checkForManualUpdate()).rejects.toThrow("offline");
  });
});

describe("optional update prompts", () => {
  const candidate = { id: updateManifest.id, release: sydneyRelease };

  it("shows the update once, and keeps download and restart as separate confirmations", async () => {
    updates.fetchUpdateAsync.mockResolvedValueOnce({ isNew: true, manifest: updateManifest });
    await promptForStartupUpdate(candidate, false);
    expect(rn.Alert.alert).toHaveBeenCalledWith(
      `Version ${sydneyRelease.version} available`,
      expect.stringContaining(sydneyRelease.notes.en.join("\n• ")),
      expect.any(Array),
      { cancelable: false },
    );
    expect(storage.setItemAsync).toHaveBeenCalledWith("sydney-last-noticed-update", candidate.id);
    pressOptionalUpdate("Not Now");
    await promptForStartupUpdate(candidate, false);
    expect(rn.Alert.alert).toHaveBeenCalledOnce();
    expect(updates.fetchUpdateAsync).not.toHaveBeenCalled();

    promptForAvailableUpdate(candidate);
    pressOptionalUpdate("Update");
    await flush();
    expect(updates.fetchUpdateAsync).toHaveBeenCalledOnce();
    expect(rn.Alert.alert.mock.calls.at(-1)?.[0]).toBe(
      `Version ${sydneyRelease.version} downloaded`,
    );
    expect(updates.reloadAsync).not.toHaveBeenCalled();
    pressOptionalUpdate("Install and restart");
    await flush();
    expect(updates.reloadAsync).toHaveBeenCalledOnce();
  });

  it("remembers a previously shown update across launches", async () => {
    const previouslyShown = "previously-shown";
    storage.getItemAsync.mockResolvedValueOnce(previouslyShown);
    await promptForStartupUpdate({ ...candidate, id: previouslyShown }, false);
    expect(rn.Alert.alert).not.toHaveBeenCalled();
  });

  it("only offers restart after a successful download", async () => {
    updates.fetchUpdateAsync.mockResolvedValueOnce({ isNew: false });
    promptForAvailableUpdate(candidate);
    pressOptionalUpdate("Update");
    await flush();
    expect(rn.Alert.alert).toHaveBeenLastCalledWith(
      "Could not download the update. Try again later.",
    );
    expect(updates.reloadAsync).not.toHaveBeenCalled();
  });

  it("offers to restart a cached update after confirmation without downloading again", async () => {
    promptForAvailableUpdate(candidate, true);
    expect(rn.Alert.alert.mock.calls.at(-1)?.[0]).toBe(
      `Version ${sydneyRelease.version} available`,
    );
    pressOptionalUpdate("Update");
    expect(rn.Alert.alert.mock.calls.at(-1)?.[0]).toBe(
      `Version ${sydneyRelease.version} downloaded`,
    );
    expect(updates.fetchUpdateAsync).not.toHaveBeenCalled();
    pressOptionalUpdate("Not Now");
    expect(updates.reloadAsync).not.toHaveBeenCalled();
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

  it("opens Sydney's installation guide when there is no over-the-air update", async () => {
    noteClientUpdateRequired();
    pressUpdate();
    await flush();
    expect(updates.reloadAsync).not.toHaveBeenCalled();
    expect(rn.Linking.openURL).toHaveBeenCalledWith(IOS_INSTALL_GUIDE_URL);
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
  it("checks at startup and on eligible foreground returns without downloading", async () => {
    let now = 0;
    updates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    const stop = watchForegroundUpdates(() => now);
    await flush();
    const emit = (state: string) => {
      for (const listener of [...rn.listeners]) listener(state);
    };
    now = FOREGROUND_UPDATE_CHECK_MS;
    emit("inactive");
    emit("active");
    expect(updates.checkForUpdateAsync).toHaveBeenCalledOnce();
    emit("background");
    emit("active");
    await flush();
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(2);
    expect(updates.fetchUpdateAsync).not.toHaveBeenCalled();
    expect(updates.reloadAsync).not.toHaveBeenCalled();
    now += FOREGROUND_UPDATE_CHECK_MS - 1;
    emit("background");
    emit("active");
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(2);
    stop();
    expect(rn.listeners).toHaveLength(0);
  });
});
