import { useLingui } from "@lingui/react/macro";
import { useLocation } from "react-router-dom";

export function PageBreadcrumb({
  label: explicitLabel,
  inline = false,
  translated = false,
}: {
  label?: string;
  inline?: boolean;
  translated?: boolean;
}) {
  if (inline)
    return <InlinePageBreadcrumb label={explicitLabel ?? "Page"} translated={translated} />;
  return <RoutePageBreadcrumb />;
}

function InlinePageBreadcrumb({ label, translated }: { label: string; translated: boolean }) {
  const { t } = useLingui();
  const translatedLabel = translated
    ? label
    : label === "Bot settings"
      ? t`Bot settings`
      : label === "Computer"
        ? t`Computer`
        : label === "Routines"
          ? t`Routines`
          : label === "Create group"
            ? t`Create group`
            : label === "Group settings"
              ? t`Group settings`
              : label === "Routine"
                ? t`Routine`
                : label === "Import an agent"
                  ? t`Import an agent`
                  : label;

  return (
    <nav
      aria-label={`Sydney / ${translatedLabel}`}
      className="min-w-0 truncate text-[15px] text-muted-foreground md:hidden"
    >
      <span className="rk-script-type text-foreground/70">Sydney</span>
      <span className="mx-2 text-border">/</span>
      <span>{translatedLabel}</span>
    </nav>
  );
}

function RoutePageBreadcrumb() {
  const { t } = useLingui();
  const { pathname } = useLocation();
  const translatedLabel =
    pathname === "/sign-in"
      ? t`Sign in`
      : pathname === "/sign-up"
        ? t`Sign up`
        : pathname === "/forgot-password"
          ? t`Password recovery`
          : pathname === "/reset-password"
            ? t`Reset password`
            : pathname === "/onboarding" || pathname.startsWith("/onboarding/")
              ? t`Get started`
              : pathname === "/app/artifacts" || pathname.startsWith("/app/artifacts/")
                ? t`Artifacts`
                : pathname === "/app/board"
                  ? t`Board`
                  : pathname.startsWith("/app/x/") || pathname === "/integrations/setup"
                    ? t`Connect apps`
                    : pathname === "/admin/plugins"
                      ? t`Plugins`
                      : pathname === "/admin/access"
                        ? t`Access management`
                        : null;
  if (!translatedLabel) return null;

  return (
    <nav
      aria-label={`Sydney / ${translatedLabel}`}
      className="shrink-0 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2 text-[15px] text-muted-foreground md:hidden"
    >
      <span className="rk-script-type text-foreground/70">Sydney</span>
      <span className="mx-2 text-border">/</span>
      <span>{translatedLabel}</span>
    </nav>
  );
}
