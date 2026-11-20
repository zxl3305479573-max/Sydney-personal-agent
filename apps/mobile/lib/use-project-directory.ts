import type { ProjectDirectorySnapshot } from "@rakazo/contracts";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { captureApiRequestContext, isSpaceSelectionPending, rpc } from "./api";
import { projectScopeKey } from "./project-scope";

export function useProjectDirectory(projectId: string, scopeKey: string, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<ProjectDirectorySnapshot | null>(null);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [working, setWorking] = useState(false);
  const [revocation, setRevocation] = useState<"confirmed" | "pending" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const focused = useRef(false);
  const busy = useRef(false);
  const generation = useRef(0);
  const current = () =>
    focused.current && enabled && !isSpaceSelectionPending() && projectScopeKey() === scopeKey;

  useFocusEffect(
    useCallback(() => {
      if (!enabled || projectScopeKey() !== scopeKey || isSpaceSelectionPending()) return;
      focused.current = true;
      setWorking(busy.current);
      const seen = ++generation.current;
      const controller = new AbortController();
      const active = () =>
        focused.current &&
        seen === generation.current &&
        projectScopeKey() === scopeKey &&
        !isSpaceSelectionPending();
      setLoading(true);
      setFailed(false);
      void (async () => {
        try {
          const requestContext = await captureApiRequestContext();
          if (!active()) return;
          const options = {
            requestContext,
            signal: controller.signal,
            skipSpaceAuthRecovery: true,
          };
          const capability = await rpc("projectWorkspaces/directoryCapability", undefined, options);
          if (!active()) return;
          setAvailable(capability.localDevice);
          if (!capability.localDevice) {
            setSnapshot(null);
            return;
          }
          const result = await rpc("projectWorkspaces/directory", { id: projectId }, options);
          if (active()) setSnapshot(result);
        } catch {
          if (active()) setFailed(true);
        } finally {
          if (active()) setLoading(false);
        }
      })();
      const timer = setInterval(() => {
        if (active() && !busy.current) setAttempt((old) => old + 1);
      }, 15_000);
      return () => {
        focused.current = false;
        controller.abort();
        clearInterval(timer);
      };
    }, [projectId, scopeKey, enabled, attempt]),
  );

  return {
    snapshot,
    available,
    loading,
    failed,
    working,
    revocation,
    refresh: () => {
      if (current() && !busy.current) setAttempt((old) => old + 1);
    },
    async remove() {
      if (!current() || busy.current || loading || failed || !snapshot?.binding) return;
      const seen = ++generation.current;
      const active = () => current() && seen === generation.current;
      busy.current = true;
      setWorking(true);
      setFailed(false);
      setRevocation(null);
      try {
        const requestContext = await captureApiRequestContext();
        if (!active()) return;
        const result = await rpc(
          "projectWorkspaces/unbindDirectory",
          {
            id: projectId,
            grantId: snapshot.binding.grantId,
          },
          { requestContext, skipSpaceAuthRecovery: true },
        );
        if (active()) {
          setSnapshot({ binding: null, deviceName: null, status: "unknown" });
          setRevocation(result.localRevocation);
        }
      } catch {
        if (active()) setFailed(true);
      } finally {
        busy.current = false;
        if (current()) {
          setWorking(false);
          setAttempt((old) => old + 1);
        }
      }
    },
  };
}
