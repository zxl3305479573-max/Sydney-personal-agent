import type {
  MobileAppActionBlock,
  MobileAppActionRecord,
  MobileBridgePermissions,
  MobileBridgePermissionsPatch,
  MobileBridgeSnapshot,
  MobileBridgeState,
} from "@rakazo/contracts";
import {
  DEFAULT_MOBILE_BRIDGE_PERMISSIONS,
  filterMobileSnapshotByPermissions,
  isMobilePermissionEnabled,
} from "@rakazo/contracts";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { openInAmapNavigation } from "./amap-navigation";
import { loadSessionToken, rpc, selectedSpaceId } from "./api";
import { getAppVersionInfo } from "./app-version";
import {
  getActiveCompanionSession,
  getCachedCompanionPreferences,
  getCompanionSessionState,
  startUnifiedCompanion,
  stopUnifiedCompanion,
  subscribeCompanionSessionState,
  switchUnifiedCompanionBot,
} from "./companion-session";
import { getCachedHomeWeather } from "./home-weather";
import { getCachedUserLocation, loadSavedMapLocation, subscribeUserLocation } from "./map-location";
import { loadRecentMapDestinations } from "./map-search";
import {
  createNativeCalendarEvent,
  createNativeReminder,
  isNativeDeviceBridgeAvailable,
  readNativeCalendarSnapshot,
  readNativeClipboardSnapshot,
  readNativeContactsSnapshot,
  readNativeRemindersSnapshot,
  writeNativeClipboard,
} from "./native-device-bridge";
import { getCachedNotificationPreferences } from "./notification-preferences-state";
import { closeSettingsSheet } from "./settings-sheet";

const FOREGROUND_AUTO_EXECUTE_WINDOW_MS = 60_000;
const FOREGROUND_POLL_MS = 8_000;
const SYNC_THROTTLE_MS = 12_000;

export type MobileActionExecutionResult = {
  ok: boolean;
  status: "executed" | "failed" | "skipped";
  message: string;
};

type RouterLike = { push: (href: Href) => void };

let cachedState: MobileBridgeState = {
  permissions: { ...DEFAULT_MOBILE_BRIDGE_PERMISSIONS },
  snapshot: {},
  pendingActions: [],
  updatedAt: null,
};
let lastSyncedAt = 0;
let syncInFlight: Promise<MobileBridgeState | null> | null = null;
const executedActionIds = new Set<string>();
const stateListeners = new Set<() => void>();
const executedListeners = new Set<() => void>();

function notifyStateListeners(): void {
  for (const listener of stateListeners) listener();
}

function notifyExecutedListeners(): void {
  for (const listener of executedListeners) listener();
}

export function getCachedMobileBridgeState(): MobileBridgeState {
  return cachedState;
}

