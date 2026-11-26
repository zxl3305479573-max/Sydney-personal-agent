import * as z from "zod";

export const MOBILE_APP_READ_ONLY_TOOL_NAMES = [
  "app_get_context",
  "app_get_location",
  "app_get_weather",
  "app_map_search",
  "app_map_route",
  "app_get_calendar",
  "app_get_reminders",
  "app_search_contacts",
  "app_get_clipboard",
] as const;

export const MOBILE_APP_UI_ACTION_TOOL_NAMES = [
  "app_open_amap_navigation",
  "app_open_screen",
  "app_control_companion",
] as const;

export const MOBILE_APP_WRITE_ACTION_TOOL_NAMES = [
  "app_create_calendar_event",
  "app_create_reminder",
  "app_set_clipboard",
] as const;

export const MOBILE_APP_TOOL_NAMES = [
  ...MOBILE_APP_READ_ONLY_TOOL_NAMES,
  ...MOBILE_APP_UI_ACTION_TOOL_NAMES,
  ...MOBILE_APP_WRITE_ACTION_TOOL_NAMES,
] as const;

export type MobileAppToolName = (typeof MOBILE_APP_TOOL_NAMES)[number];

export const MobileBridgePermissionsSchema = z.object({
  /** Account-wide master toggle for allowing the user's own bots to access mobile app capabilities. */
  enabled: z.boolean().default(true),
  location: z.boolean().default(true),
  weather: z.boolean().default(true),
  mapAndAmap: z.boolean().default(true),
  companion: z.boolean().default(true),
  appNavigation: z.boolean().default(true),
  calendar: z.boolean().default(true),
  reminders: z.boolean().default(true),
  contacts: z.boolean().default(true),
  clipboard: z.boolean().default(true),
  /** When true, fresh app actions auto-run while the mobile app is in the foreground. */
  foregroundAutoExecute: z.boolean().default(true),
});

export type MobileBridgePermissions = z.infer<typeof MobileBridgePermissionsSchema>;

export const MobileBridgePermissionsPatchSchema = MobileBridgePermissionsSchema.partial();
export type MobileBridgePermissionsPatch = z.infer<typeof MobileBridgePermissionsPatchSchema>;

export const DEFAULT_MOBILE_BRIDGE_PERMISSIONS: MobileBridgePermissions = {
  enabled: true,
  location: true,
  weather: true,
  mapAndAmap: true,
  companion: true,
  appNavigation: true,
  calendar: true,
  reminders: true,
  contacts: true,
  clipboard: true,
  foregroundAutoExecute: true,
};

export const MobileLocationSourceSchema = z.enum(["gps", "manual", "ip"]);
export const MobileTravelModeSchema = z.enum(["driving", "transit", "walking", "riding"]);
export const MobileWeatherConditionSchema = z.enum(["sunny", "cloudy", "rainy", "snowy"]);
export const MobileNativeAuthStatusSchema = z.enum([
  "authorized",
  "denied",
  "restricted",
  "notDetermined",
  "unavailable",
]);

export const MobileRecentDestinationSchema = z.object({
  name: z.string().trim().min(1).max(160),
  address: z.string().trim().max(240).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const MobileLocationSnapshotSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().min(0).max(500_000).optional(),
  city: z.string().trim().max(100).optional(),
  district: z.string().trim().max(100).optional(),
  region: z.string().trim().max(100).optional(),
  label: z.string().trim().max(200).optional(),
  source: MobileLocationSourceSchema,
  updatedAt: z.number().int().nonnegative(),
  recentDestinations: z.array(MobileRecentDestinationSchema).max(10).optional(),
});

export const MobileWeatherHourlySnapshotSchema = z.object({
  timeIso: z.string().max(40),
  hourLabel: z.string().max(20),
  temperatureC: z.number().min(-100).max(100),
  condition: MobileWeatherConditionSchema,
  isDay: z.boolean(),
});

export const MobileWeatherDailySnapshotSchema = z.object({
  dateIso: z.string().max(20),
  highC: z.number().min(-100).max(100),
  lowC: z.number().min(-100).max(100),
  condition: MobileWeatherConditionSchema,
});

export const MobileWeatherSnapshotSchema = z.object({
  temperatureC: z.number().min(-100).max(100),
  condition: MobileWeatherConditionSchema,
  isDay: z.boolean(),
  fetchedAt: z.number().int().nonnegative(),
  locationLabel: z.string().max(200).nullable().optional(),
  locationSource: MobileLocationSourceSchema.optional(),
  apparentTemperatureC: z.number().min(-100).max(100).nullable().optional(),
  humidityPercent: z.number().min(0).max(100).nullable().optional(),
  windSpeedKmh: z.number().min(0).max(500).nullable().optional(),
  highC: z.number().min(-100).max(100).nullable().optional(),
  lowC: z.number().min(-100).max(100).nullable().optional(),
  hourly: z.array(MobileWeatherHourlySnapshotSchema).max(24).optional(),
  daily: z.array(MobileWeatherDailySnapshotSchema).max(10).optional(),
});

