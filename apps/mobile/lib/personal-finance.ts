import type {
  FinanceBill,
  FinanceMonthSummary,
  PaymentMethodSensitivePayload,
  PaymentMethodSummary,
  PersonalFinanceOverview,
  UpsertFinanceBillInput,
  UpsertPaymentMethodInput,
} from "@rakazo/contracts";
import {
  compactPaymentSensitivePayload,
  currentMonthKey,
  maskPaymentAccountNumber,
  PaymentMethodSensitivePayloadSchema,
  summarizeFinanceMonth,
} from "@rakazo/contracts";
import { useSyncExternalStore } from "react";
import { loadSessionToken, rpc } from "./api";

export type PersonalFinanceSyncMode = "cloud" | "local";

export type PersonalFinanceState = {
  loaded: boolean;
  syncing: boolean;
  syncMode: PersonalFinanceSyncMode;
  methods: PaymentMethodSummary[];
  bills: FinanceBill[];
  summary: FinanceMonthSummary;
  syncedAt: string | null;
  hideAmounts: boolean;
  error: string | null;
};

type DiskCachePayload = {
  version: 1;
  syncMode: PersonalFinanceSyncMode;
  methods: PaymentMethodSummary[];
  bills: FinanceBill[];
  syncedAt: string | null;
  localSecretIds: string[];
};

const CACHE_DIR = "personal-finance-v1";
const CACHE_FILE = "overview.json";
const SECURE_FALLBACK_KEY = "sydney.pf.cache.v1";
const PRIVACY_KEY = "sydney.pf.hideAmounts.v1";
const LOCAL_SECRET_PREFIX = "sydney.pf.sec.";
const LOCAL_ID_PREFIX = "local_";

function emptySummary(): FinanceMonthSummary {
  return summarizeFinanceMonth([], currentMonthKey());
}

let state: PersonalFinanceState = {
  loaded: false,
  syncing: false,
  syncMode: "cloud",
  methods: [],
  bills: [],
  summary: emptySummary(),
  syncedAt: null,
  hideAmounts: false,
  error: null,
};

let trackedLocalSecretIds = new Set<string>();
let refreshInFlight: Promise<PersonalFinanceState> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // Ignore subscriber errors.
    }
  }
}

function updateState(patch: Partial<PersonalFinanceState>): void {
  const nextMethods = patch.methods ?? state.methods;
  const nextBills = patch.bills ?? state.bills;
  const nextSummary =
    patch.summary ??
    summarizeFinanceMonth(nextBills, currentMonthKey(), {
      methods: nextMethods,
    });
  state = {
    ...state,
    ...patch,
    methods: nextMethods,
    bills: nextBills,
    summary: nextSummary,
  };
  emit();
}

