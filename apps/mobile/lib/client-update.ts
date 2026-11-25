import {
  buildIdAt,
  CLIENT_BUILD_HEADER,
  CLIENT_RELEASES_URL,
  formatClientBuild,
  IOS_INSTALL_GUIDE_URL,
} from "@rakazo/contracts";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import * as Updates from "expo-updates";
import { useEffect, useSyncExternalStore } from "react";
import type { AppStateStatus } from "react-native";
import { Alert, AppState, Linking, Platform } from "react-native";
import { configureClientBuild } from "./api";
import { getActiveUiLocale, t } from "./i18n";
import type { SydneyRelease } from "./sydney-release";
import { sydneyReleaseFromManifest, sydneyReleaseNotes } from "./sydney-release";

/** Foreground returns closer together than this reuse the last update check. */
export const FOREGROUND_UPDATE_CHECK_MS = 15 * 60_000;
/**
 * expo-updates' native iOS AppLoader has no per-asset retry and a 60 s URLRequest timeout,
 * but commits every asset that already succeeded before failing. Retrying automatically skips
 * cached assets and resumes only the remaining file(s).
 */
export const UPDATE_FETCH_MAX_ATTEMPTS = 3;
export const UPDATE_FETCH_RETRY_DELAYS_MS = [1_500, 3_000] as const;

type UpdateDownloadState = {
  active: boolean;
  attempt: number;
  totalAttempts: number;
};

const IDLE_DOWNLOAD_STATE: UpdateDownloadState = {
  active: false,
  attempt: 0,
  totalAttempts: UPDATE_FETCH_MAX_ATTEMPTS,
};

let downloadState: UpdateDownloadState = IDLE_DOWNLOAD_STATE;
const downloadListeners = new Set<() => void>();

function setDownloadState(next: UpdateDownloadState) {
  if (
    downloadState.active === next.active &&
    downloadState.attempt === next.attempt &&
    downloadState.totalAttempts === next.totalAttempts
  ) {
    return;
  }
  downloadState = next;
  for (const listener of downloadListeners) listener();
}

function subscribeDownloadState(listener: () => void) {
  downloadListeners.add(listener);
  return () => {
    downloadListeners.delete(listener);
  };
}

function getDownloadState() {
  return downloadState;
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanErrorLine(raw: string): string {
  return raw
    .replace(/https?:\/\/\S+/g, (url) => url.split("?")[0] ?? url)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

/**
 * Extracts a concise, user-safe native error reason for display in failure alerts.
 * expo-updates often rejects fetchUpdateAsync with a generic "Failed to load all assets" while
 * writing the specific URLSession / timeout / HTTP / BSPatch cause into its native log ring.
 */
async function readNativeUpdateErrorDetail(error: unknown): Promise<string | null> {
  const direct =
    error instanceof Error
      ? cleanErrorLine(error.message)
      : typeof error === "string"
        ? cleanErrorLine(error)
        : "";
  let logged = "";
  try {
    if (typeof Updates.readLogEntriesAsync === "function") {
      const entries = await Updates.readLogEntriesAsync(120_000);
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (!entry || (entry.level !== "error" && entry.level !== "fatal")) continue;
        const text = cleanErrorLine(entry.message ?? "");
        if (!text || text === "Failed to load all assets") continue;
        logged = text;
        break;
      }
    }
  } catch {
    // Best-effort diagnostics only.
  }
  if (logged && (!direct || direct === "Failed to load all assets")) return logged;
  return direct || logged || null;
}

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
let fetching: ReturnType<typeof Updates.fetchUpdateAsync> | undefined;

function checkForUpdate() {
  checking ??= Updates.checkForUpdateAsync().finally(() => {
    checking = undefined;
  });
  return checking;
}

export function fetchUpdateWithRetry(options?: {
  maxAttempts?: number;
  retryDelaysMs?: readonly number[];
  wait?: (ms: number) => Promise<void>;
}): ReturnType<typeof Updates.fetchUpdateAsync> {
  if (fetching) return fetching;
  const maxAttempts = Math.max(1, options?.maxAttempts ?? UPDATE_FETCH_MAX_ATTEMPTS);
  const retryDelaysMs = options?.retryDelaysMs ?? UPDATE_FETCH_RETRY_DELAYS_MS;
  const wait = options?.wait ?? waitMs;

  const task = (async () => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      setDownloadState({ active: true, attempt, totalAttempts: maxAttempts });
      try {
        return await Updates.fetchUpdateAsync();
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts) break;
        const delay = retryDelaysMs[attempt - 1] ?? retryDelaysMs.at(-1) ?? 3_000;
        if (delay > 0) await wait(delay);
      }
    }
    throw lastError;
  })().finally(() => {
    fetching = undefined;
    setDownloadState(IDLE_DOWNLOAD_STATE);
  });

  fetching = task;
  return task;
}

export function useClientUpdateState() {
  const {
    availableUpdate,
    downloadedUpdate,
    isUpdateAvailable,
    isUpdatePending,
    isDownloading,
    downloadProgress,
  } = Updates.useUpdates();
  const localDownload = useSyncExternalStore(
    subscribeDownloadState,
    getDownloadState,
    getDownloadState,
  );
  const pending = isUpdatePending ? downloadedUpdate : undefined;
  const latest = isUpdateAvailable ? availableUpdate : pending;
  const update = Updates.isEnabled && latest?.type === "new" ? latest : undefined;
  const progress =
    typeof downloadProgress === "number" && Number.isFinite(downloadProgress)
      ? Math.max(0, Math.min(1, downloadProgress))
      : 0;
  return {
    update,
    downloaded: !!update && update.updateId === pending?.updateId,
    downloading: isDownloading || localDownload.active,
    progress,
    attempt: localDownload.attempt,
    totalAttempts: localDownload.totalAttempts,
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
      const result = await fetchUpdateWithRetry();
      if (!result.isNew) throw new Error("No update downloaded");
      release = sydneyReleaseFromManifest(result.manifest);
    } catch (error) {
      const detail = await readNativeUpdateErrorDetail(error);
      closeOptionalUpdate();
      const hint = t("Keep the app open on a stable connection, then try again.");
      Alert.alert(
        t("Could not download the update. Try again later."),
        detail ? `${hint}\n\n${detail}` : hint,
        [
          { text: t("Not Now"), style: "cancel" },
          {
            text: t("Try again"),
            onPress: () => {
              if (optionalUpdateOpen || prompting) return;
              optionalUpdateOpen = true;
              void downloadOptionalUpdate(update, false);
            },
          },
        ],
      );
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

/** Apply an over-the-air update now if one exists, with installation links for other builds. */
export async function applyRequiredUpdate(): Promise<void> {
  try {
    if (
      Updates.isEnabled &&
      (await checkForUpdate()).isAvailable &&
      (await fetchUpdateWithRetry()).isNew
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
  await Linking.openURL(Platform.OS === "ios" ? IOS_INSTALL_GUIDE_URL : CLIENT_RELEASES_URL).catch(
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
