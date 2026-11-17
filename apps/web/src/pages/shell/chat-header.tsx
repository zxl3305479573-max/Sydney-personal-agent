import { useLingui } from "@lingui/react/macro";
import type { Bot, Group, ThreadSnapshot } from "@rakazo/contracts";
import { BotAvatar, Button, GroupAvatar } from "@rakazo/ui-web";
import { ChevronLeft, Menu, MoreHorizontal, Phone } from "lucide-react";
import { IconTooltip } from "../../components/IconTooltip";
import { PageBreadcrumb } from "../../components/PageBreadcrumb";

/** The floating header over the transcript: navigation, the chat's name and call. */
export function ChatHeader({
  inGroup,
  active,
  activeGroup,
  activeSnapshot,
  phoneCallsEnabled,
  voiceReady,
  inCall,
  panelOpen,
  onOpenNavigation,
  onTogglePanel,
  onCall,
}: {
  inGroup: boolean;
  active: Bot | undefined;
  activeGroup: Group | undefined;
  activeSnapshot: ThreadSnapshot | null;
  phoneCallsEnabled: boolean;
  /** False while the voice status loads or no voice is connected; the button then opens voice settings. */
  voiceReady: boolean;
  inCall: boolean;
  panelOpen: boolean;
  onOpenNavigation: () => void;
  onTogglePanel: () => void;
  onCall: (bot: Bot) => void;
}) {
  const { t } = useLingui();
  return (
    <div
      data-group={inGroup || undefined}
      className="sydney-grok-header pointer-events-none absolute inset-x-0 top-0 z-10 grid grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2 py-[6px] [&_button]:pointer-events-auto"
    >
      <div className="flex min-w-0 items-center gap-1">
        <Button
          variant="floating"
          size="icon-lg"
          aria-label={t`Open navigation`}
          onClick={onOpenNavigation}
          className="app-no-drag md:hidden"
        >
          {inGroup ? (
            <ChevronLeft strokeWidth={1.7} className="size-[19px]" />
          ) : (
            <Menu strokeWidth={1.7} className="size-[19px]" />
          )}
        </Button>
        {inGroup || active ? (
          <PageBreadcrumb
            inline
            translated
            label={
              inGroup
                ? (activeGroup?.name ?? activeSnapshot?.groupName ?? t`Group`)
                : (active?.name ?? t`Select a bot`)
            }
          />
        ) : null}
      </div>
      <Button
        variant="floating"
        data-testid="bot-settings-trigger"
        aria-expanded={panelOpen}
        onClick={onTogglePanel}
        className="app-no-drag h-auto min-w-0 gap-2 py-1 ps-1 pe-3.5"
      >
        {inGroup ? (
          <span className="sydney-group-header-avatar">
            <GroupAvatar
              members={activeSnapshot?.members ?? activeGroup?.members ?? []}
              size={26}
            />
          </span>
        ) : active ? (
          <BotAvatar
            avatarSet={active.avatarSet}
            color={active.color}
            identity={active.id}
            size={26}
            status={active.status}
          />
        ) : null}
        <span className="min-w-0">
          <span
            className="rk-script-type block truncate text-[15px] font-medium text-foreground"
            dir="auto"
          >
            {inGroup
              ? (activeGroup?.name ?? activeSnapshot?.groupName ?? t`Group`)
              : (active?.name ?? t`Select a bot`)}
          </span>
        </span>
      </Button>
      <div className="flex items-center justify-self-end gap-2">
        {inGroup ? (
          <Button
            variant="floating"
            size="icon-lg"
            aria-label={t`Group settings`}
            aria-expanded={panelOpen}
            onClick={onTogglePanel}
            className="app-no-drag md:hidden"
          >
            <MoreHorizontal className="size-5" />
          </Button>
        ) : null}
        {phoneCallsEnabled && !inGroup && active ? (
          <IconTooltip label={inCall ? t`Open call` : t`Call`}>
            <Button
              variant="floating"
              size="icon-lg"
              data-testid="call-button"
              aria-label={inCall ? t`Open call` : t`Call`}
              onClick={() => onCall(active)}
              data-active={inCall ? "" : undefined}
              data-voice-ready={voiceReady ? "" : undefined}
              className="app-no-drag"
            >
              <Phone strokeWidth={1.6} className="size-[17px]" />
            </Button>
          </IconTooltip>
        ) : null}
      </div>
    </div>
  );
}