export const MobileCompanionSnapshotSchema = z.object({
  active: z.boolean(),
  mode: z.enum(["live-activity", "in-app", "off"]).optional(),
  botId: z.string().max(128).nullable().optional(),
  botName: z.string().max(120).nullable().optional(),
  showReply: z.boolean().optional(),
  autoSpeak: z.boolean().optional(),
  status: z.string().max(64).nullable().optional(),
  updatedAt: z.number().int().nonnegative(),
});

export const MobileNotificationsSnapshotSchema = z.object({
  enabled: z.boolean(),
  sound: z.boolean().optional(),
  preview: z.boolean().optional(),
  permissionStatus: z.string().max(40).optional(),
});

export const MobileCalendarEventSchema = z.object({
  id: z.string().max(160),
  title: z.string().max(240),
  startAt: z.string().max(48),
  endAt: z.string().max(48),
  allDay: z.boolean().optional(),
  location: z.string().max(240).optional(),
  calendarTitle: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
});

export const MobileCalendarSnapshotSchema = z.object({
  authorizationStatus: MobileNativeAuthStatusSchema,
  syncedAt: z.number().int().nonnegative(),
  events: z.array(MobileCalendarEventSchema).max(60),
});

export const MobileReminderItemSchema = z.object({
  id: z.string().max(160),
  title: z.string().max(240),
  dueAt: z.string().max(48).nullable().optional(),
  completed: z.boolean(),
  priority: z.number().int().min(0).max(9).optional(),
  listTitle: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
});

export const MobileRemindersSnapshotSchema = z.object({
  authorizationStatus: MobileNativeAuthStatusSchema,
  syncedAt: z.number().int().nonnegative(),
  items: z.array(MobileReminderItemSchema).max(60),
});

export const MobileContactItemSchema = z.object({
  id: z.string().max(160),
  name: z.string().max(160),
  phones: z.array(z.string().max(48)).max(6),
  emails: z.array(z.string().max(160)).max(6),
  organization: z.string().max(160).optional(),
});

export const MobileContactsSnapshotSchema = z.object({
  authorizationStatus: MobileNativeAuthStatusSchema,
  syncedAt: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  items: z.array(MobileContactItemSchema).max(300),
});

export const MobileClipboardSnapshotSchema = z.object({
  hasText: z.boolean(),
  textPreview: z.string().max(4000).optional(),
  updatedAt: z.number().int().nonnegative(),
});

export const MobileDeviceSnapshotSchema = z.object({
  platform: z.enum(["ios", "android", "web"]),
  osVersion: z.string().max(64).optional(),
  appVersion: z.string().max(64).optional(),
  locale: z.string().max(32).optional(),
  timezone: z.string().max(80).optional(),
  nativeBridgeAvailable: z.boolean().optional(),
  capturedAt: z.number().int().nonnegative(),
});

export const MobileBridgeSnapshotSchema = z.object({
  device: MobileDeviceSnapshotSchema.optional(),
  location: MobileLocationSnapshotSchema.optional(),
  weather: MobileWeatherSnapshotSchema.optional(),
  companion: MobileCompanionSnapshotSchema.optional(),
  notifications: MobileNotificationsSnapshotSchema.optional(),
  calendar: MobileCalendarSnapshotSchema.optional(),
  reminders: MobileRemindersSnapshotSchema.optional(),
  contacts: MobileContactsSnapshotSchema.optional(),
  clipboard: MobileClipboardSnapshotSchema.optional(),
});

export type MobileBridgeSnapshot = z.infer<typeof MobileBridgeSnapshotSchema>;

export const MobileAppScreenRouteSchema = z.enum([
  "/map",
  "/weather",
  "/companion",
  "/computer",
  "/(settings)/notifications",
  "/(settings)/bot-permissions",
]);
export type MobileAppScreenRoute = z.infer<typeof MobileAppScreenRouteSchema>;

