import { Trans, useLingui } from "@lingui/react/macro";
import type { NavLink } from "@rakazo/contracts";
import { AppMarkStack, Button, Popover, PopoverContent, PopoverTrigger } from "@rakazo/ui-web";
import {
  Download,
  FolderOpen,
  Gauge,
  Grid2X2Plus,
  Link2,
  LogOut,
  Plug,
  ScrollText,
  Settings,
  SquareKanban,
  UserPlus,
  UserRound,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useSidebarUpdate } from "./DesktopUpdates";
import { IconTooltip } from "./IconTooltip";

type Props = {
  mini?: boolean;
  mobile?: boolean;
  name: string;
  initials: string | null;
  image?: string | null;
  logos?: Array<{ name: string; logo?: string | null }>;
  email?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIntegrations: () => void;
  onSkills: () => void;
  onBoard?: () => void;
  links?: NavLink[];
  onLink?: (link: NavLink) => void;
  onArtifacts: () => void;
  onSettings: () => void;
  onUsage: () => void;
  onInvite?: () => void;
  onLogOut: () => void;
  signingOut: boolean;
  logOutError: string | null;
};

// Marks are 24px wide, overlap by 2px, and need 2px for the outer ring.
export function sidebarMarkCount(availableWidth: number) {
  return Math.max(0, Math.min(3, Math.floor((availableWidth - 26) / 22) + 1));
}

