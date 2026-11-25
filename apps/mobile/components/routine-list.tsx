import type { Routine } from "@rakazo/contracts";
import type { ColorTokens } from "@rakazo/ui-tokens";
import { ScrollView, StyleSheet, View } from "react-native";
import { mobileTokens } from "../lib/appearance";
import { useI18n } from "../lib/i18n";
import { native, useThemedStyles } from "../lib/native";
import { routineRowDetail, routineRowLabel } from "../lib/routine";
import { useSideInsets } from "../lib/side-insets";
import { NativeSwitch } from "./native-switch";
import { NativeSymbol } from "./native-symbol";
import { SettingsGroup, SettingsRow, useStackedSettings } from "./settings-group";

export type RoutineListProps = {
  routines: Routine[];
  timeZone: string | undefined;
  /** False while a delete is in flight. */
  canDelete: boolean;
  onOpen: (routine: Routine) => void;
  onToggle: (routine: Routine, active: boolean) => void;
  onDelete: (routine: Routine) => void;
};

/** Settings-style rows; iOS adds the system swipe to delete. Here a long press deletes. */
export function RoutineList({
  routines,
  timeZone,
  canDelete,
  onOpen,
  onToggle,
  onDelete,
}: RoutineListProps) {
  const { t } = useI18n();
  const styles = useThemedStyles(createStyles);
  const stacked = useStackedSettings();
  const sideInsets = useSideInsets();
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={[styles.screen, sideInsets]}
      contentContainerStyle={[styles.content, stacked && styles.compactContent]}
      contentInsetAdjustmentBehavior="automatic"
    >
      <SettingsGroup gradient="lavender">
        {routines.map((routine) => {
          const deletable = canDelete && routine.editable !== false;
          const deleteLabel = t("Delete {name}", { name: routine.name });
          const switchLabel = t("Active: {name}", { name: routine.name });
          return (
            <SettingsRow
              key={routine.id}
              accessibilityRole="button"
              accessibilityLabel={routineRowLabel(routine)}
              // The row is one element for screen readers, so its switch and delete are actions.
              accessibilityActions={[
                ...(routine.editable === false ? [] : [{ name: "toggle", label: switchLabel }]),
                ...(deletable ? [{ name: "delete", label: deleteLabel }] : []),
              ]}
              onAccessibilityAction={({ nativeEvent }) =>
                nativeEvent.actionName === "delete"
                  ? onDelete(routine)
                  : onToggle(routine, !routine.active)
              }
              title={routine.name}
              detail={routineRowDetail(routine, timeZone)}
              onPress={() => onOpen(routine)}
              onLongPress={deletable ? () => onDelete(routine) : undefined}
              leading={
                <View style={styles.scheduleBadge}>
                  <NativeSymbol
                    ios="clock"
                    android="time-outline"
                    size={16}
                    color={styles.scheduleIcon.color}
                  />
                </View>
              }
              trailing={
                <NativeSwitch
                  accessibilityLabel={switchLabel}
                  disabled={routine.editable === false}
                  value={routine.active}
                  onValueChange={(active) => onToggle(routine, active)}
                />
              }
            />
          );
        })}
      </SettingsGroup>
    </ScrollView>
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

function createStyles(passedTokens?: ColorTokens) {
  const tokens = passedTokens ?? mobileTokens();
  const isLight = isLightPalette(tokens);
  const hairline = StyleSheet.hairlineWidth ?? 0.5;
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: native.groupedPage },
    content: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 36 },
    compactContent: { paddingHorizontal: 8 },
    scheduleBadge: {
      width: 34,
      height: 34,
      borderRadius: 11,
      borderCurve: "continuous",
      backgroundColor: isLight ? "#F8F6F2" : "#2A303B",
      borderWidth: hairline,
      borderColor: isLight ? "rgba(38, 35, 31, 0.07)" : "rgba(245, 244, 240, 0.10)",
      alignItems: "center",
      justifyContent: "center",
    },
    scheduleIcon: { color: isLight ? "#6E675E" : "#B8B3AA" },
  });
}
