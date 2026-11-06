import { useLingui } from "@lingui/react/macro";
import { useLocation } from "react-router-dom";

function pageLabel(pathname: string) {
  if (pathname === "/sign-in") return "Sign in";
  if (pathname === "/sign-up") return "Sign up";
  if (pathname === "/forgot-password") return "Forgot password";
  if (pathname === "/reset-password") return "Reset password";
  if (pathname === "/onboarding" || pathname.startsWith("/onboarding/")) return "Onboarding";
  if (pathname === "/app/artifacts" || pathname.startsWith("/app/artifacts/")) return "Artifacts";
  if (pathname === "/app/board") return "Board";
  if (pathname === "/integrations/setup") return "Connect apps";
  if (pathname === "/admin/plugins") return "Plugins";
  if (pathname === "/admin/access") return "Access";
  if (/^\/app\/g\/[^/]+$/.test(pathname)) return "Group chat";
  if (/^\/app\/[^/]+$/.test(pathname)) return "Chat";
  if (pathname.startsWith("/app")) return "Home";
  return "Page";
}

export function PageBreadcrumb() {
  const { i18n } = useLingui();
  const { pathname } = useLocation();
  if (pathname === "/") return null;
  const label = pageLabel(pathname);
  const translatedLabel =
    typeof i18n?._ === "function" ? i18n._({ id: label, message: label }) : label;

  return (
    <nav
      aria-label={`Sydney / ${translatedLabel}`}
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4.5rem)] z-30 hidden px-6 text-[15px] text-muted-foreground md:hidden"
    >
      <span className="rk-script-type text-foreground/70">Sydney</span>
      <span className="mx-2 text-border">/</span>
      <span>{translatedLabel}</span>
    </nav>
  );
}
