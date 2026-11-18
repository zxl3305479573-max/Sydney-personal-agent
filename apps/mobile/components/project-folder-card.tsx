import { Pressable, Text, View } from "react-native";
import { useMobileTokens } from "../lib/native";
import { GlassSurface } from "./glass-surface";
import { NativeSymbol } from "./native-symbol";

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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${label} · ${subtitle}` : label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}
    >
      <GlassSurface
        shape="roundedRectangle"
        cornerRadius={16}
        style={{
          minHeight: 64,
          borderRadius: 16,
          padding: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
        fallbackStyle={{
          backgroundColor: tokens.card,
          borderWidth: 1,
          borderColor: tokens.border,
        }}
      >
        <NativeSymbol ios="folder.fill" android="folder" size={26} color={tokens.primary} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text
            numberOfLines={1}
            style={{ color: tokens.foreground, fontSize: 16, fontWeight: "600" }}
          >
            {label}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={{ color: tokens.mutedForeground, fontSize: 13 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <NativeSymbol
          ios="chevron.right"
          android="chevron-forward"
          size={16}
          color={tokens.mutedForeground}
        />
      </GlassSurface>
    </Pressable>
  );
}