export function subscribeMobileBridgeState(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

export function isMobileActionExecuted(actionId: string): boolean {
  return executedActionIds.has(actionId);
}

export function subscribeMobileActionExecution(listener: () => void): () => void {
  executedListeners.add(listener);
  return () => executedListeners.delete(listener);
}

function setCachedState(next: MobileBridgeState): void {
  cachedState = next;
  notifyStateListeners();
}

export async function loadMobileBridgeState(): Promise<MobileBridgeState | null> {
  const token = await loadSessionToken().catch(() => null);
  if (!token) return null;
  try {
    const state = await rpc("mobileBridge/get", undefined, { skipSpaceAuthRecovery: true });
    setCachedState(state);
    return state;
  } catch {
    return null;
  }
}

export async function updateMobileBridgePermissions(
  patch: MobileBridgePermissionsPatch,
): Promise<MobileBridgeState> {
  const updated = await rpc("mobileBridge/updatePermissions", patch);
  setCachedState(updated);
  return updated;
}

export async function collectMobileBridgeSnapshot(
  permissions: MobileBridgePermissions,
  options?: { includeNative?: boolean },
): Promise<MobileBridgeSnapshot> {
  if (!permissions.enabled) return {};
  const now = Date.now();
  const appVersion = getAppVersionInfo().release?.version ?? getAppVersionInfo().nativeLabel;
  const platform: "ios" | "android" | "web" =
    Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";
  const snapshot: MobileBridgeSnapshot = {
    device: {
      platform,
      osVersion: String(Platform.Version ?? ""),
      appVersion: appVersion ?? undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      nativeBridgeAvailable: isNativeDeviceBridgeAvailable(),
      capturedAt: now,
    },
  };

  if (permissions.location) {
    const location = getCachedUserLocation() ?? (await loadSavedMapLocation().catch(() => null));
    const recent = await loadRecentMapDestinations().catch(() => []);
    if (location) {
      snapshot.location = {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracyMeters: location.accuracyMeters,
        city: location.city,
        region: location.region,
        label: location.label,
        source: location.source,
        updatedAt: location.updatedAt,
        recentDestinations: recent.slice(0, 8),
      };
    }
  }

  if (permissions.weather) {
    const weather = getCachedHomeWeather();
    if (weather) {
      snapshot.weather = {
        temperatureC: weather.temperatureC,
        condition: weather.condition,
        isDay: weather.isDay,
        fetchedAt: weather.fetchedAt,
        locationLabel: weather.locationLabel ?? null,
        locationSource: weather.locationSource,
        apparentTemperatureC: weather.apparentTemperatureC ?? null,
        humidityPercent: weather.humidityPercent ?? null,
        windSpeedKmh: weather.windSpeedKmh ?? null,
        highC: weather.highC ?? null,
        lowC: weather.lowC ?? null,
        hourly: weather.hourly?.slice(0, 12),
        daily: weather.daily?.slice(0, 7),
      };
    }
  }

  if (permissions.companion) {
    const active = getActiveCompanionSession();
    const prefs = getCachedCompanionPreferences();
    const runtime = getCompanionSessionState().runtime;
    snapshot.companion = {
      active: Boolean(active),
      mode: active ? active.mode : "off",
      botId: active?.botId ?? null,
      botName: active?.botName ?? null,
      showReply: prefs.showReply,
      autoSpeak: prefs.speakReplies,
      status: runtime?.detailStatus ?? null,
      updatedAt: now,
    };
  }

  if (permissions.appNavigation) {
    const notif = getCachedNotificationPreferences();
    snapshot.notifications = {
      enabled: notif.enabled,
      sound: notif.sound,
      preview: notif.messages,
    };
  }

  if (options?.includeNative !== false && isNativeDeviceBridgeAvailable()) {
    const [calendar, reminders, contacts, clipboard] = await Promise.all([
      permissions.calendar ? readNativeCalendarSnapshot() : Promise.resolve(undefined),
      permissions.reminders ? readNativeRemindersSnapshot() : Promise.resolve(undefined),
      permissions.contacts ? readNativeContactsSnapshot() : Promise.resolve(undefined),
      permissions.clipboard ? readNativeClipboardSnapshot() : Promise.resolve(undefined),
    ]);
    if (calendar) snapshot.calendar = calendar;
    if (reminders) snapshot.reminders = reminders;
    if (contacts) snapshot.contacts = contacts;
    if (clipboard) snapshot.clipboard = clipboard;
  }

  return filterMobileSnapshotByPermissions(snapshot, permissions);
}

export async function syncMobileBridgeNow(options?: {
  force?: boolean;
  includeNative?: boolean;
}): Promise<MobileBridgeState | null> {
  const now = Date.now();
  if (!options?.force && now - lastSyncedAt < SYNC_THROTTLE_MS) {
    return cachedState;
  }
  if (syncInFlight) return syncInFlight;
  const run = async (): Promise<MobileBridgeState | null> => {
    const token = await loadSessionToken().catch(() => null);
    if (!token) return null;
    const latest = (await loadMobileBridgeState()) ?? cachedState;
    if (!latest.permissions.enabled) {
      lastSyncedAt = Date.now();
      return latest;
    }
    const snapshot = await collectMobileBridgeSnapshot(latest.permissions, {
      includeNative: options?.includeNative,
    });
    const synced = await rpc("mobileBridge/syncSnapshot", snapshot, {
      skipSpaceAuthRecovery: true,
    });
    lastSyncedAt = Date.now();
    setCachedState(synced);
    return synced;
  };
  syncInFlight = run()
    .catch(() => null)
    .finally(() => {
      syncInFlight = null;
    });
  return syncInFlight;
}

function actionPermissionKey(
  actionKind: MobileAppActionBlock["payload"]["actionKind"],
): "mapAndAmap" | "appNavigation" | "companion" | "calendar" | "reminders" | "clipboard" {
  switch (actionKind) {
    case "open_amap_navigation":
      return "mapAndAmap";
    case "open_screen":
      return "appNavigation";
    case "control_companion":
      return "companion";
    case "create_calendar_event":
      return "calendar";
    case "create_reminder":
      return "reminders";
    case "set_clipboard":
      return "clipboard";
  }
}

export async function executeMobileAppAction(
  action: Pick<MobileAppActionRecord, "actionId" | "payload">,
  options: { router?: RouterLike; acknowledge?: boolean },
): Promise<MobileActionExecutionResult> {
  const { payload } = action;
  const requiredKey = actionPermissionKey(payload.actionKind);
  if (!isMobilePermissionEnabled(cachedState.permissions, requiredKey)) {
    return {
      ok: false,
      status: "skipped",
      message: "该项 Bot 应用权限已关闭，请先在「设置 → Bot 应用权限」开启。",
    };
  }

  let result: MobileActionExecutionResult;
  try {
    switch (payload.actionKind) {
      case "open_amap_navigation": {
        const outcome = await openInAmapNavigation({
          destination: {
            name: payload.destinationName,
            address: payload.destinationAddress,
            latitude: payload.destinationLatitude,
            longitude: payload.destinationLongitude,
          },
          origin:
            payload.originLatitude !== undefined && payload.originLongitude !== undefined
              ? {
                  name: payload.originName ?? "我的位置",
                  latitude: payload.originLatitude,
                  longitude: payload.originLongitude,
                }
              : undefined,
          mode: payload.mode,
        });
        result =
          outcome.opened === "failed"
            ? { ok: false, status: "failed", message: outcome.error || "无法拉起高德地图" }
            : {
                ok: true,
                status: "executed",
                message:
                  outcome.opened === "amap-app" ? "已拉起高德地图导航" : "已打开高德网页导航",
              };
        break;
      }
      case "open_screen": {
        closeSettingsSheet();
        if (payload.route === "/computer" && payload.botId) {
          options.router?.push({
            pathname: "/computer",
            params: { botId: payload.botId, ...(payload.botName ? { name: payload.botName } : {}) },
          } as Href);
        } else {
          options.router?.push(payload.route as Href);
        }
        result = { ok: true, status: "executed", message: "已打开页面" };
        break;
      }
      case "control_companion": {
        if (payload.operation === "stop") {
          await stopUnifiedCompanion();
          result = { ok: true, status: "executed", message: "已关闭后台陪伴" };
        } else {
          const targetBotId = payload.botId;
          const spaceId = selectedSpaceId();
          if (!targetBotId || !spaceId) {
            result = { ok: false, status: "failed", message: "缺少目标伙伴或空间信息" };
          } else {
            const input = {
              botId: targetBotId,
              botName: payload.botName ?? "Sydney",
              botColor: "#2E2B27",
              spaceId,
            };
            const current = getActiveCompanionSession();
            if (payload.operation === "switch" && current) {
              await switchUnifiedCompanionBot(input);
            } else {
              await startUnifiedCompanion(input);
            }
            result = { ok: true, status: "executed", message: `已开启 ${input.botName} 后台陪伴` };
          }
        }
        break;
      }
      case "create_calendar_event": {
        const created = await createNativeCalendarEvent(payload);
        result = created.ok
          ? { ok: true, status: "executed", message: "已写入 iPhone 日历" }
          : { ok: false, status: "failed", message: created.error ?? "写入日历失败" };
        break;
      }
      case "create_reminder": {
        const created = await createNativeReminder(payload);
        result = created.ok
          ? { ok: true, status: "executed", message: "已添加到 iPhone 提醒事项" }
          : { ok: false, status: "failed", message: created.error ?? "创建提醒事项失败" };
        break;
      }
      case "set_clipboard": {
        const wrote = await writeNativeClipboard(payload.text);
        result = wrote.ok
          ? { ok: true, status: "executed", message: "已复制到剪贴板" }
          : { ok: false, status: "failed", message: wrote.error ?? "写入剪贴板失败" };
        break;
      }
    }
  } catch (error) {
    result = {
      ok: false,
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  if (result.ok) {
    executedActionIds.add(action.actionId);
    notifyExecutedListeners();
  }
  if (options.acknowledge !== false && result.status !== "skipped") {
    void rpc(
      "mobileBridge/ackAction",
      {
        actionId: action.actionId,
        status: result.status,
        detail: result.message.slice(0, 240),
      },
      { skipSpaceAuthRecovery: true },
    ).catch(() => undefined);
  }
  return result;
}

export async function maybeAutoExecuteMobileAppAction(
  action: Pick<MobileAppActionRecord, "actionId" | "autoExecute" | "createdAt" | "payload">,
  options: { router?: RouterLike; nowMs?: number },
): Promise<MobileActionExecutionResult | null> {
  if (!action.autoExecute) return null;
  if (!cachedState.permissions.enabled || !cachedState.permissions.foregroundAutoExecute) {
    return null;
  }
  if (AppState.currentState && AppState.currentState !== "active") return null;
  if (executedActionIds.has(action.actionId)) return null;
  const created = Date.parse(action.createdAt);
  const now = options.nowMs ?? Date.now();
  if (!Number.isNaN(created) && now - created > FOREGROUND_AUTO_EXECUTE_WINDOW_MS) {
    return null;
  }
  // Mark optimistically before awaiting so concurrent card + poller paths never run twice.
  executedActionIds.add(action.actionId);
  notifyExecutedListeners();
  const outcome = await executeMobileAppAction(action, {
    router: options.router,
    acknowledge: true,
  });
  if (!outcome.ok) {
    executedActionIds.delete(action.actionId);
    notifyExecutedListeners();
  }
  return outcome;
}

export function useMobileBridgeSync(ready: boolean): void {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (!ready) return;
    let active = true;

    const drainPending = async (state: MobileBridgeState | null) => {
      if (!active || !state?.pendingActions.length) return;
      for (const action of state.pendingActions) {
        if (!active) break;
        await maybeAutoExecuteMobileAppAction(action, { router: routerRef.current });
      }
    };

    const runSync = async (force = false) => {
      const state = await syncMobileBridgeNow({ force, includeNative: true });
      await drainPending(state);
    };

    void runSync(true);

    const appSub = AppState.addEventListener("change", (next) => {
      if (next === "active") void runSync(true);
    });
    const locUnsub = subscribeUserLocation(() => {
      void syncMobileBridgeNow({ force: false, includeNative: false });
    });
    const compUnsub = subscribeCompanionSessionState(() => {
      void syncMobileBridgeNow({ force: false, includeNative: false });
    });
    const poll = setInterval(() => {
      if (AppState.currentState && AppState.currentState !== "active") return;
      void loadMobileBridgeState().then(drainPending);
    }, FOREGROUND_POLL_MS);

    return () => {
      active = false;
      appSub.remove();
      locUnsub();
      compUnsub();
      clearInterval(poll);
    };
  }, [ready]);
}

export function resetMobileBridgeForTest(): void {
  cachedState = {
    permissions: { ...DEFAULT_MOBILE_BRIDGE_PERMISSIONS },
    snapshot: {},
    pendingActions: [],
    updatedAt: null,
  };
  lastSyncedAt = 0;
  syncInFlight = null;
  executedActionIds.clear();
}
