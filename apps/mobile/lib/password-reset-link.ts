export function passwordResetToken(
  input: string,
  serverBase: string,
  resetUrl: string,
): string | null {
  if (input.length > 4096) return null;
  try {
    const link = new URL(input.trim());
    const server = new URL(serverBase);
    const callback = new URL(resetUrl);
    if (
      link.username ||
      link.password ||
      link.hash ||
      (link.origin !== server.origin && link.origin !== callback.origin)
    )
      return null;
    let token: string | null = null;
    const match = /^\/api\/auth\/reset-password\/([^/]+)$/.exec(link.pathname);
    if (match) token = decodeURIComponent(match[1]!);
    else if (
      (link.origin === callback.origin && link.pathname === callback.pathname) ||
      (link.origin === server.origin && link.pathname === "/api/auth/native-reset") ||
      (link.origin === callback.origin && link.pathname === "/api/auth/native-reset")
    ) {
      const tokens = link.searchParams.getAll("token");
      if (tokens.length === 1 && [...link.searchParams.keys()].every((key) => key === "token"))
        token = tokens[0] ?? null;
    }
    return token && /^[A-Za-z0-9_-]{16,256}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}