export const MobileAppActionPayloadSchema = z.discriminatedUnion("actionKind", [
  z.object({
    actionKind: z.literal("open_amap_navigation"),
    destinationName: z.string().min(1).max(160),
    destinationAddress: z.string().max(240).optional(),
    destinationLatitude: z.number().min(-90).max(90).optional(),
    destinationLongitude: z.number().min(-180).max(180).optional(),
    originName: z.string().max(160).optional(),
    originLatitude: z.number().min(-90).max(90).optional(),
    originLongitude: z.number().min(-180).max(180).optional(),
    mode: MobileTravelModeSchema,
    nativeUrlIos: z.string().max(1024),
    nativeUrlAndroid: z.string().max(1024),
    webUrl: z.string().max(1024),
  }),
  z.object({
    actionKind: z.literal("open_screen"),
    route: MobileAppScreenRouteSchema,
    botId: z.string().max(128).optional(),
    botName: z.string().max(120).optional(),
  }),
  z.object({
    actionKind: z.literal("control_companion"),
    operation: z.enum(["start", "stop", "switch"]),
    botId: z.string().max(128).optional(),
    botName: z.string().max(120).optional(),
  }),
  z.object({
    actionKind: z.literal("create_calendar_event"),
    title: z.string().min(1).max(240),
    startAt: z.string().min(1).max(48),
    endAt: z.string().min(1).max(48),
    allDay: z.boolean().optional(),
    location: z.string().max(240).optional(),
    notes: z.string().max(500).optional(),
  }),
  z.object({
    actionKind: z.literal("create_reminder"),
    title: z.string().min(1).max(240),
    dueAt: z.string().max(48).optional(),
    notes: z.string().max(500).optional(),
    priority: z.number().int().min(0).max(9).optional(),
  }),
  z.object({
    actionKind: z.literal("set_clipboard"),
    text: z.string().min(1).max(4000),
  }),
]);

export type MobileAppActionPayload = z.infer<typeof MobileAppActionPayloadSchema>;
export type MobileAppActionKind = MobileAppActionPayload["actionKind"];

export const MobileAppActionRecordSchema = z.object({
  actionId: z.string().min(1).max(128),
  title: z.string().min(1).max(160),
  subtitle: z.string().max(240).optional(),
  autoExecute: z.boolean(),
  createdAt: z.string().max(48),
  botId: z.string().max(128).optional(),
  threadId: z.string().max(128).optional(),
  payload: MobileAppActionPayloadSchema,
});

export type MobileAppActionRecord = z.infer<typeof MobileAppActionRecordSchema>;

export const MobileAppActionBlockSchema = z.object({
  kind: z.literal("app_action"),
  actionId: z.string().min(1).max(128),
  title: z.string().min(1).max(160),
  subtitle: z.string().max(240).optional(),
  autoExecute: z.boolean().default(true),
  createdAt: z.string().max(48),
  payload: MobileAppActionPayloadSchema,
});

export type MobileAppActionBlock = z.infer<typeof MobileAppActionBlockSchema>;

export const MobileBridgeStateSchema = z.object({
  permissions: MobileBridgePermissionsSchema,
  snapshot: MobileBridgeSnapshotSchema,
  pendingActions: z.array(MobileAppActionRecordSchema).max(20),
  updatedAt: z.string().nullable(),
});

export type MobileBridgeState = z.infer<typeof MobileBridgeStateSchema>;

export const MobileBridgeAckActionInputSchema = z.object({
  actionId: z.string().min(1).max(128),
  status: z.enum(["executed", "failed", "dismissed"]),
  detail: z.string().max(240).optional(),
});

export function normalizeMobileBridgePermissions(raw: unknown): MobileBridgePermissions {
  const parsed = MobileBridgePermissionsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { ...DEFAULT_MOBILE_BRIDGE_PERMISSIONS };
}

export function normalizeMobileBridgeSnapshot(raw: unknown): MobileBridgeSnapshot {
  const parsed = MobileBridgeSnapshotSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

export function normalizeMobilePendingActions(raw: unknown): MobileAppActionRecord[] {
  const parsed = z.array(MobileAppActionRecordSchema).safeParse(raw ?? []);
  return parsed.success ? parsed.data.slice(-20) : [];
}

/** Strips every snapshot category that is currently disabled by user permissions. */
export function filterMobileSnapshotByPermissions(
  snapshot: MobileBridgeSnapshot,
  permissions: MobileBridgePermissions,
): MobileBridgeSnapshot {
  if (!permissions.enabled) return {};
  return {
    ...(snapshot.device ? { device: snapshot.device } : {}),
    ...(permissions.location && snapshot.location ? { location: snapshot.location } : {}),
    ...(permissions.weather && snapshot.weather ? { weather: snapshot.weather } : {}),
    ...(permissions.companion && snapshot.companion ? { companion: snapshot.companion } : {}),
    ...(permissions.appNavigation && snapshot.notifications
      ? { notifications: snapshot.notifications }
      : {}),
    ...(permissions.calendar && snapshot.calendar ? { calendar: snapshot.calendar } : {}),
    ...(permissions.reminders && snapshot.reminders ? { reminders: snapshot.reminders } : {}),
    ...(permissions.contacts && snapshot.contacts ? { contacts: snapshot.contacts } : {}),
    ...(permissions.clipboard && snapshot.clipboard ? { clipboard: snapshot.clipboard } : {}),
  };
}

export type MobileBridgePermissionKey = Exclude<
  keyof MobileBridgePermissions,
  "enabled" | "foregroundAutoExecute"
>;

export function isMobilePermissionEnabled(
  permissions: MobileBridgePermissions,
  key: MobileBridgePermissionKey,
): boolean {
  return Boolean(permissions.enabled && permissions[key]);
}
