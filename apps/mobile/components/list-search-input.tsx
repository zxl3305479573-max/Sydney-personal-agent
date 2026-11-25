import type { ColorTokens } from "@rakazo/ui-tokens";
import { StyleSheet, TextInput } from "react-native";
import { mobileTokens } from "../lib/appearance";
import { useI18n } from "../lib/i18n";
import { native, useThemedStyles } from "../lib/native";
import { useScopedTheme } from "../lib/scoped-theme-context";

function isLightPalette(tokens?: Partial<ColorTokens> | null): boolean {
  const bg = tokens?.background;
  if (typeof bg === "string" && bg.startsWith("#") && bg.length >= 7) {
    const red = Number.parseInt(bg.slice(1, 3), 16);
    if (!Number.isNaN(red)) return red >= 128;
  }
  return true;
}

export function ListSearchInput({
  query,
  setQuery,
}: {
  query: string;
  setQuery: (query: string) => void;
}) {
  const { t } = useI18n();
  const styles = useThemedStyles(createStyles);
  const scope = useScopedTheme();
  return (
    <TextInput
      accessibilityLabel={t("Search")}
      placeholder={t("Search")}
      placeholderTextColor={native.secondaryLabel}
      value={query}
      onChangeText={setQuery}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
      style={[
        styles.search,
        scope
          ? {
              backgroundColor: scope.tokens?.card ?? native.groupedCell,
              borderColor: scope.tokens?.border ?? native.separator,
            }
          : null,
      ]}
    />
  );
}
function createStyles(passedTokens?: ColorTokens) {
  const tokens = passedTokens ?? mobileTokens();
  const isLight = isLightPalette(tokens);
  return StyleSheet.create({
    search: {
      color: native.label,
      backgroundColor: isLight ? "#FFFEFC" : "#242933",
      borderRadius: 16,
      borderCurve: "continuous",
      borderWidth: StyleSheet.hairlineWidth ?? 0.5,
      borderColor: isLight ? "rgba(38, 35, 31, 0.06)" : "rgba(245, 244, 240, 0.09)",
      paddingHorizontal: 14,
      paddingVertical: 12,
      minHeight: 48,
      marginBottom: 16,
      fontSize: 17,
      shadowColor: "#26231F",
      shadowOpacity: isLight ? 0.025 : 0.14,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 1,
    },
  });
}
