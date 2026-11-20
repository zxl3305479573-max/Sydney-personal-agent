import {
  ANDROID_APK_URL,
  buildIdAt,
  CLIENT_BUILD_HEADER,
  formatClientBuild,
  IOS_APP_STORE_URL,
} from "@rakazo/contracts";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import * as Updates from "expo-updates";
import { useEffect } from "react";
import type { AppStateStatus } from "react-native";
import { Alert, AppState, Linking, Platform } from "react-native";
import { configureClientBuild } from "./api";
import { getActiveUiLocale, t } from "./i18n";
import type { SydneyRelease } from "./sydney-release";
import { sydneyReleaseFromManifest, sydneyReleaseNotes } from "./sydney-release";

/** Foreground returns closer together than this reuse the last update check. */
export const FOREGROUND_UPDATE_CHECK_MS = 15 * 60_000;

/**
 * The running JavaScript bundle's build: when its update (embedded or downloaded) was created.
 * Null where expo-updates is off (development, Expo Go), which leaves the handshake off.
 */
export function mobileClientBuild(): string | null {
  try {
    if (!Updates.isEnabled) return null;
    const created = Updates.createdAt;
    return created instanceof Date && !Number.isNaN(created.getTime()) ? buildIdAt(created) : null;
  } catch {
    return null;
  }
}

export function clientBuildHeaders(): Record<string, string> {
  const build = mobileClientBuild();
  return build ? { [CLIENT_BUILD_HEADER]: formatClientBuild("mobile", build) } : {};
}

type ClientUpdate = { id?: string; release: SydneyRelease | null };

function describeUpdate(manifest: Updates.Manifest | undefined): ClientUpdate {
  return { id: manifest?.id, release: sydneyReleaseFromManifest(manifest) };
}

let checking: ReturnType<typeof Updates.checkForUpdateAsync> | undefined;

function checkForUpdate() {
  checking ??= Updates.checkForUpdateAsync().finally(() => {
    checking = undefined;
  });
  return checking;
}

export function useClientUpdateState() {
  const { availableUpdate, downloadedUpdate, isUpdateAvailable, isUpdatePending, isDownloading } =
    Updates.useUpdates();
  const pending = isUpdatePending ? downloadedUpdate : undefined;
  const latest = isUpdateAvailable ? availableUpdate : pending;
  const update = Updates.isEnabled && latest?.type === "new" ? latest : undefined;
  return {
    update,
    downloaded: !!update && update.updateId === pending?.updateId,
    downloading: isDownloading,
  };
}

export async function checkForManualUpdate(): Promise<
  { status: "disabled" | "current" } | { status: "available"; update: ClientUpdate }
> {
  if (!Updates.isEnabled) return { status: "disabled" };
  const check = await checkForUpdate();
  if (!check.isAvailable) return { status: "current" };
  return { status: "available", update: describeUpdate(check.manifest) };
}

export async function restartForUpdate(): Promise<void> {
  await Updates.reloadAsync();
}

const UPDATE_NOTICE_KEY = "sydney-last-noticed-update";
let noticedUpdateId: string | undefined;
let optionalUpdateOpen = false;
let prompting = false;

function closeOptionalUpdate() {
  optionalUpdateOpen = false;
}

function releaseMessage(release: SydneyRelease) {
  return `${release.releasedOn}\n\n${sydneyReleaseNotes(release, getActiveUiLocale())}`;
}

async function downloadOptionalUpdate(update: ClientUpdate, downloaded: boolean) {
  let release = update.release;
  if (!downloaded) {
    try {
      const result = await Updates.fetchUpdateAsync();
      if (!result.isNew) throw new Error("No update downloaded");
      release = sydneyReleaseFromManifest(result.manifest);
    } catch {
      closeOptionalUpdate();
      Alert.alert(t("Could not download the update. Try again later."));
      return;
    }
  }
  const restartMessage = t("Restart the app now? Save unfinished work first.");
  Alert.alert(
    release
      ? t("Version {version} downloaded", { version: release.version })
      : t("Update downloaded"),
    release ? `${releaseMessage(release)}\n\n${restartMessage}` : restartMessage,
    [
      { text: t("Not Now"), style: "cancel", onPress: closeOptionalUpdate },
      {
        text: t("Install and restart"),
        onPress: () =>
          void restartForUpdate()
            .catch(() => Alert.alert(t("Could not restart. Reopen the app to apply the update.")))
            .finally(closeOptionalUpdate),
      },
    ],
    { cancelable: false },
  );
}

