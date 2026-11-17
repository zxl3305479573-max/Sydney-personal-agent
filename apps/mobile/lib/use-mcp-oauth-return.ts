import { useEffect, useRef, useState } from "react";
import {
  captureApiRequestContext,
  captureServerSessionScope,
  isServerSessionScopeCurrent,
  rpc,
  selectedSpaceId,
} from "./api";
import { parseMcpOAuthCallback } from "./mcp-oauth-callback";

type Attempt = {
  sessionId: string;
  callbackUri: string;
  scope: ReturnType<typeof captureServerSessionScope>;
  context: Awaited<ReturnType<typeof captureApiRequestContext>>;
  spaceId: string | null;
};

export function useMcpOAuthReturn() {
  const attempt = useRef<Attempt | null>(null);
  const live = useRef(true);
  const generation = useRef(0);
  const completing = useRef(false);
  const [available, setAvailable] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<"invalid" | "changed" | "failed" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      generation.current++;
      attempt.current = null;
    };
  }, []);

  function clear() {
    generation.current++;
    attempt.current = null;
    setAvailable(false);
    setValue("");
    setError(null);
    setBusy(false);
  }

  async function begin(serverId: string) {
    if (completing.current) throw new Error("MCP OAuth completion in progress");
    clear();
    const sequence = generation.current;
    const scope = captureServerSessionScope();
    const spaceId = selectedSpaceId();
    const context = await captureApiRequestContext(spaceId);
    if (!live.current || generation.current !== sequence) throw new Error("MCP OAuth cancelled");
    if (!isServerSessionScopeCurrent(scope) || selectedSpaceId() !== spaceId)
      throw new Error("MCP OAuth scope changed");
    const result = await rpc(
      "mcp/oauth/begin",
      { serverId, nativeCallback: true },
      { requestContext: context },
    );
    if (!live.current || generation.current !== sequence) throw new Error("MCP OAuth cancelled");
    if (!isServerSessionScopeCurrent(scope) || selectedSpaceId() !== spaceId)
      throw new Error("MCP OAuth scope changed");
    let supportsManualReturn = false;
    if (result.status === "authorization_required" && result.callbackUri) {
      try {
        supportsManualReturn = new URL(result.callbackUri).pathname === "/api/mcp/oauth/callback";
      } catch {
        supportsManualReturn = false;
      }
    }
    if (result.status === "authorization_required" && result.callbackUri && supportsManualReturn) {
      attempt.current = {
        sessionId: result.sessionId,
        callbackUri: result.callbackUri,
        scope,
        context,
        spaceId,
      };
      setAvailable(true);
    }
    return result;
  }

  async function complete(): Promise<boolean> {
    const current = attempt.current;
    if (!current || completing.current) return false;
    if (!isServerSessionScopeCurrent(current.scope) || selectedSpaceId() !== current.spaceId) {
      clear();
      setError("changed");
      return false;
    }
    const input = parseMcpOAuthCallback(value, current);
    if (!input) {
      setError("invalid");
      return false;
    }
    const sequence = generation.current;
    attempt.current = null;
    completing.current = true;
    setValue("");
    setError(null);
    setBusy(true);
    try {
      await rpc("mcp/oauth/complete", input, { requestContext: current.context });
      if (!live.current || generation.current !== sequence) return false;
      if (!isServerSessionScopeCurrent(current.scope) || selectedSpaceId() !== current.spaceId) {
        setAvailable(false);
        setError("changed");
        return false;
      }
      setAvailable(false);
      return true;
    } catch {
      if (live.current && generation.current === sequence) {
        setAvailable(false);
        setError("failed");
      }
      return false;
    } finally {
      completing.current = false;
      if (live.current && generation.current === sequence) setBusy(false);
    }
  }

  return { available, value, setValue, error, busy, begin, complete, clear };
}
