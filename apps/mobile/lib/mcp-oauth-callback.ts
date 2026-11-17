import { isLoopbackHost } from "@rakazo/contracts/network-host";

const CALLBACK_PATHS = new Set(["/mcp/oauth/callback", "/api/mcp/oauth/callback"]);
const MAX_CALLBACK_LENGTH = 16_384;
const MAX_CODE_LENGTH = 4_096;

export function parseMcpOAuthCallback(
  value: string,
  attempt: { callbackUri: string; sessionId: string },
): { sessionId: string; code: string; state: string } | null {
  try {
    if (value.length > MAX_CALLBACK_LENGTH || !attempt.sessionId) return null;
    const trimmed = value.trim();
    if (
      Array.from(trimmed).some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    )
      return null;
    const expected = new URL(attempt.callbackUri);
    const actual = new URL(trimmed);
    if (
      expected.username ||
      expected.password ||
      expected.search ||
      expected.hash ||
      !CALLBACK_PATHS.has(expected.pathname) ||
      (expected.protocol !== "https:" &&
        !(expected.protocol === "http:" && isLoopbackHost(expected.hostname))) ||
      actual.username ||
      actual.password ||
      actual.origin !== expected.origin ||
      actual.pathname !== expected.pathname ||
      actual.hash ||
      actual.searchParams.getAll("code").length !== 1 ||
      actual.searchParams.getAll("state").length !== 1 ||
      actual.searchParams.has("error")
    )
      return null;
    const code = actual.searchParams.get("code");
    const state = actual.searchParams.get("state");
    if (
      !code ||
      code.length > MAX_CODE_LENGTH ||
      Array.from(code).some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ) ||
      state !== attempt.sessionId
    )
      return null;
    return { sessionId: attempt.sessionId, code, state };
  } catch {
    return null;
  }
}
