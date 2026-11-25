import type { RoutineRun } from "@rakazo/contracts";
import type { ColorTokens } from "@rakazo/ui-tokens";
import { formatRoutineRunAt } from "@rakazo/core";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { activityStatusLabel } from "../lib/activity";
import { mobileTokens } from "../lib/appearance";
import { dateLocaleForUi, useI18n } from "../lib/i18n";
import { native, useThemedStyles } from "../lib/native";
import { routineRunDestination, useRoutineRuns } from "../lib/routine-runs";
import { NativeActionButton } from "./native-action-button";
import { NativeSymbol } from "./native-symbol";
import { RunErrorSheet, useRunError } from "./run-error-sheet";
import { SettingsGroup, SettingsRow } from "./settings-group";

function isLightPalette(tokens?: Partial<ColorTokens> | null): boolean {
  const bg = tokens?.background;
  if (typeof bg === "string" && bg.startsWith("#") && bg.length >= 7) {
    const red = Number.parseInt(bg.slice(1, 3), 16);
    if (!Number.isNaN(red)) return red >= 128;
  }
  return true;
}

export function RoutineRunHistory({
  routineId,
  botName,
}: {
  routineId: string;
  botName: string | undefined;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const history = useRoutineRuns(routineId);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  if (!history.runs) {
    if (!history.failed) return <ActivityIndicator color={native.secondaryLabel} />;
    return (
      <>
        <SettingsGroup label={t("Run history")}>
          <SettingsRow key="failed" title={t("Could not load run history")} dimmed />
        </SettingsGroup>
        <NativeActionButton
          label={t("Try Again")}
          variant="text"
          prominence="secondary"
          onPress={history.retry}
        />
      </>
    );
  }
  return (
    <>
      <SettingsGroup label={t("Run history")}>
        {history.runs.length === 0 ? (
          <SettingsRow key="empty" title={t("No runs yet")} dimmed />
        ) : (
          history.runs.map((run) => {
            const destination = routineRunDestination(run, botName);
            const error = run.status === "failed" ? run.error : null;
            return (
              <RunRow
                key={run.id}
                run={run}
                error={error}
                onPress={
                  destination
                    ? () => router.push(destination)
                    : error
                      ? () => setErrorDetails(error)
                      : undefined
                }
              />
            );
          })
        )}
        {history.failed ? (
          <SettingsRow key="failed" title={t("Could not load run history")} dimmed />
        ) : null}
      </SettingsGroup>
      {history.hasOlder ? (
        <NativeActionButton
          label={t("Load older runs")}
          variant="text"
          prominence="secondary"
          busy={history.loadingOlder}
          onPress={history.loadOlder}
        />
      ) : null}
      <RunErrorSheet details={errorDetails} onClose={() => setErrorDetails(null)} />
    </>
  );
}

function RunRow({
  run,
  error,
  onPress,
}: {
  run: RoutineRun;
  error: string | null;
  onPress: (() => void) | undefined;
}) {
  const { locale, t } = useI18n();
  const styles = useThemedStyles(createRunHistoryStyles);
  const failure = useRunError(error);
  const title = formatRoutineRunAt(run, dateLocaleForUi(locale));
  const isFailed = run.status === "failed";
  return (
    <SettingsRow
      accessibilityRole={onPress ? "button" : undefined}
      title={title}
      detail={failure?.summary}
      leading={
        <View style={styles.runChip}>
          <NativeSymbol
            ios={isFailed ? "exclamationmark.circle" : "checkmark.circle"}
            android={isFailed ? "alert-circle-outline" : "checkmark-circle-outline"}
            size={15}
            color={isFailed ? mobileTokens().destructive : styles.runIcon.color}
          />
        </View>
      }
      value={
        run.status !== "completed"
          ? activityStatusLabel(run.status)
          : run.messageId
            ? undefined
            : t("No reply")
      }
      chevron={onPress ? "right" : undefined}
      onPress={onPress}
    />
  );
}

function createRunHistoryStyles(passedTokens?: ColorTokens) {
  const tokens = passedTokens ?? mobileTokens();
  const isLight = isLightPalette(tokens);
  const hairline = StyleSheet.hairlineWidth ?? 0.5;
  return StyleSheet.create({
    runChip: {
      width: 30,
      height: 30,
      borderRadius: 10,
      borderCurve: "continuous",
      backgroundColor: isLight ? "#F8F6F2" : "#2A303B",
      borderWidth: hairline,
      borderColor: isLight ? "rgba(38, 35, 31, 0.07)" : "rgba(245, 244, 240, 0.10)",
      alignItems: "center",
      justifyContent: "center",
    },
    runIcon: { color: isLight ? "#6E675E" : "#B8B3AA" },
  });
}
