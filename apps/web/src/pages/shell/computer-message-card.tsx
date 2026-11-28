import { Trans, useLingui } from "@lingui/react/macro";
import { ChatMarkdown } from "@rakazo/chat-ui/web";
import type { MessageBlock } from "@rakazo/contracts";
import { Button } from "@rakazo/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  embeddableScreenUrl,
  retainCardScreenSource,
  SCREEN_FRAME_LOAD_TIMEOUT_MS,
  screenFrameMessage,
  screenIframeSandbox,
} from "../../lib/computer-screen";
import { queryClient, useSpaceQueries } from "../../lib/query";

export function ComputerMessageCard({
  block,
  botId,
  active,
  onOpen,
  onTakeControl,
}: {
  block: Extract<MessageBlock, { kind: "computer" }>;
  botId?: string;
  active: boolean;
  onOpen: () => void;
  onTakeControl: () => void;
}) {
  const { t } = useLingui();
  const queries = useSpaceQueries();
  const [visible, setVisible] = useState(document.visibilityState !== "hidden");
  const [source, setSource] = useState<{ scope: string; url: string } | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const loadTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const changed = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  const me = useQuery(
    { ...queries.me.queryOptions(), enabled: visible, retry: false },
    queryClient,
  );
  const allowed = me.data?.featureAccess?.computer !== false;
  const enabled = Boolean(botId && active && visible && allowed);
  const options = queries.computer.screenUrl.queryOptions({
    input: { botId: botId ?? "", viewOnly: true },
  });
  const scope = JSON.stringify(options.queryKey);
  const preview = useQuery(
    {
      ...options,
      enabled,
      refetchInterval: enabled ? 30_000 : false,
      retry: false,
    },
    queryClient,
  );
  useEffect(() => {
    if (!enabled || preview.isError || !preview.data?.url) {
      setSource(null);
      return;
    }
    const next = preview.data.url;
    setSource((held) => ({
      scope,
      url:
        held?.scope === scope && held.url !== failedSource
          ? retainCardScreenSource(held.url, next)
          : next,
    }));
  }, [enabled, scope, preview.data, preview.isError, failedSource]);
  const rawUrl =
    enabled && !preview.isError && source?.scope === scope && source.url !== failedSource
      ? source.url
      : null;
  const embedded = rawUrl ? embeddableScreenUrl(rawUrl) : null;
  const url = embedded && /^https?:/.test(embedded) ? embedded : null;
  useEffect(() => {
    if (!url || !rawUrl) return;
    const timeout = setTimeout(() => setFailedSource(rawUrl), SCREEN_FRAME_LOAD_TIMEOUT_MS);
    loadTimeout.current = timeout;
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const report = screenFrameMessage(event.data);
      if (!report) return;
      if (report.rakazoScreen !== "loading") clearTimeout(timeout);
      if (report.rakazoScreen === "failed" || report.rakazoScreen === "disconnected")
        setFailedSource(rawUrl);
    };
    window.addEventListener("message", receive);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("message", receive);
    };
  }, [url, rawUrl]);
  const state =
    block.state === "Live"
      ? active
        ? t`Live desktop`
        : t`Done`
      : block.state === "Needs you"
        ? t`Needs you`
        : block.state === "Skipped"
          ? t`Skipped`
          : block.state === "Done"
            ? t`Done`
            : block.state;
  return (
    <div
      data-testid="computer-card"
      className="w-[340px] max-w-full space-y-2.5 rounded-[18px] border border-border bg-muted px-[18px] py-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-medium text-foreground">
          <Trans>Computer</Trans>
        </span>
        <span
          className={
            block.state === "Needs you"
              ? "rounded-full bg-warning/15 px-[11px] py-1 text-[13px] text-warning"
              : block.state === "Skipped"
                ? "rounded-full bg-foreground/10 px-[11px] py-1 text-[13px] text-muted-foreground"
                : "rounded-full bg-success/15 px-[11px] py-1 text-[13px] text-success"
          }
        >
          {state}
        </span>
      </div>
      {enabled ? (
        <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-background">
          {url ? (
            <iframe
              ref={frame}
              title={t`Live desktop`}
              src={url}
              sandbox={screenIframeSandbox(url)}
              tabIndex={-1}
              className="pointer-events-none size-full border-0"
              onError={() => setFailedSource(source?.url ?? null)}
              onLoad={() => {
                if (!screenIframeSandbox(url)) clearTimeout(loadTimeout.current);
              }}
            />
          ) : (
            <p
              role="status"
              className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted-foreground"
            >
              {preview.isPending && !failedSource
                ? t`Loading live desktop…`
                : t`Preview unavailable. Open the computer to reconnect.`}
            </p>
          )}
        </div>
      ) : null}
      {block.text ? (
        <div className="text-[14.5px] leading-[1.5] text-foreground/75">
          <ChatMarkdown>{block.text}</ChatMarkdown>
        </div>
      ) : null}
      {allowed ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            <Trans>If the bot is working, taking control stops its current task.</Trans>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" data-testid="computer-card-open" onClick={onOpen}>
              <Trans>Open computer</Trans>
            </Button>
            <Button type="button" size="sm" onClick={onTakeControl}>
              <Trans>Take control</Trans>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
