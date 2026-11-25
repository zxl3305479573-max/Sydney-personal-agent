import type { Routine } from "@rakazo/contracts";
import type { ColorTokens } from "@rakazo/ui-tokens";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { NativeActionButton } from "../components/native-action-button";
import { RoutineList } from "../components/routine-list";
import { mobileTokens } from "../lib/appearance";
import { useI18n } from "../lib/i18n";
import type { NativeColors } from "../lib/native";
import { native, useThemedStyles } from "../lib/native";
import { deviceTimeZone } from "../lib/routine";
import {
  loadBotRoutines,
  removeBotRoutine,
  setRoutineActive,
  useBotRoutines,
} from "../lib/routine-store";
import { useSideInsets } from "../lib/side-insets";
import type { ResolvedScopedTheme } from "../lib/theme-pack";
import { errorText } from "../lib/user-error";

export default function Routines() {
  const sideInsets = useSideInsets();
  const { t } = useI18n();
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const { botId = "", name } = useLocalSearchParams<{ botId?: string; name?: string }>();
  const { routines, error } = useBotRoutines(botId);
  const [deleting, setDeleting] = useState(false);

  async function remove(routine: Routine) {
    setDeleting(true);
    try {
      await removeBotRoutine(botId, routine.id);
    } catch (cause) {
      Alert.alert(t("Could not delete routine"), errorText(cause, t("Try again.")));
    } finally {
      setDeleting(false);
    }
  }

  function confirmDelete(routine: Routine) {
    if (deleting) return;
    Alert.alert(
      routine.name.trim()
        ? t('Delete "{name}"?', { name: routine.name })
        : t("Delete this routine?"),
      t("This permanently deletes the routine and its run history."),
      [
        { text: t("Cancel"), style: "cancel" },
        { text: t("Delete"), style: "destructive", onPress: () => void remove(routine) },
      ],
    );
  }

  if (routines?.length) {
    return (
      <RoutineList
        routines={routines}
        timeZone={deviceTimeZone()}
        canDelete={!deleting}
        onOpen={(routine) =>
          router.push({
            pathname: "/routine",
            params: { botId, botName: name, routineId: routine.id, origin: "profile" },
          })
        }
        onToggle={(routine, active) =>
          setRoutineActive(botId, routine, active, (cause) =>
            Alert.alert(t("Could not update routine"), errorText(cause, t("Try again."))),
          )
        }
        onDelete={confirmDelete}
      />
    );
  }
  return (
    <View style={[styles.empty, sideInsets]}>
      {routines ? (
        // There is no add button here: routines are set up by asking the bot.
        <View style={styles.emptyCard}>
          <Text style={styles.message}>{t("Ask this Bot in chat to set up a routine.")}</Text>
        </View>
      ) : error ? (
        <View style={styles.emptyCard}>
          <Text style={styles.message}>{t("Could not load routines")}</Text>
          <NativeActionButton
            label={t("Try Again")}
            variant="text"
            prominence="secondary"
            style={styles.retry}
            onPress={() => void loadBotRoutines(botId)}
          />
        </View>
      ) : (
        <ActivityIndicator color={native.secondaryLabel} />
      )}
    </View>
  );
}

function isLightPalette(tokens?: Partial<ColorTokens> | null): boolean {
  const bg = tokens?.background;
  if (typeof bg === "string" && bg.startsWith("#") && bg.length >= 7) {
    const red = Number.parseInt(bg.slice(1, 3), 16);
    if (!Number.isNaN(red)) return red >= 128;
  }
  return true;
}

function createStyles(
  tokens?: ColorTokens,
  colors: NativeColors = native,
  scope: ResolvedScopedTheme | null = null,
) {
  const isLight = isLightPalette(tokens);
  const hairline = StyleSheet.hairlineWidth ?? 0.5;
  return StyleSheet.create({
    empty: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
      backgroundColor: scope?.background ? "transparent" : colors.groupedPage,
    },
    emptyCard: {
      width: "100%",
      maxWidth: 420,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 28,
      paddingVertical: 32,
      gap: 10,
      borderRadius: 22,
      borderCurve: "continuous",
      backgroundColor: scope ? colors.groupedCell : isLight ? "#FFFEFC" : "#242933",
      borderWidth: hairline,
      borderColor: scope
        ? colors.separator
        : isLight
          ? "rgba(38, 35, 31, 0.055)"
          : "rgba(245, 244, 240, 0.09)",
      shadowColor: "#26231F",
      shadowOpacity: isLight ? 0.028 : 0.16,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 5 },
      elevation: 1,
    },
    message: { color: colors.secondaryLabel, fontSize: 17, lineHeight: 24, textAlign: "center" },
    // The button aligns itself to the start by default.
    retry: { alignSelf: "center" },
  });
}
