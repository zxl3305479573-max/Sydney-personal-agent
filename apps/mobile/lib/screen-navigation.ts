export function isAllowedScreenNavigation(source: string, target: string): boolean {
  try {
    const original = new URL(source);
    const next = new URL(target);
    return (
      (original.protocol === "https:" || original.protocol === "http:") &&
      next.href === original.href &&
      !next.username &&
      !next.password
    );
  } catch {
    return false;
  }
}