export function SidebarFooter({
  mini = false,
  mobile = false,
  name,
  initials,
  image,
  logos = [],
  email,
  open,
  onOpenChange,
  onIntegrations,
  onSkills,
  onBoard,
  links = [],
  onLink,
  onArtifacts,
  onSettings,
  onUsage,
  onInvite,
  onLogOut,
  signingOut,
  logOutError,
}: Props) {
  const { t } = useLingui();
  const update = useSidebarUpdate();
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const [markCount, setMarkCount] = useState(3);
  useLayoutEffect(() => {
    const pill = pillRef.current;
    const label = labelRef.current;
    if (!pill || !label || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const available = pill.clientWidth - 24 - 8 - label.scrollWidth;
      setMarkCount(sidebarMarkCount(available));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(pill);
    observer.observe(label);
    measure();
    return () => observer.disconnect();
  }, [mini]);
  return (
    <div
      data-testid="sidebar-footer"
      className={`flex shrink-0 items-center gap-2 bg-transparent ${mobile ? "absolute start-[18px] top-[calc(env(safe-area-inset-top)+12px)] z-10 p-0" : mini ? "flex-col px-1 py-2" : "px-2.5 py-3"}`}
    >
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger
          data-testid="user-menu-trigger"
          aria-label={t`Account menu for ${name}`}
          className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-sidebar-accent text-sm font-medium text-foreground outline-none hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {image && failedImage !== image ? (
            <img
              src={image}
              alt=""
              className="size-full object-cover"
              onError={() => setFailedImage(image)}
            />
          ) : initials ? (
            <span className="rk-script-type">{initials}</span>
          ) : (
            <UserRound size={18} aria-hidden="true" />
          )}
        </PopoverTrigger>
        {open ? (
          <PopoverContent
            side={mobile ? "bottom" : "top"}
            sideOffset={8}
            align="start"
            className="max-h-(--available-height) w-[295px] max-w-[calc(100vw-69px)] gap-0 overflow-y-auto p-1 *:shrink-0 data-closed:animate-none"
          >
            <div
              data-testid="account-menu-header"
              className="mb-1 min-w-0 border-b border-border px-2.5 py-2.5"
            >
              <p className="rk-script-type truncate text-sm font-medium">{name}</p>
              {email && email !== name ? (
                <p className="truncate text-xs text-muted-foreground">{email}</p>
              ) : null}
            </div>
            {mini ? (
              <Button
                variant="ghost"
                className="h-9 w-full justify-start gap-2.5 font-normal"
                onClick={onIntegrations}
              >
                <Plug className="text-muted-foreground" strokeWidth={1.75} />
                <Trans>Connect apps</Trans>
              </Button>
            ) : null}
            <Button
              variant="ghost"
              className="h-9 w-full justify-start gap-2.5 font-normal"
              aria-label={t`Settings`}
              onClick={onSettings}
            >
              <Settings className="text-muted-foreground" strokeWidth={1.75} />
              <Trans>Settings</Trans>
            </Button>
            <Button
              variant="ghost"
              className="h-9 w-full justify-start gap-2.5 font-normal"
              onClick={onSkills}
            >
              <ScrollText className="text-muted-foreground" strokeWidth={1.75} />
              <Trans>Skills</Trans>
            </Button>
            <Button
              variant="ghost"
              className="h-9 w-full justify-start gap-2.5 font-normal"
              onClick={onArtifacts}
            >
              <FolderOpen className="text-muted-foreground" strokeWidth={1.75} />
              <Trans>Artifacts</Trans>
            </Button>
            {onBoard ? (
              <Button
                variant="ghost"
                className="h-9 w-full justify-start gap-2.5 font-normal"
                onClick={onBoard}
              >
                <SquareKanban className="text-muted-foreground" strokeWidth={1.75} />
                <Trans>Board</Trans>
              </Button>
            ) : null}
            {links.map((link) => (
              <Button
                key={link.id}
                variant="ghost"
                className="h-9 w-full justify-start gap-2.5 font-normal"
                onClick={() => onLink?.(link)}
              >
                <Link2 className="text-muted-foreground" strokeWidth={1.75} />
                {link.label}
              </Button>
            ))}
            <Button
              variant="ghost"
              className="h-9 w-full justify-start gap-2.5 font-normal"
              onClick={onUsage}
            >
              <Gauge className="text-muted-foreground" strokeWidth={1.75} />
              <Trans>Usage</Trans>
            </Button>
            <div className="my-1 border-t border-border" />
            {onInvite ? (
              <Button
                variant="ghost"
                className="h-9 w-full justify-start gap-2.5 font-normal"
                onClick={onInvite}
              >
                <UserPlus className="text-muted-foreground" strokeWidth={1.75} />
                <Trans>Invite friends</Trans>
              </Button>
            ) : null}
            <div className="my-1 border-t border-border" />
            <Button
              variant="ghost"
              className="h-9 w-full justify-start gap-2.5 font-normal"
              disabled={signingOut}
              onClick={onLogOut}
            >
              <LogOut className="text-muted-foreground" strokeWidth={1.75} />
              <Trans>Log out</Trans>
            </Button>
            {logOutError ? (
              <p role="alert" className="px-2.5 pt-1 pb-2 text-[13px] text-destructive">
                {logOutError}
              </p>
            ) : null}
          </PopoverContent>
        ) : null}
      </Popover>
      {!mini && mobile ? (
        <span className="min-w-0 truncate text-[17px] font-medium text-foreground">{name}</span>
      ) : null}
      {!mini && !mobile ? (
        <>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {name}
          </span>
          <button
            type="button"
            ref={pillRef}
            aria-label={t`Connect apps`}
            onClick={onIntegrations}
            className="group/connect relative flex h-9 w-9 min-w-9 max-w-full shrink items-center overflow-hidden rounded-full border border-border bg-background text-foreground transition-[width,background-color,border-color] duration-300 ease-out hover:w-44 hover:bg-sidebar-accent focus-visible:w-44 focus-visible:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
          >
            <Grid2X2Plus
              aria-hidden="true"
              className="absolute left-1/2 size-4 -translate-x-1/2 transition-opacity duration-150 group-hover/connect:opacity-0 group-focus-visible/connect:opacity-0 motion-reduce:transition-none"
              strokeWidth={1.75}
            />
            <span
              aria-hidden="true"
              className="flex w-full min-w-0 items-center justify-between gap-2 px-3 opacity-0 transition-opacity duration-150 group-hover/connect:opacity-100 group-focus-visible/connect:opacity-100 motion-reduce:transition-none"
            >
              <span
                ref={labelRef}
                className="min-w-0 truncate whitespace-nowrap text-sm font-medium"
              >
                <Trans>Connect apps</Trans>
              </span>
              <AppMarkStack marks={logos.slice(0, markCount)} ringClassName="ring-sidebar-accent" />
            </span>
          </button>
        </>
      ) : null}
      {update.available ? (
        <IconTooltip label={t`Install update`}>
          <Button
            size="icon-lg"
            className="rounded-full"
            aria-label={t`Install update`}
            disabled={update.busy}
            onClick={update.install}
          >
            <Download aria-hidden="true" />
          </Button>
        </IconTooltip>
      ) : null}
    </div>
  );
}
