import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import type { MobileSnapshot } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { runErrorActionLabel } from "../../lib/run-error-presentation";
import { useRunError } from "../run-error-sheet";

/** The chat's failed run: its error, the recovery action, and whether its details are open. */
export function useThreadRunError(run: MobileSnapshot["run"] | undefined, botId?: string) {
  const { t } = useI18n();
  const router = useRouter();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const runError = run?.status === "failed" ? (run.error ?? null) : null;
  const normalizedRunError = useRunError(runError, false);
  const failedRunId = runError ? run?.id : null;
  useEffect(() => setDetailsOpen(false), [failedRunId]);
  const label = normalizedRunError ? runErrorActionLabel(t, normalizedRunError) : null;
  const runBotId = run?.botId ?? botId;
  const runErrorAction = label
    ? {
        label,
        onPress:
          normalizedRunError?.recovery === "model" && runBotId
            ? () => {
                setDetailsOpen(false);
                router.push({
                  pathname: "/thread-model",
                  params: { botId: runBotId },
                });
              }
            : () => {
                setDetailsOpen(false);
                router.push("/settings-home");
              },
      }
    : null;
  return { runError, normalizedRunError, runErrorAction, detailsOpen, setDetailsOpen };
}
