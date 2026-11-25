import type { ColorTokens } from "@rakazo/ui-tokens";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { GlassSurface } from "../components/glass-surface";
import { glassHeaderOptions } from "../components/glass-title";
import { NativeActionButton } from "../components/native-action-button";
import { RoutineRunHistory } from "../components/routine-run-history";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { routineStatusLine } from "../lib/routine";
import { loadBotRoutines, useBotRoutines } from "../lib/routine-store";
import { useScopedTheme, useScreenBackground } from "../lib/scoped-theme-context";
import { useSideInsets } from "../lib/side-insets";
import { errorText } from "../lib/user-error";

function isLightPalette(tokens?: Partial<ColorTokens> | null): boolean {
  const bg = tokens?.background;
  if (typeof bg === "string" && bg.startsWith("#") && bg.length >= 7) {
    const red = Number.parseInt(bg.slice(1, 3), 16);
    if (!Number.isNaN(red)) return red >= 128;
  }
  return true;
}

export default function RoutineDetail() {
  const sideInsets = useSideInsets();
  const tokens = useMobileTokens();
  const screenBackground = useScreenBackground(tokens.background);
  const { t } = useI18n();
  const { botId, botName, routineId, origin } = useLocalSearchParams<{
    botId?: string;
    botName?: string;
    routineId?: string;
    origin?: string;
  }>();
  const router = useRouter();
  // Opened from the list, the routine is already known; it still reads again. A routine missing
  // from what was known before only counts as gone once that read answers.
  const {
    routines,
    error: loadError,
    readSinceShown,
    failedSinceShown,
  } = useBotRoutines(botId ?? "", { poll: false });
  const routine = routines?.find((item) => item.id === routineId) ?? null;
  const error =
    !botId || !routineId
      ? t("Routine link is incomplete")
      : routine
        ? null
        : failedSinceShown
          ? errorText(loadError, t("Could not load routine"))
          : readSinceShown
            ? t("This routine no longer exists")
            : null;
  const loading = !routine && !error;

  const scope = useScopedTheme();
  const isLight = scope ? scope.appearance === "light" : isLightPalette(tokens);
  const hairline = StyleSheet.hairlineWidth ?? 0.5;
  const cardBg = scope ? (scope.tokens?.card ?? "#FFFEFC") : isLight ? "#FFFEFC" : "#242933";
  const cardBorder = scope
    ? (scope.tokens?.border ?? "rgba(38, 35, 31, 0.06)")
    : isLight
      ? "rgba(38, 35, 31, 0.055)"
      : "rgba(245, 244, 240, 0.09)";
  const chipBg = isLight ? "#F8F6F2" : "#2A303B";
  const chipBorder = isLight ? "rgba(38, 35, 31, 0.07)" : "rgba(245, 244, 240, 0.10)";

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={[{ flex: 1, backgroundColor: screenBackground }, sideInsets]}
      contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 36 }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen options={glassHeaderOptions(routine?.name ?? t("Routine"))} />
      {loading ? <ActivityIndicator color={tokens.mutedForeground} /> : null}
      {error ? (
        <View
          style={{
            gap: 12,
            padding: 20,
            borderRadius: 20,
            backgroundColor: cardBg,
            borderWidth: hairline,
            borderColor: cardBorder,
          }}
        >
          <Text
            accessibilityRole="alert"
            style={{ color: tokens.destructive, fontSize: 15, lineHeight: 22 }}
          >
            {error}
          </Text>
          {failedSinceShown && botId ? (
            <NativeActionButton
              label={t("Retry")}
              prominence="secondary"
              onPress={() => void loadBotRoutines(botId)}
            />
          ) : null}
        </View>
      ) : null}
      {routine ? (
        <>
          <GlassSurface
            shape="roundedRectangle"
            cornerRadius={20}
            fallbackStyle={{ backgroundColor: cardBg, borderRadius: 20 }}
            style={{
              borderRadius: 20,
              borderCurve: "continuous",
              padding: 16,
              borderWidth: hairline,
              borderColor: cardBorder,
              shadowColor: "#26231F",
              shadowOpacity: isLight ? 0.028 : 0.16,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 5 },
              elevation: 1,
            }}
          >
            <View
              style={{
                alignSelf: "flex-start",
                backgroundColor: chipBg,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderWidth: hairline,
                borderColor: chipBorder,
              }}
            >
              <Text style={{ color: isLight ? "#5E584F" : tokens.mutedForeground, fontSize: 14 }}>
                {routineStatusLine(routine)}
              </Text>
            </View>
          </GlassSurface>
          <View style={{ gap: 10 }}>
            <Text
              accessibilityRole="header"
              style={{
                color: tokens.foreground,
                fontSize: 17,
                lineHeight: 22,
                fontWeight: "600",
                paddingStart: 4,
              }}
            >
              {t("Prompt")}
            </Text>
            <GlassSurface
              shape="roundedRectangle"
              cornerRadius={20}
              style={{
                borderRadius: 20,
                borderCurve: "continuous",
                borderWidth: hairline,
                borderColor: cardBorder,
                shadowColor: "#26231F",
                shadowOpacity: isLight ? 0.028 : 0.16,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 5 },
                elevation: 1,
              }}
              fallbackStyle={{ backgroundColor: cardBg, borderRadius: 20 }}
            >
              <Text
                selectable
                style={{
                  color: tokens.foreground,
                  fontSize: 17,
                  lineHeight: 26,
                  padding: 18,
                }}
              >
                {routine.prompt}
              </Text>
            </GlassSurface>
          </View>
          {origin !== "profile" ? (
            <NativeActionButton
              label={t("Open conversation")}
              onPress={() =>
                router.push({
                  pathname: "/thread",
                  params: { botId: botId ?? "", name: botName ?? t("Bot") },
                })
              }
            />
          ) : null}
          <RoutineRunHistory routineId={routine.id} botName={botName} />
        </>
      ) : null}
    </ScrollView>
  );
}
