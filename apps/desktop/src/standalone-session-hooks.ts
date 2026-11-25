import { randomBytes } from "node:crypto";
import type { OnCompletedListenerDetails, Session } from "electron";
import {
  installProxyCapability,
  MAIN_PROCESS_NONCE_HEADER,
  PROXY_CAPABILITY_HEADER,
} from "./proxy-request-capability.js";

export interface StandaloneSessionBinding {
  readonly proxyOrigin: string;
  readonly remoteOrigin: string;
  readonly capability: string;
  readonly screenCapability: string;
  readonly appContentsId: () => number | undefined;
}

export interface BoundStandaloneSession {
  readonly generation: number;
  readonly unbind: () => void;
  readonly fetchBackend: (urlOrPath: string, init?: RequestInit) => Promise<Response>;
}

interface SessionCapabilityState {
  nextGeneration: number;
  active: (StandaloneSessionBinding & { readonly generation: number }) | undefined;
  readonly nonces: Map<string, number>;
}

const capabilityStates = new WeakMap<Session, SessionCapabilityState>();
const completedStates = new WeakMap<Session, Map<number, Set<(statusCode: number) => void>>>();

/** Whether `targetSession` owns a standalone capability hook that legacy header hooks must never overwrite. */
export function isStandaloneManagedSession(targetSession: Session): boolean {
  return capabilityStates.has(targetSession);
}

function ensureCapabilityState(targetSession: Session): SessionCapabilityState {
  const state = capabilityStates.get(targetSession);
  if (state) return state;

  const created: SessionCapabilityState = {
    nextGeneration: 0,
    active: undefined,
    nonces: new Map(),
  };
  installProxyCapability(targetSession, {
    proxyOrigin: () => created.active?.proxyOrigin,
    token: () => created.active?.capability,
    screenToken: () => created.active?.screenCapability,
    appContentsId: () => created.active?.appContentsId(),
    consumeMainRequestNonce: (nonce) => {
      const generation = created.nonces.get(nonce);
      created.nonces.delete(nonce);
      return (
        generation !== undefined &&
        created.active !== undefined &&
        generation === created.active.generation
      );
    },
  });
  capabilityStates.set(targetSession, created);
  return created;
}

function resolveProxyTargetUrl(
  urlOrPath: string,
  proxyOrigin: string,
  remoteOrigin: string,
): string {
  const localBase = new URL(proxyOrigin);
  const remoteBase = new URL(remoteOrigin);
  if (urlOrPath.startsWith("/") && !urlOrPath.startsWith("//")) {
    const resolved = new URL(urlOrPath, localBase);
    if (resolved.origin !== localBase.origin || resolved.username || resolved.password) {
      throw new Error("Invalid backend request path.");
    }
    return resolved.href;
  }

  const parsed = new URL(urlOrPath);
  if (
    parsed.username ||
    parsed.password ||
    (parsed.origin !== remoteBase.origin && parsed.origin !== localBase.origin)
  ) {
    throw new Error("Refusing to send standalone session request to an untrusted origin.");
  }
  return new URL(`${parsed.pathname}${parsed.search}`, localBase).href;
}

/**
 * Binds a standalone proxy generation to `targetSession` via a single per-Session
 * `onBeforeSendHeaders` installation. Calling `unbind()` revokes only that
 * generation without disturbing a newer binding or stripping header sanitization.
 */
export function bindStandaloneSession(
  targetSession: Session,
  binding: StandaloneSessionBinding,
): BoundStandaloneSession {
  const proxyOrigin = new URL(binding.proxyOrigin).origin;
  const remoteOrigin = new URL(binding.remoteOrigin).origin;
  const state = ensureCapabilityState(targetSession);
  const generation = ++state.nextGeneration;
  state.nonces.clear();
  state.active = {
    ...binding,
    proxyOrigin,
    remoteOrigin,
    generation,
  };

  return {
    generation,
    unbind: () => {
      if (state.active?.generation !== generation) return;
      state.active = undefined;
      for (const [nonce, owner] of state.nonces) {
        if (owner === generation) state.nonces.delete(nonce);
      }
    },
    fetchBackend: async (urlOrPath, init) => {
      if (state.active?.generation !== generation) {
        throw new Error("Standalone session binding is no longer active.");
      }
      const targetHref = resolveProxyTargetUrl(urlOrPath, proxyOrigin, remoteOrigin);
      const nonce = randomBytes(24).toString("base64url");
      const headers = new Headers(init?.headers);
      headers.delete(PROXY_CAPABILITY_HEADER);
      headers.delete(MAIN_PROCESS_NONCE_HEADER);
      headers.set(MAIN_PROCESS_NONCE_HEADER, nonce);
      state.nonces.set(nonce, generation);
      try {
        return await targetSession.fetch(targetHref, {
          ...init,
          redirect: init?.redirect ?? "manual",
          headers,
          bypassCustomProtocolHandlers: true,
        });
      } finally {
        state.nonces.delete(nonce);
      }
    },
  };
}

/**
 * Multiplexes `webRequest.onCompleted` per `Session` so concurrent or overlapping
 * `loadAppUrl` watchers never clear each other with `onCompleted(null)`.
 */
export function observeMainFrameCompleted(
  targetSession: Session,
  webContentsId: number,
  onStatus: (statusCode: number) => void,
): () => void {
  let byContents = completedStates.get(targetSession);
  if (!byContents) {
    byContents = new Map();
    completedStates.set(targetSession, byContents);
  }
  const wasEmpty = byContents.size === 0;
  let listeners = byContents.get(webContentsId);
  if (!listeners) {
    listeners = new Set();
    byContents.set(webContentsId, listeners);
  }
  listeners.add(onStatus);

  if (wasEmpty) {
    const activeMap = byContents;
    targetSession.webRequest.onCompleted(
      { urls: ["*://*/*"] },
      (details: OnCompletedListenerDetails) => {
        if (details.resourceType !== "mainFrame" || details.webContentsId === undefined) return;
        const handlers = activeMap.get(details.webContentsId);
        if (!handlers) return;
        for (const handler of [...handlers]) handler(details.statusCode);
      },
    );
  }

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    const currentMap = completedStates.get(targetSession);
    if (!currentMap) return;
    const handlers = currentMap.get(webContentsId);
    if (handlers) {
      handlers.delete(onStatus);
      if (handlers.size === 0) currentMap.delete(webContentsId);
    }
    if (currentMap.size === 0) {
      completedStates.delete(targetSession);
      targetSession.webRequest.onCompleted(null);
    }
  };
}
