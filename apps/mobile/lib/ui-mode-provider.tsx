import type { PropsWithChildren } from "react";
import { useMemo, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { reportMobileError } from "./monitoring";
import { useResolvedAppearance } from "./native";
import {
  getUiModeRevision,
  getUiModeSnapshot,
  resetUiModeToClassic,
  subscribeUiMode,
} from "./ui-mode";
import { resolveUiModeTheme } from "./ui-mode-registry";
import { UiModeRuntimeProvider } from "./ui-mode-slots";

export function UiModeProvider({ children }: PropsWithChildren) {
  const revision = useSyncExternalStore(subscribeUiMode, getUiModeRevision, getUiModeRevision);
  const appearance = useResolvedAppearance();
  const value = useMemo(() => {
    const snapshot = getUiModeSnapshot();
    return {
      snapshot,
      theme: resolveUiModeTheme(snapshot.activeModeId, {
        platform: Platform.OS,
        userAppearance: appearance,
      }),
      onModeRenderError: (error: Error) => {
        reportMobileError(error, "react.render");
        void resetUiModeToClassic();
      },
    };
  }, [revision, appearance]);

  return <UiModeRuntimeProvider value={value}>{children}</UiModeRuntimeProvider>;
}
