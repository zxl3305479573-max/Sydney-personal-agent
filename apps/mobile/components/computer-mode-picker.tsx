import type { ComputerMode } from "@rakazo/contracts";
import { BOT_COMPUTER_MODES } from "@rakazo/contracts";
import { Text, View } from "react-native";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { NativeSegmentedControl } from "./native-segmented-control";

function isLightSurface(background?: string): boolean {
  if (!background || !background.startsWith("#") || background.length < 7) return true;
  return Number.parseInt(background.slice(1, 3), 16) >= 128;
}

export function ComputerModePicker({
  value,
  onChange,
  disabled = false,
  plain = false,
}: {
  value: ComputerMode | undefined;
  onChange: (mode: ComputerMode) => void;
  disabled?: boolean;
  plain?: boolean;
}) {
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const isLight = isLightSurface(tokens?.background);
  const cardBg = isLight ? "#FFFEFC" : "#242933";
  const cardBorder = isLight ? "rgba(38, 35, 31, 0.055)" : "rgba(245, 244, 240, 0.09)";
  const fg = tokens?.foreground ?? (isLight ? "#26231F" : "#F5F4F0");
  const mutedFg = tokens?.mutedForeground ?? (isLight ? "#6E675E" : "#B8B3AA");

  return (
    <View
      style={
        plain
          ? { gap: 8 }
          : {
              marginTop: 14,
              padding: 18,
              borderRadius: 20,
              backgroundColor: cardBg,
              borderWidth: 0.5,
              borderColor: cardBorder,
              shadowColor: "#26231F",
              shadowOpacity: isLight ? 0.028 : 0.16,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 5 },
              elevation: 1,
            }
      }
    >
      {!plain ? (
        <Text
          style={
            plain
              ? { color: mutedFg, fontSize: 14 }
              : { color: fg, marginBottom: 12, fontSize: 16, fontWeight: "600" }
          }
        >
          {t("Computer")}
        </Text>
      ) : null}
      <NativeSegmentedControl
        accessibilityLabel={t("Computer")}
        disabled={disabled}
        onChange={onChange}
        options={BOT_COMPUTER_MODES.map((value) => ({
          value,
          label: value === "team" ? t("Team") : t("Private"),
        }))}
        value={value}
      />
    </View>
  );
}
