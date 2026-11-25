import { typeScale } from "@rakazo/ui-tokens";
import { Pressable, Text, View } from "react-native";
import { useMobileTokens } from "../lib/native";
import { GlassSurface } from "./glass-surface";
import { NativeSymbol } from "./native-symbol";

function isLightSurface(background?: string): boolean {
  if (!background || !background.startsWith("#") || background.length < 7) return true;
  return Number.parseInt(background.slice(1, 3), 16) >= 128;
}

export function ProjectFolderCard({
  label,
  subtitle,
  onPress,
  disabled = false,
}: {
  label: string;
  subtitle?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const tokens = useMobileTokens();
  const isLight = isLightSurface(tokens?.background);
  const cardBg = isLight ? "#FFFEFC" : "#242933";
  const cardBorder = isLight ? "rgba(38, 35, 31, 0.055)" : "rgba(245, 244, 240, 0.09)";
  const badgeBg = isLight ? "#F8F6F2" : "#2A303B";
  const badgeBorder = isLight ? "rgba(38, 35, 31, 0.07)" : "rgba(245, 244, 240, 0.10)";
  const accentTaupe = isLight ? "#6E675E" : "#B8B3AA";
  const fg = tokens?.foreground ?? (isLight ? "#26231F" : "#F5F4F0");
  const mutedFg = tokens?.mutedForeground ?? accentTaupe;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${label} · ${subtitle}` : label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: disabled ? 0.5 : pressed ? 0.72 : 1 })}
    >
      <GlassSurface
        shape="roundedRectangle"
        cornerRadius={22}
        gradient="slate"
        style={{
          minHeight: 72,
          borderRadius: 22,
          paddingHorizontal: 18,
          paddingVertical: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
        }}
        fallbackStyle={{
          backgroundColor: cardBg,
          borderRadius: 22,
          borderWidth: 0.5,
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
            width: 42,
            height: 42,
            borderRadius: 13,
            backgroundColor: badgeBg,
            borderWidth: 0.5,
            borderColor: badgeBorder,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <NativeSymbol ios="folder.fill" android="folder" size={21} color={accentTaupe} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text style={{ color: fg, ...typeScale.cardTitle }}>{label}</Text>
          {subtitle ? (
            <Text style={{ color: mutedFg, ...typeScale.caption }}>{subtitle}</Text>
          ) : null}
        </View>
        <NativeSymbol
          ios="chevron.right"
          android="chevron-forward"
          size={16}
          color={mutedFg}
        />
      </GlassSurface>
    </Pressable>
  );
}