export function promptForAvailableUpdate(update: ClientUpdate, downloaded = false) {
  if (optionalUpdateOpen || prompting) return;
  optionalUpdateOpen = true;
  noticedUpdateId = update.id;
  if (update.id) void SecureStore.setItemAsync(UPDATE_NOTICE_KEY, update.id).catch(() => undefined);
  const { release } = update;
  Alert.alert(
    release
      ? t("Version {version} available", { version: release.version })
      : t("Update available"),
    release ? releaseMessage(release) : undefined,
    [
      { text: t("Not Now"), style: "cancel", onPress: closeOptionalUpdate },
      { text: t("Update"), onPress: () => void downloadOptionalUpdate(update, downloaded) },
    ],
    { cancelable: false },
  );
}

export async function promptForStartupUpdate(update: ClientUpdate, downloaded: boolean) {
  if (!update.id || optionalUpdateOpen || noticedUpdateId === update.id) return;
  const previous = await SecureStore.getItemAsync(UPDATE_NOTICE_KEY).catch(() => null);
  if (AppState.currentState !== "active" || previous === update.id || noticedUpdateId === update.id)
    return;
  promptForAvailableUpdate(update, downloaded);
}

export function useStartupUpdatePrompt(ready: boolean) {
  const { update, downloaded } = useClientUpdateState();
  useEffect(() => {
    if (!ready) return;
    return watchForegroundUpdates();
  }, [ready]);
  useEffect(() => {
    if (!ready || !update) return;
    const show = (state: AppStateStatus | null) => {
      if (state === "active")
        void promptForStartupUpdate(describeUpdate(update.manifest), downloaded);
    };
    show(AppState.currentState);
    const subscription = AppState.addEventListener("change", show);
    return () => subscription.remove();
  }, [ready, update, downloaded]);
}

/** Apply an over-the-air update now if one exists; otherwise send the user to the store. */
export async function applyRequiredUpdate(): Promise<void> {
  try {
    if (
      Updates.isEnabled &&
      (await checkForUpdate()).isAvailable &&
      (await Updates.fetchUpdateAsync()).isNew
    ) {
      await restartForUpdate();
      return;
    }
  } catch {
    if (Platform.OS === "ios" && Constants.expoConfig?.extra?.sydneySideload === true) {
      Alert.alert(t("Could not check for updates. Try again later."));
      return;
    }
  }
  if (Platform.OS === "ios" && Constants.expoConfig?.extra?.sydneySideload === true) {
    Alert.alert(t("This update needs a new app installation."));
    return;
  }
  await Linking.openURL(Platform.OS === "ios" ? IOS_APP_STORE_URL : ANDROID_APK_URL).catch(
    () => undefined,
  );
}

/** The server refused this build. One alert at a time; it stays until the user updates. */
export function noteClientUpdateRequired(): void {
  if (prompting) return;
  prompting = true;
  Alert.alert(
    t("Update required"),
    undefined,
    [
      {
        text: t("Update"),
        onPress: () => {
          void applyRequiredUpdate().finally(() => {
            prompting = false;
          });
        },
      },
    ],
    { cancelable: false },
  );
}

/** Name this build on every API request, and prompt for an update when the server refuses it. */
export function installClientUpdates(): void {
  configureClientBuild({ headers: clientBuildHeaders, onUpdateRequired: noteClientUpdateRequired });
}

export function watchForegroundUpdates(now: () => number = Date.now): () => void {
  if (!Updates.isEnabled) return () => {};
  void checkForUpdate().catch(() => undefined);
  let lastCheck = now();
  let wasBackground = false;
  const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
    if (state === "background") wasBackground = true;
    if (state !== "active" || !wasBackground) return;
    wasBackground = false;
    if (now() - lastCheck < FOREGROUND_UPDATE_CHECK_MS) return;
    lastCheck = now();
    void checkForUpdate().catch(() => undefined);
  });
  return () => subscription.remove();
}
