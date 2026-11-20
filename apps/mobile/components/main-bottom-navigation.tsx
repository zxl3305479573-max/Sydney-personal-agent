import { usePathname, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "../lib/i18n";
import { openMainNavigation } from "../lib/main-navigation";
import { useMobileTokens } from "../lib/native";
import { NativeSymbol } from "./native-symbol";

export function MainBottomNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tokens = useMobileTokens();
  const { locale } = useI18n();
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  const items = [
    {
      route: "/integrations" as const,
      label: chinese ? (traditional ? "應用" : "应用") : "Apps",
      ios: "square.grid.2x2",
      android: "grid-outline" as const,
    },
    {
      route: "/projects" as const,
      label: chinese ? (traditional ? "項目" : "项目") : "Projects",
      ios: "folder",
      android: "folder-outline" as const,
    },
    {
      route: "/github" as const,
      label: "GitHub",
      ios: "chevron.left.forwardslash.chevron.right",
      android: "logo-github" as const,
    },
  ];
  return (
    <View
      testID="main-bottom-navigation"
      style={{
        flexShrink: 0,
        flexDirection: "row",
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: tokens.border,
        backgroundColor: tokens.background,
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: insets.bottom,
      }}
    >
      {items.map((item) => {
        const selected = pathname === item.route;
        const color = selected ? tokens.primary : tokens.mutedForeground;
        return (
          <Pressable
            key={item.route}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected }}
            onPress={() => openMainNavigation(router, pathname, item.route)}
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 0,
              minHeight: 56,
              flexDirection: "column",
              paddingVertical: 7,
              gap: 4,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <NativeSymbol ios={item.ios} android={item.android} size={22} color={color} />
            <Text numberOfLines={1} style={{ color, fontSize: 11, fontWeight: "500" }}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
