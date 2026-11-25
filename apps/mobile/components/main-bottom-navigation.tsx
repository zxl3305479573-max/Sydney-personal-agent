import { usePathname, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "../lib/i18n";
import { openMainNavigation } from "../lib/main-navigation";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";

export function MainBottomNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tokens = useMobileTokens();
  const appearance = useResolvedAppearance();
  const isLight = appearance === "light";
  const { locale, t } = useI18n();
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  const items = [
    {
      route: "/" as const,
      label: chinese ? (traditional ? "首頁" : "首页") : "Home",
    },
    {
      route: "/chats" as const,
      label: chinese ? "聊天" : t("Chats"),
    },
    {
      route: "/projects" as const,
      label: chinese ? (traditional ? "項目" : "项目") : "Projects",
    },
  ];
  return (
    <View
      testID="main-bottom-navigation"
      style={{
        flexShrink: 0,
        flexDirection: "row",
        minHeight: 52 + insets.bottom,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: isLight ? "rgba(38, 35, 31, 0.06)" : tokens.border,
        backgroundColor: isLight ? "#FAF8F4" : tokens.card,
        paddingLeft: insets.left + 8,
        paddingRight: insets.right + 8,
        paddingBottom: insets.bottom,
      }}
    >
      {items.map((item) => {
        const selected = pathname === item.route;
        const color = selected ? tokens.foreground : tokens.mutedForeground;
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
              minHeight: 52,
              flexDirection: "column",
              paddingTop: 10,
              paddingBottom: 6,
              paddingHorizontal: 8,
              gap: 5,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <Text
              numberOfLines={1}
              style={{
                color,
                fontSize: 15,
                lineHeight: 20,
                fontWeight: selected ? "600" : "400",
                textAlign: "center",
              }}
            >
              {item.label}
            </Text>
            <View
              accessibilityElementsHidden
              style={{
                width: 18,
                height: 2,
                borderRadius: 1,
                backgroundColor: selected ? (isLight ? "#5E584F" : tokens.foreground) : "transparent",
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
