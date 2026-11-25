import { usePathname, useRouter } from "expo-router";
import type { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "../lib/i18n";
import type { MainNavigationRoute } from "../lib/main-navigation";
import { openMainNavigation } from "../lib/main-navigation";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";
import { useScopedTheme } from "../lib/scoped-theme-context";
import { triggerTabScrollToTop } from "../lib/tab-scroll-to-top";
import { MotionPressable } from "./motion-pressable";
import { NativeSymbol } from "./native-symbol";
import { TabIndicator } from "./tab-indicator";

type TabBarRoute = {
  key: string;
  name: string;
};

type AndroidSymbolName = ComponentProps<typeof NativeSymbol>["android"];

export type MainBottomNavigationProps = {
  state?: {
    index: number;
    routes: readonly TabBarRoute[];
  };
  navigation?: {
    emit: (event: { type: "tabPress"; target: string; canPreventDefault: true }) => {
      defaultPrevented?: boolean;
    };
    navigate: (name: string) => void;
  };
};

type MainTabItem = {
  tabName: "index" | "chats" | "projects";
  route: MainNavigationRoute;
  label: string;
  iosIcon: string;
  iosActiveIcon: string;
  androidIcon: AndroidSymbolName;
  androidActiveIcon: AndroidSymbolName;
};

export function MainBottomNavigation({ state, navigation }: MainBottomNavigationProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tokens = useMobileTokens();
  const appearance = useResolvedAppearance();
  const isLight = appearance === "light";
  const scope = useScopedTheme();
  const indicatorRadius = scope ? Math.max(6, Math.min(18, scope.geometry.controlRadius)) : 1;
  const topBorderWidth =
    scope?.surface === "outlined"
      ? Math.max(1, Math.min(2, scope.geometry.borderWidth))
      : StyleSheet.hairlineWidth;
  const { locale, t } = useI18n();
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  const items: readonly MainTabItem[] = [
    {
      tabName: "index",
      route: "/",
      label: chinese ? (traditional ? "首頁" : "首页") : "Home",
      iosIcon: "house",
      iosActiveIcon: "house.fill",
      androidIcon: "home-outline",
      androidActiveIcon: "home",
    },
    {
      tabName: "chats",
      route: "/chats",
      label: chinese ? "聊天" : t("Chats"),
      iosIcon: "bubble.left.and.bubble.right",
      iosActiveIcon: "bubble.left.and.bubble.right.fill",
      androidIcon: "chatbubbles-outline",
      androidActiveIcon: "chatbubbles",
    },
    {
      tabName: "projects",
      route: "/projects",
      label: chinese ? (traditional ? "項目" : "项目") : "Projects",
      iosIcon: "folder",
      iosActiveIcon: "folder.fill",
      androidIcon: "folder-outline",
      androidActiveIcon: "folder",
    },
  ];
  const activeTabName = state ? state.routes[state.index]?.name : undefined;

  return (
    <View
      testID="main-bottom-navigation"
      style={{
        flexShrink: 0,
        flexDirection: "row",
        minHeight: 58 + insets.bottom,
        borderTopWidth: topBorderWidth,
        borderTopColor: scope ? tokens.border : isLight ? "rgba(38, 35, 31, 0.06)" : tokens.border,
        backgroundColor: scope ? tokens.background : isLight ? "#FAF8F4" : tokens.card,
        paddingLeft: insets.left + 8,
        paddingRight: insets.right + 8,
        paddingBottom: insets.bottom,
      }}
    >
      {items.map((item) => {
        const selected = activeTabName ? activeTabName === item.tabName : pathname === item.route;
        const color = selected ? tokens.foreground : tokens.mutedForeground;
        const handlePress = () => {
          if (selected) {
            triggerTabScrollToTop(item.route);
            return;
          }
          if (state && navigation) {
            const targetRoute = state.routes.find((entry) => entry.name === item.tabName);
            const event = targetRoute
              ? navigation.emit({
                  type: "tabPress",
                  target: targetRoute.key,
                  canPreventDefault: true,
                })
              : { defaultPrevented: false };
            if (!event.defaultPrevented) {
              navigation.navigate(item.tabName);
            }
            return;
          }
          openMainNavigation(router, pathname, item.route);
        };
        return (
          <MotionPressable
            key={item.route}
            preset="control"
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected }}
            onPress={handlePress}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 56,
              flexDirection: "column",
              paddingTop: 8,
              paddingBottom: 6,
              paddingHorizontal: 8,
              gap: 3,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <NativeSymbol
              ios={selected ? item.iosActiveIcon : item.iosIcon}
              android={selected ? item.androidActiveIcon : item.androidIcon}
              size={20}
              color={color}
            />
            <Text
              numberOfLines={1}
              style={{
                color,
                fontSize: 11,
                lineHeight: 14,
                fontWeight: selected ? "600" : "400",
                textAlign: "center",
              }}
            >
              {item.label}
            </Text>
            <TabIndicator
              selected={selected}
              borderRadius={indicatorRadius}
              color={isLight ? "#5E584F" : tokens.foreground}
            />
          </MotionPressable>
        );
      })}
    </View>
  );
}
