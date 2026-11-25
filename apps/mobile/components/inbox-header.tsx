import { MenuView } from "@expo/ui/community/menu";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CreateAction } from "../lib/create-chooser";
import { createMenuActions, isCreateAction } from "../lib/create-chooser";
import { useI18n } from "../lib/i18n";
import { native, useMobileTokens, useResolvedAppearance, useThemedStyles } from "../lib/native";
import { CREATE_MENU_GAP, createHomeStyles } from "./home-styles";
import { NativeSymbol } from "./native-symbol";

export function InboxRosterHeading({
  kind,
  onCreateGroup,
}: {
  kind: "bot" | "group";
  onCreateGroup: () => void;
}) {
  const { t, locale } = useI18n();
  return (
    <View
      style={{
        minHeight: 44,
        marginHorizontal: 20,
        marginTop: 8,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Text
        accessibilityRole="header"
        style={{ color: native.secondaryLabel, fontSize: 15, fontWeight: "600" }}
      >
        {locale.startsWith("zh")
          ? kind === "bot"
            ? locale === "zh-TW"
              ? "小夥伴"
              : "小伙伴"
            : locale === "zh-TW"
              ? "群組對話"
              : "群聊"
          : t(kind === "bot" ? "Bots" : "Group")}
      </Text>
      {kind === "group" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("New group chat")}
          onPress={onCreateGroup}
          style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
        >
          <NativeSymbol ios="plus" android="add" size={20} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function InboxIntro({ activityMode }: { activityMode: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const styles = useThemedStyles(createHomeStyles);
  return (
    <View style={styles.inboxIntro}>
      <Text accessibilityRole="header" style={styles.inboxTitle}>
        {t(activityMode ? "Activity" : "Chats")}
      </Text>
      <Pressable
        testID="home-search-button"
        accessibilityRole="button"
        accessibilityLabel={t("Search")}
        onPress={() => router.push("/search")}
        style={({ pressed }) => [styles.inboxSearch, pressed && styles.rowPressed]}
      >
        <NativeSymbol
          ios="magnifyingglass"
          android="search"
          size={17}
          color={native.secondaryLabel}
        />
        <Text style={styles.inboxSearchLabel}>{t("Search")}</Text>
      </Pressable>
    </View>
  );
}

/** The inbox's own header where the native Liquid Glass bar is unavailable. */
export function InboxHeader({
  initials,
  activityMode,
  toggleActivityMode,
  runCreateAction,
  columnInsets,
}: {
  initials: string;
  activityMode: boolean;
  toggleActivityMode: () => void;
  runCreateAction: (action: CreateAction) => void;
  columnInsets: { left: number; right: number };
}) {
  const tokens = useMobileTokens();
  const appearance = useResolvedAppearance();
  const styles = useThemedStyles(createHomeStyles);
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: Math.max(insets.top, 20) + 8,
          paddingLeft: 16 + columnInsets.left,
          paddingRight: 16 + columnInsets.right,
        },
      ]}
    >
      <View style={styles.circleButton}>
        <HeaderButton
          accessibilityLabel={t("Account")}
          onPress={() => router.push("/settings-home")}
        >
          <Text style={styles.profileInitials}>{initials}</Text>
        </HeaderButton>
      </View>
      <View style={styles.headerActions}>
        <HeaderButton
          accessibilityLabel={t("Activity")}
          active={activityMode}
          accent
          onPress={toggleActivityMode}
        >
          <NativeSymbol
            ios={activityMode ? "bell.fill" : "bell"}
            android={activityMode ? "notifications" : "notifications-outline"}
            size={17}
            color={activityMode ? tokens.primaryForeground : tokens.foreground}
          />
        </HeaderButton>
        <MenuView
          actions={createMenuActions(t, Platform.OS)}
          {...(Platform.OS === "android" ? { style: { marginBottom: -CREATE_MENU_GAP } } : {})}
          colorScheme={appearance}
          onPressAction={({ nativeEvent }) => {
            if (isCreateAction(nativeEvent.event)) runCreateAction(nativeEvent.event);
          }}
        >
          <View
            accessibilityLabel={t("Create")}
            accessibilityRole="button"
            style={[styles.headerButton, Platform.OS === "android" && styles.createMenuAnchor]}
          >
            <NativeSymbol ios="plus" android="add" size={18} />
          </View>
        </MenuView>
      </View>
    </View>
  );
}

function HeaderButton({
  children,
  onPress,
  accessibilityLabel,
  active = false,
  accent = false,
}: {
  children: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  active?: boolean;
  accent?: boolean;
}) {
  const styles = useThemedStyles(createHomeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.headerButton,
        accent && active
          ? styles.headerButtonAccent
          : (active || pressed) && styles.headerButtonActive,
      ]}
    >
      {children}
    </Pressable>
  );
}
