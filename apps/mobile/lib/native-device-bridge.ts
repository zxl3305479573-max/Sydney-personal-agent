import type { MobileBridgeSnapshot } from "@rakazo/contracts";

export type NativeBridgeDomain = "calendar" | "reminders" | "contacts" | "clipboard";
export type NativeBridgeAuthStatus =
  | "authorized"
  | "denied"
  | "restricted"
  | "notDetermined"
  | "unavailable";

export type NativeBridgeAuthStatuses = Record<NativeBridgeDomain, NativeBridgeAuthStatus>;

type SydneyDeviceBridgeNativeModule = {
  isAvailable(): boolean;
  getAuthorizationStatuses(): Partial<Record<NativeBridgeDomain, string>>;
  requestPermission(domain: NativeBridgeDomain): Promise<string>;
  listCalendarEvents(
    daysBack: number | null,
    daysAhead: number | null,
    limit: number | null,
  ): Promise<{
    authorizationStatus?: string;
    events?: Array<{
      id: string;
      title: string;
      startAt: string;
      endAt: string;
      allDay?: boolean;
      location?: string;
      calendarTitle?: string;
      notes?: string;
    }>;
  }>;
  createCalendarEvent(
    title: string,
    startAt: string,
    endAt: string,
    allDay: boolean | null,
    location: string | null,
    notes: string | null,
  ): Promise<{ ok?: boolean; id?: string }>;
  listReminders(limit: number | null): Promise<{
    authorizationStatus?: string;
    items?: Array<{
      id: string;
      title: string;
      dueAt?: string | null;
      completed: boolean;
      priority?: number;
      listTitle?: string;
      notes?: string;
    }>;
  }>;
  createReminder(
    title: string,
    dueAt: string | null,
    notes: string | null,
    priority: number | null,
  ): Promise<{ ok?: boolean; id?: string }>;
  listContacts(limit: number | null): Promise<{
    authorizationStatus?: string;
    totalCount?: number;
    items?: Array<{
      id: string;
      name: string;
      phones: string[];
      emails: string[];
      organization?: string;
    }>;
  }>;
  readClipboard(): Promise<{
    hasText?: boolean;
    textPreview?: string;
    updatedAt?: number;
  }>;
  writeClipboard(text: string): Promise<{ ok?: boolean }>;
};

let nativeOverride: SydneyDeviceBridgeNativeModule | null | undefined;

function nativeModule(): SydneyDeviceBridgeNativeModule | null {
  if (nativeOverride !== undefined) return nativeOverride;
  const expoGlobal = (globalThis as { expo?: { modules?: Record<string, unknown> } }).expo;
  const mod = expoGlobal?.modules?.SydneyDeviceBridge as SydneyDeviceBridgeNativeModule | undefined;
  if (mod && typeof mod.getAuthorizationStatuses === "function") return mod;
  return null;
}

function normalizeStatus(raw: unknown): NativeBridgeAuthStatus {
  if (
    raw === "authorized" ||
    raw === "denied" ||
    raw === "restricted" ||
    raw === "notDetermined" ||
    raw === "unavailable"
  ) {
    return raw;
  }
  return "unavailable";
}

export function isNativeDeviceBridgeAvailable(): boolean {
  const mod = nativeModule();
  if (!mod) return false;
  try {
    return Boolean(mod.isAvailable());
  } catch {
    return false;
  }
}

export function getNativeDeviceBridgeStatuses(): NativeBridgeAuthStatuses {
  const mod = nativeModule();
  if (!mod) {
    return {
      calendar: "unavailable",
      reminders: "unavailable",
      contacts: "unavailable",
      clipboard: "unavailable",
    };
  }
  try {
    const raw = mod.getAuthorizationStatuses();
    return {
      calendar: normalizeStatus(raw.calendar),
      reminders: normalizeStatus(raw.reminders),
      contacts: normalizeStatus(raw.contacts),
      clipboard: normalizeStatus(raw.clipboard),
    };
  } catch {
    return {
      calendar: "unavailable",
      reminders: "unavailable",
      contacts: "unavailable",
      clipboard: "unavailable",
    };
  }
}

