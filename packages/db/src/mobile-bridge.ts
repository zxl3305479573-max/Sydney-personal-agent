import type {
  MobileAppActionRecord,
  MobileBridgePermissions,
  MobileBridgePermissionsPatch,
  MobileBridgeSnapshot,
  MobileBridgeState,
} from "@rakazo/contracts";
import {
  DEFAULT_MOBILE_BRIDGE_PERMISSIONS,
  filterMobileSnapshotByPermissions,
  normalizeMobileBridgePermissions,
  normalizeMobileBridgeSnapshot,
  normalizeMobilePendingActions,
} from "@rakazo/contracts";
import type { Prisma, PrismaClient } from "./generated/prisma/client.js";

const PENDING_ACTION_TTL_MS = 10 * 60 * 1000;
const PENDING_ACTION_MAX = 20;

function prunePendingActions(
  actions: MobileAppActionRecord[],
  nowMs = Date.now(),
): MobileAppActionRecord[] {
  const cutoff = nowMs - PENDING_ACTION_TTL_MS;
  return actions
    .filter((action) => {
      const created = Date.parse(action.createdAt);
      return Number.isNaN(created) ? true : created >= cutoff;
    })
    .slice(-PENDING_ACTION_MAX);
}

function toBridgeState(
  row: {
    permissions: unknown;
    snapshot: unknown;
    pendingActions: unknown;
    updatedAt: Date;
  } | null,
  nowMs = Date.now(),
): MobileBridgeState {
  if (!row) {
    return {
      permissions: { ...DEFAULT_MOBILE_BRIDGE_PERMISSIONS },
      snapshot: {},
      pendingActions: [],
      updatedAt: null,
    };
  }
  const permissions = normalizeMobileBridgePermissions(row.permissions);
  const snapshot = filterMobileSnapshotByPermissions(
    normalizeMobileBridgeSnapshot(row.snapshot),
    permissions,
  );
  const pendingActions = permissions.enabled
    ? prunePendingActions(normalizeMobilePendingActions(row.pendingActions), nowMs)
    : [];
  return {
    permissions,
    snapshot,
    pendingActions,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getUserMobileBridge(
  prisma: PrismaClient,
  userId: string,
): Promise<MobileBridgeState> {
  const row = await prisma.userMobileBridge.findUnique({ where: { userId } });
  return toBridgeState(row);
}

export async function updateUserMobileBridgePermissions(
  prisma: PrismaClient,
  userId: string,
  patch: MobileBridgePermissionsPatch,
): Promise<MobileBridgeState> {
  const existing = await prisma.userMobileBridge.findUnique({ where: { userId } });
  const currentPermissions = existing
    ? normalizeMobileBridgePermissions(existing.permissions)
    : { ...DEFAULT_MOBILE_BRIDGE_PERMISSIONS };
  const nextPermissions: MobileBridgePermissions = {
    ...currentPermissions,
    ...patch,
  };
  const nextSnapshot = filterMobileSnapshotByPermissions(
    normalizeMobileBridgeSnapshot(existing?.snapshot),
    nextPermissions,
  );
  const nextPending = nextPermissions.enabled
    ? prunePendingActions(normalizeMobilePendingActions(existing?.pendingActions))
    : [];
  const saved = await prisma.userMobileBridge.upsert({
    where: { userId },
    create: {
      userId,
      permissions: nextPermissions as unknown as Prisma.InputJsonValue,
      snapshot: nextSnapshot as unknown as Prisma.InputJsonValue,
      pendingActions: nextPending as unknown as Prisma.InputJsonValue,
    },
    update: {
      permissions: nextPermissions as unknown as Prisma.InputJsonValue,
      snapshot: nextSnapshot as unknown as Prisma.InputJsonValue,
      pendingActions: nextPending as unknown as Prisma.InputJsonValue,
    },
  });
  return toBridgeState(saved);
}

export async function syncUserMobileBridgeSnapshot(
  prisma: PrismaClient,
  userId: string,
  incoming: MobileBridgeSnapshot,
): Promise<MobileBridgeState> {
  const existing = await prisma.userMobileBridge.findUnique({ where: { userId } });
  const permissions = existing
    ? normalizeMobileBridgePermissions(existing.permissions)
    : { ...DEFAULT_MOBILE_BRIDGE_PERMISSIONS };
  const currentSnapshot = normalizeMobileBridgeSnapshot(existing?.snapshot);
  const merged: MobileBridgeSnapshot = {
    ...currentSnapshot,
    ...incoming,
  };
  const filtered = filterMobileSnapshotByPermissions(merged, permissions);
  const saved = await prisma.userMobileBridge.upsert({
    where: { userId },
    create: {
      userId,
      permissions: permissions as unknown as Prisma.InputJsonValue,
      snapshot: filtered as unknown as Prisma.InputJsonValue,
      pendingActions: [] as unknown as Prisma.InputJsonValue,
    },
    update: {
      snapshot: filtered as unknown as Prisma.InputJsonValue,
    },
  });
  return toBridgeState(saved);
}

export async function enqueueUserMobileBridgeAction(
  prisma: PrismaClient,
  userId: string,
  action: MobileAppActionRecord,
): Promise<MobileBridgeState> {
  const existing = await prisma.userMobileBridge.findUnique({ where: { userId } });
  const permissions = existing
    ? normalizeMobileBridgePermissions(existing.permissions)
    : { ...DEFAULT_MOBILE_BRIDGE_PERMISSIONS };
  const current = prunePendingActions(normalizeMobilePendingActions(existing?.pendingActions));
  const deduped = current.filter((item) => item.actionId !== action.actionId);
  const nextPending = [...deduped, action].slice(-PENDING_ACTION_MAX);
  const saved = await prisma.userMobileBridge.upsert({
    where: { userId },
    create: {
      userId,
      permissions: permissions as unknown as Prisma.InputJsonValue,
      snapshot: {} as unknown as Prisma.InputJsonValue,
      pendingActions: nextPending as unknown as Prisma.InputJsonValue,
    },
    update: {
      pendingActions: nextPending as unknown as Prisma.InputJsonValue,
    },
  });
  return toBridgeState(saved);
}

export async function ackUserMobileBridgeAction(
  prisma: PrismaClient,
  userId: string,
  actionId: string,
): Promise<void> {
  const existing = await prisma.userMobileBridge.findUnique({ where: { userId } });
  if (!existing) return;
  const current = prunePendingActions(normalizeMobilePendingActions(existing.pendingActions));
  const remaining = current.filter((item) => item.actionId !== actionId);
  if (remaining.length === current.length) return;
  await prisma.userMobileBridge.update({
    where: { userId },
    data: {
      pendingActions: remaining as unknown as Prisma.InputJsonValue,
    },
  });
}