function secretKeyFor(methodId: string): string {
  return `${LOCAL_SECRET_PREFIX}${methodId.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

function isLocalOnlyId(id: string): boolean {
  return id.startsWith(LOCAL_ID_PREFIX);
}

function makeLocalId(prefix: "pm" | "bill"): string {
  return `${LOCAL_ID_PREFIX}${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function readSecureItem(key: string): Promise<string | null> {
  try {
    const SecureStore = await import("expo-secure-store");
    if (typeof SecureStore.getItemAsync === "function") {
      return await SecureStore.getItemAsync(key);
    }
  } catch {
    // Non-native / test runtime.
  }
  return null;
}

async function writeSecureItem(key: string, value: string): Promise<boolean> {
  try {
    const SecureStore = await import("expo-secure-store");
    if (typeof SecureStore.setItemAsync === "function") {
      await SecureStore.setItemAsync(key, value);
      return true;
    }
  } catch {
    // Non-native / test runtime.
  }
  return false;
}

async function deleteSecureItem(key: string): Promise<void> {
  try {
    const SecureStore = await import("expo-secure-store");
    if (typeof SecureStore.deleteItemAsync === "function") {
      await SecureStore.deleteItemAsync(key);
    }
  } catch {
    // Non-native / test runtime.
  }
}

async function readDiskCache(): Promise<DiskCachePayload | null> {
  try {
    const fs = await import("expo-file-system");
    if (fs.Directory && fs.File && fs.Paths?.document) {
      const dir = new fs.Directory(fs.Paths.document, CACHE_DIR);
      const file = new fs.File(dir, CACHE_FILE);
      if (file.exists) {
        const parsed = JSON.parse(file.textSync()) as DiskCachePayload;
        if (parsed?.version === 1 && Array.isArray(parsed.methods) && Array.isArray(parsed.bills)) {
          return parsed;
        }
      }
    }
  } catch {
    // Fall back to SecureStore when expo-file-system is unavailable.
  }
  const raw = await readSecureItem(SECURE_FALLBACK_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DiskCachePayload;
    if (parsed?.version === 1 && Array.isArray(parsed.methods) && Array.isArray(parsed.bills)) {
      return parsed;
    }
  } catch {
    // Ignore corrupted cache.
  }
  return null;
}

async function writeDiskCache(): Promise<void> {
  const payload: DiskCachePayload = {
    version: 1,
    syncMode: state.syncMode,
    methods: state.methods,
    bills: state.bills,
    syncedAt: state.syncedAt,
    localSecretIds: [...trackedLocalSecretIds],
  };
  const serialized = JSON.stringify(payload);
  try {
    const fs = await import("expo-file-system");
    if (fs.Directory && fs.File && fs.Paths?.document) {
      const dir = new fs.Directory(fs.Paths.document, CACHE_DIR);
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
      const file = new fs.File(dir, CACHE_FILE);
      file.write(serialized);
      return;
    }
  } catch {
    // Fall back to SecureStore if small enough.
  }
  if (serialized.length < 1800) {
    await writeSecureItem(SECURE_FALLBACK_KEY, serialized);
  }
}

async function saveLocalSecret(
  methodId: string,
  payload: PaymentMethodSensitivePayload | null,
): Promise<boolean> {
  const key = secretKeyFor(methodId);
  if (!payload) {
    trackedLocalSecretIds.delete(methodId);
    await deleteSecureItem(key);
    return false;
  }
  const ok = await writeSecureItem(key, JSON.stringify(payload));
  if (ok) trackedLocalSecretIds.add(methodId);
  return ok;
}

async function readLocalSecret(methodId: string): Promise<PaymentMethodSensitivePayload | null> {
  const raw = await readSecureItem(secretKeyFor(methodId));
  if (!raw) return null;
  try {
    const parsed = PaymentMethodSensitivePayloadSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Detects when the server has not yet deployed personalFinance RPC routes or is unreachable. */
export function shouldFallbackToLocalFinance(error: unknown): boolean {
  if (!error) return false;
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : Number.NaN;
  if (status === 404 || status === 501 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  return (
    message.includes("not found") ||
    message.includes("404") ||
    message.includes("procedure did not match") ||
    message.includes("network") ||
    message.includes("unreachable") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("failed to fetch") ||
    message.includes("could not reach")
  );
}

export function getPersonalFinanceState(): PersonalFinanceState {
  return state;
}

export function subscribePersonalFinance(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePersonalFinance(): PersonalFinanceState {
  return useSyncExternalStore(
    subscribePersonalFinance,
    getPersonalFinanceState,
    getPersonalFinanceState,
  );
}

export async function loadPersonalFinanceCache(): Promise<PersonalFinanceState> {
  const [cached, hideRaw] = await Promise.all([readDiskCache(), readSecureItem(PRIVACY_KEY)]);
  const hideAmounts = hideRaw === "1";
  if (cached) {
    trackedLocalSecretIds = new Set(cached.localSecretIds ?? []);
    updateState({
      loaded: true,
      syncMode: cached.syncMode,
      methods: cached.methods,
      bills: cached.bills,
      syncedAt: cached.syncedAt,
      hideAmounts,
    });
  } else {
    updateState({ loaded: true, hideAmounts });
  }
  return state;
}

export async function setFinanceHideAmounts(hideAmounts: boolean): Promise<void> {
  updateState({ hideAmounts });
  await writeSecureItem(PRIVACY_KEY, hideAmounts ? "1" : "0");
}

async function migratePendingLocalRecordsToCloud(): Promise<void> {
  const localMethods = state.methods.filter((m) => isLocalOnlyId(m.id));
  const localBills = state.bills.filter((b) => isLocalOnlyId(b.id));
  if (localMethods.length === 0 && localBills.length === 0) return;

  const methodsPayload: UpsertPaymentMethodInput[] = await Promise.all(
    localMethods.map(async (method) => {
      const sensitive = method.hasSensitiveDetails ? await readLocalSecret(method.id) : null;
      return {
        id: method.id,
        kind: method.kind,
        label: method.label,
        institution: method.institution,
        accountMask: method.accountMask,
        last4: method.last4,
        holderName: method.holderName,
        currency: method.currency,
        billingDay: method.billingDay,
        repaymentDay: method.repaymentDay,
        creditLimitCents: method.creditLimitCents,
        balanceCents: method.balanceCents,
        isDefault: method.isDefault,
        accentColor: method.accentColor,
        ...(sensitive ? { sensitive } : {}),
      };
    }),
  );

  const billsPayload: UpsertFinanceBillInput[] = localBills.map((bill) => ({
    id: bill.id,
    direction: bill.direction,
    amountCents: bill.amountCents,
    currency: bill.currency,
    category: bill.category,
    title: bill.title,
    note: bill.note,
    occurredAt: bill.occurredAt,
    paymentMethodId: bill.paymentMethodId,
    paymentMethodLabel: bill.paymentMethodLabel,
    status: bill.status,
  }));

  await rpc(
    "personalFinance/importLocal",
    { methods: methodsPayload, bills: billsPayload },
    { skipSpaceAuthRecovery: true },
  );

  // Clean up local Keychain copies once encrypted on the backend.
  for (const method of localMethods) {
    await saveLocalSecret(method.id, null);
  }
}

export async function refreshPersonalFinance(options?: {
  month?: string;
}): Promise<PersonalFinanceState> {
  if (refreshInFlight) return refreshInFlight;
  const run = async (): Promise<PersonalFinanceState> => {
    if (!state.loaded) {
      await loadPersonalFinanceCache();
    }
    const token = await loadSessionToken().catch(() => "");
    if (!token) {
      updateState({ syncing: false, syncMode: "local" });
      return state;
    }
    updateState({ syncing: true, error: null });
    try {
      await migratePendingLocalRecordsToCloud().catch(() => undefined);
      const overview: PersonalFinanceOverview = await rpc(
        "personalFinance/overview",
        options?.month ? { month: options.month, limit: 500 } : { limit: 500 },
        { skipSpaceAuthRecovery: true },
      );
      updateState({
        loaded: true,
        syncing: false,
        syncMode: "cloud",
        methods: overview.methods,
        bills: overview.bills,
        summary: overview.summary,
        syncedAt: overview.syncedAt,
        error: null,
      });
      await writeDiskCache();
      return state;
    } catch (error) {
      if (shouldFallbackToLocalFinance(error)) {
        updateState({
          loaded: true,
          syncing: false,
          syncMode: "local",
          error: null,
        });
        await writeDiskCache();
        return state;
      }
      updateState({
        loaded: true,
        syncing: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return state;
    }
  };
  refreshInFlight = run().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

function sortMethods(methods: PaymentMethodSummary[]): PaymentMethodSummary[] {
  return [...methods].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

function sortBills(bills: FinanceBill[]): FinanceBill[] {
  return [...bills].sort((a, b) => {
    const diff = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
    return diff !== 0 ? diff : Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}

export async function savePaymentMethod(
  input: UpsertPaymentMethodInput,
): Promise<PaymentMethodSummary> {
  const canTryCloud = state.syncMode === "cloud" && (!input.id || !isLocalOnlyId(input.id));
  if (canTryCloud) {
    try {
      const saved = await rpc("personalFinance/upsertMethod", input, {
        skipSpaceAuthRecovery: true,
      });
      const nextMethods = sortMethods([
        ...(saved.isDefault
          ? state.methods.map((m) => (m.id === saved.id ? m : { ...m, isDefault: false }))
          : state.methods
        ).filter((m) => m.id !== saved.id),
        saved,
      ]);
      updateState({ syncMode: "cloud", methods: nextMethods, syncedAt: new Date().toISOString() });
      await writeDiskCache();
      return saved;
    } catch (error) {
      if (!shouldFallbackToLocalFinance(error)) throw error;
    }
  }

  // Offline / local Keychain fallback
  const existing = input.id ? (state.methods.find((m) => m.id === input.id) ?? null) : null;
  const id = existing?.id ?? makeLocalId("pm");
  const now = new Date().toISOString();
  const cleanedSensitive =
    input.sensitive === undefined ? undefined : compactPaymentSensitivePayload(input.sensitive);

  let hasSensitiveDetails = existing?.hasSensitiveDetails ?? false;
  let derivedMask: { accountMask: string | null; last4: string | null } | null = null;
  if (cleanedSensitive !== undefined) {
    if (cleanedSensitive === null) {
      await saveLocalSecret(id, null);
      hasSensitiveDetails = false;
    } else {
      await saveLocalSecret(id, cleanedSensitive);
      hasSensitiveDetails = true;
      if (cleanedSensitive.accountNumber) {
        derivedMask = maskPaymentAccountNumber(cleanedSensitive.accountNumber, input.kind);
      }
    }
  }

  const saved: PaymentMethodSummary = {
    id,
    kind: input.kind,
    label: input.label.trim(),
    institution:
      input.institution !== undefined
        ? input.institution?.trim() || null
        : (existing?.institution ?? null),
    accountMask:
      derivedMask?.accountMask ??
      (input.accountMask !== undefined
        ? input.accountMask?.trim() || null
        : (existing?.accountMask ?? null)),
    last4:
      derivedMask?.last4 ??
      (input.last4 !== undefined ? input.last4?.trim() || null : (existing?.last4 ?? null)),
    holderName:
      input.holderName !== undefined
        ? input.holderName?.trim() || null
        : (existing?.holderName ?? null),
    currency: input.currency ?? existing?.currency ?? "CNY",
    billingDay: input.billingDay !== undefined ? input.billingDay : (existing?.billingDay ?? null),
    repaymentDay:
      input.repaymentDay !== undefined ? input.repaymentDay : (existing?.repaymentDay ?? null),
    creditLimitCents:
      input.creditLimitCents !== undefined
        ? input.creditLimitCents
        : (existing?.creditLimitCents ?? null),
    balanceCents:
      input.balanceCents !== undefined ? input.balanceCents : (existing?.balanceCents ?? null),
    isDefault: input.isDefault ?? existing?.isDefault ?? false,
    accentColor:
      input.accentColor !== undefined ? input.accentColor : (existing?.accentColor ?? null),
    hasSensitiveDetails,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const nextMethods = sortMethods([
    ...(saved.isDefault
      ? state.methods.map((m) => (m.id === saved.id ? m : { ...m, isDefault: false }))
      : state.methods
    ).filter((m) => m.id !== saved.id),
    saved,
  ]);
  updateState({ syncMode: "local", methods: nextMethods, syncedAt: now });
  await writeDiskCache();
  return saved;
}

export async function revealPaymentMethodSecrets(
  methodId: string,
): Promise<PaymentMethodSensitivePayload> {
  if (isLocalOnlyId(methodId) || state.syncMode === "local") {
    const local = await readLocalSecret(methodId);
    if (local) return local;
    if (isLocalOnlyId(methodId)) return {};
  }
  return rpc("personalFinance/revealMethod", { id: methodId }, { skipSpaceAuthRecovery: true });
}

export async function deletePaymentMethod(methodId: string): Promise<void> {
  if (!isLocalOnlyId(methodId) && state.syncMode === "cloud") {
    try {
      await rpc("personalFinance/removeMethod", { id: methodId }, { skipSpaceAuthRecovery: true });
    } catch (error) {
      if (!shouldFallbackToLocalFinance(error)) throw error;
    }
  }
  await saveLocalSecret(methodId, null);
  const nextMethods = state.methods.filter((m) => m.id !== methodId);
  const nextBills = state.bills.map((b) =>
    b.paymentMethodId === methodId ? { ...b, paymentMethodId: null } : b,
  );
  updateState({ methods: nextMethods, bills: nextBills, syncedAt: new Date().toISOString() });
  await writeDiskCache();
}

export async function saveFinanceBill(input: UpsertFinanceBillInput): Promise<FinanceBill> {
  const canTryCloud =
    state.syncMode === "cloud" &&
    (!input.id || !isLocalOnlyId(input.id)) &&
    (!input.paymentMethodId || !isLocalOnlyId(input.paymentMethodId));

  if (canTryCloud) {
    try {
      const saved = await rpc("personalFinance/upsertBill", input, {
        skipSpaceAuthRecovery: true,
      });
      const nextBills = sortBills([...state.bills.filter((b) => b.id !== saved.id), saved]);
      updateState({ syncMode: "cloud", bills: nextBills, syncedAt: new Date().toISOString() });
      await writeDiskCache();
      return saved;
    } catch (error) {
      if (!shouldFallbackToLocalFinance(error)) throw error;
    }
  }

  const existing = input.id ? (state.bills.find((b) => b.id === input.id) ?? null) : null;
  const now = new Date().toISOString();
  const linkedMethod = input.paymentMethodId
    ? (state.methods.find((m) => m.id === input.paymentMethodId) ?? null)
    : null;

  const saved: FinanceBill = {
    id: existing?.id ?? makeLocalId("bill"),
    direction: input.direction,
    amountCents: input.amountCents,
    currency: input.currency ?? existing?.currency ?? "CNY",
    category: input.category,
    title: input.title.trim(),
    note: input.note !== undefined ? input.note?.trim() || null : (existing?.note ?? null),
    occurredAt: input.occurredAt,
    paymentMethodId: linkedMethod?.id ?? input.paymentMethodId ?? null,
    paymentMethodLabel:
      linkedMethod?.label ??
      (input.paymentMethodLabel !== undefined
        ? input.paymentMethodLabel?.trim() || null
        : (existing?.paymentMethodLabel ?? null)),
    status: input.status ?? existing?.status ?? "paid",
    source: existing?.source ?? "manual",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const nextBills = sortBills([...state.bills.filter((b) => b.id !== saved.id), saved]);
  updateState({ syncMode: "local", bills: nextBills, syncedAt: now });
  await writeDiskCache();
  return saved;
}

export async function deleteFinanceBill(billId: string): Promise<void> {
  if (!isLocalOnlyId(billId) && state.syncMode === "cloud") {
    try {
      await rpc("personalFinance/removeBill", { id: billId }, { skipSpaceAuthRecovery: true });
    } catch (error) {
      if (!shouldFallbackToLocalFinance(error)) throw error;
    }
  }
  const nextBills = state.bills.filter((b) => b.id !== billId);
  updateState({ bills: nextBills, syncedAt: new Date().toISOString() });
  await writeDiskCache();
}

export function clearPersonalFinanceSessionCache(): void {
  const secretIds = [...trackedLocalSecretIds];
  trackedLocalSecretIds.clear();
  state = {
    loaded: false,
    syncing: false,
    syncMode: "cloud",
    methods: [],
    bills: [],
    summary: emptySummary(),
    syncedAt: null,
    hideAmounts: state.hideAmounts,
    error: null,
  };
  emit();
  void (async () => {
    for (const id of secretIds) {
      await deleteSecureItem(secretKeyFor(id));
    }
    await deleteSecureItem(SECURE_FALLBACK_KEY);
    try {
      const fs = await import("expo-file-system");
      if (fs.Directory && fs.Paths?.document) {
        const dir = new fs.Directory(fs.Paths.document, CACHE_DIR);
        if (dir.exists) dir.delete();
      }
    } catch {
      // Non-native / test runtime.
    }
  })();
}

export function resetPersonalFinanceForTest(initial?: Partial<PersonalFinanceState>): void {
  trackedLocalSecretIds.clear();
  refreshInFlight = null;
  state = {
    loaded: false,
    syncing: false,
    syncMode: "cloud",
    methods: [],
    bills: [],
    summary: emptySummary(),
    syncedAt: null,
    hideAmounts: false,
    error: null,
    ...initial,
  };
  if (initial?.bills && !initial.summary) {
    state.summary = summarizeFinanceMonth(initial.bills, currentMonthKey(), {
      methods: state.methods,
    });
  }
  emit();
}