export async function requestNativeBridgePermission(
  domain: NativeBridgeDomain,
): Promise<NativeBridgeAuthStatus> {
  const mod = nativeModule();
  if (!mod) return "unavailable";
  try {
    return normalizeStatus(await mod.requestPermission(domain));
  } catch {
    return "unavailable";
  }
}

export async function readNativeCalendarSnapshot(): Promise<
  MobileBridgeSnapshot["calendar"] | undefined
> {
  const mod = nativeModule();
  if (!mod) return undefined;
  try {
    const res = await mod.listCalendarEvents(1, 14, 50);
    return {
      authorizationStatus: normalizeStatus(res.authorizationStatus),
      syncedAt: Date.now(),
      events: Array.isArray(res.events) ? res.events.slice(0, 60) : [],
    };
  } catch {
    return undefined;
  }
}

export async function createNativeCalendarEvent(input: {
  title: string;
  startAt: string;
  endAt: string;
  allDay?: boolean;
  location?: string;
  notes?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const mod = nativeModule();
  if (!mod) return { ok: false, error: "当前安装包未包含原生 iOS 日历模块，需安装新版 IPA。" };
  try {
    await mod.createCalendarEvent(
      input.title,
      input.startAt,
      input.endAt,
      input.allDay ?? false,
      input.location ?? null,
      input.notes ?? null,
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function readNativeRemindersSnapshot(): Promise<
  MobileBridgeSnapshot["reminders"] | undefined
> {
  const mod = nativeModule();
  if (!mod) return undefined;
  try {
    const res = await mod.listReminders(50);
    return {
      authorizationStatus: normalizeStatus(res.authorizationStatus),
      syncedAt: Date.now(),
      items: Array.isArray(res.items) ? res.items.slice(0, 60) : [],
    };
  } catch {
    return undefined;
  }
}

export async function createNativeReminder(input: {
  title: string;
  dueAt?: string;
  notes?: string;
  priority?: number;
}): Promise<{ ok: boolean; error?: string }> {
  const mod = nativeModule();
  if (!mod) return { ok: false, error: "当前安装包未包含原生 iOS 提醒事项模块，需安装新版 IPA。" };
  try {
    await mod.createReminder(
      input.title,
      input.dueAt ?? null,
      input.notes ?? null,
      input.priority ?? null,
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function readNativeContactsSnapshot(): Promise<
  MobileBridgeSnapshot["contacts"] | undefined
> {
  const mod = nativeModule();
  if (!mod) return undefined;
  try {
    const res = await mod.listContacts(250);
    return {
      authorizationStatus: normalizeStatus(res.authorizationStatus),
      syncedAt: Date.now(),
      totalCount: typeof res.totalCount === "number" ? res.totalCount : (res.items?.length ?? 0),
      items: Array.isArray(res.items) ? res.items.slice(0, 300) : [],
    };
  } catch {
    return undefined;
  }
}

export async function readNativeClipboardSnapshot(): Promise<
  MobileBridgeSnapshot["clipboard"] | undefined
> {
  const mod = nativeModule();
  if (!mod) return undefined;
  try {
    const res = await mod.readClipboard();
    return {
      hasText: Boolean(res.hasText),
      textPreview: typeof res.textPreview === "string" ? res.textPreview.slice(0, 4000) : undefined,
      updatedAt: typeof res.updatedAt === "number" ? res.updatedAt : Date.now(),
    };
  } catch {
    return undefined;
  }
}

export async function writeNativeClipboard(text: string): Promise<{ ok: boolean; error?: string }> {
  const mod = nativeModule();
  if (!mod) return { ok: false, error: "当前安装包未包含原生 iOS 剪贴板模块，需安装新版 IPA。" };
  try {
    await mod.writeClipboard(text.slice(0, 4000));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function setNativeDeviceBridgeModuleForTest(
  mock: SydneyDeviceBridgeNativeModule | null | undefined,
): void {
  nativeOverride = mock;
}
