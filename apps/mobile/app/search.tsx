import type { ColorTokens } from "@rakazo/ui-tokens";
import { botColors, typeScale } from "@rakazo/ui-tokens";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { KeyboardController } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BotAvatar } from "../components/bot-avatar";
import { GlassIconButton } from "../components/glass-icon-button";
import { GlassSurface } from "../components/glass-surface";
import { GroupAvatar } from "../components/group-avatar";
import { MotionPressable } from "../components/motion-pressable";
import { NativeActionButton } from "../components/native-action-button";
import { NativeSymbol } from "../components/native-symbol";
import { readableGutters } from "../lib/adaptive-layout";
import { currentApiBase, selectedSpaceId, selectSpace, spaceSelectionSeq } from "../lib/api";
import { mobileTokens, resolveMobileAppearance } from "../lib/appearance";
import { cardGradient } from "../lib/card-gradient";
import { useI18n } from "../lib/i18n";
import type { NativeColors } from "../lib/native";
import { native, useMobileTokens, useResolvedAppearance, useThemedStyles } from "../lib/native";
import { getSearchInbox, subscribeSearchInbox } from "../lib/search-inbox";
import type { SearchSheetRow } from "../lib/search-sheet";
import { searchSheetRows } from "../lib/search-sheet";
import { currentSessionGeneration } from "../lib/session";
import type { ResolvedScopedTheme } from "../lib/theme-pack";
import { useSearch } from "../lib/use-search";

const kindIcons = {
  conversation: { ios: "bubble.left.and.bubble.right", android: "chatbubbles-outline" },
  message: { ios: "bubble.left", android: "chatbubble-outline" },
  file: { ios: "doc", android: "document-outline" },
  link: { ios: "link", android: "link-outline" },
  routine: { ios: "clock.arrow.circlepath", android: "time-outline" },
} as const;

export default function SearchSheet() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const navigation = useNavigation();
  const styles = useThemedStyles(createStyles);
  const tokens = useMobileTokens();
  const appearance = useResolvedAppearance();
  const insets = useSafeAreaInsets();
  const gutters = readableGutters(useWindowDimensions().width, insets);
  const field = useRef<TextInput>(null);
  const opening = useRef(false);
  const attempt = useRef(0);
  const focused = useRef(false);
  const [query, setQuery] = useState("");
  const spaces = useSyncExternalStore(subscribeSearchInbox, getSearchInbox);
  const { hits, loading, error, retry } = useSearch(query);
  const rows = useMemo(() => searchSheetRows(spaces, query, hits), [spaces, query, hits, locale]);

  const cancelOpen = useCallback(() => {
    attempt.current += 1;
    focused.current = false;
    opening.current = true;
  }, []);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      opening.current = false;
      const unsubscribe = navigation.addListener("beforeRemove", cancelOpen);
      return () => {
        cancelOpen();
        unsubscribe();
      };
    }, [navigation, cancelOpen]),
  );

  useEffect(() => {
    // Native formSheet may finish attaching after TextInput's autoFocus runs.
    const timer = setTimeout(() => {
      if (focused.current && !opening.current) field.current?.focus();
    }, 350);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  const open = async (row: SearchSheetRow) => {
    if (!focused.current || opening.current) return;
    opening.current = true;
    const currentAttempt = ++attempt.current;
    const isCurrent = () => focused.current && attempt.current === currentAttempt;
    const previousSpaceId = selectedSpaceId();
    const generation = currentSessionGeneration();
    const apiBase = currentApiBase();
    let selected = false;
    let selectionSeq: number | undefined;
    let navigated = false;
    try {
      if (row.spaceId) {
        const selection = selectSpace(row.spaceId);
        selectionSeq = spaceSelectionSeq();
        selected = await selection;
        if (
          !isCurrent() ||
          selectionSeq !== spaceSelectionSeq() ||
          (selected && selectedSpaceId() !== row.spaceId)
        )
          return;
        if (!selected) {
          Alert.alert(t("Could not switch spaces"), t("Try again."));
          return;
        }
      }
      await KeyboardController.dismiss();
      if (
        !isCurrent() ||
        (selectionSeq !== undefined &&
          (selectionSeq !== spaceSelectionSeq() || selectedSpaceId() !== row.spaceId))
      )
        return;
      // Replace removes the sheet from history while preserving messageId search jumps.
      navigated = true;
      router.replace(row.destination);
    } finally {
      // Native dismissal can outlive the switch; newer selections (even pending) own it now.
      if (
        !navigated &&
        !isCurrent() &&
        selected &&
        selectionSeq === spaceSelectionSeq() &&
        previousSpaceId !== row.spaceId &&
        selectedSpaceId() === row.spaceId &&
        generation === currentSessionGeneration() &&
        apiBase === currentApiBase()
      ) {
        await selectSpace(previousSpaceId ?? "").catch(() => false);
      }
      if (isCurrent()) opening.current = false;
    }
  };

  // Preserve this container so the native sheet does not stretch the list over the header.
  const isLight = appearance === "light";
  const hairline = StyleSheet.hairlineWidth ?? 0.5;
  const porcelainSurface = isLight ? "#FFFEFC" : "#242933";
  const porcelainBorder =
    tokens?.border ?? (isLight ? "rgba(38, 35, 31, 0.055)" : "rgba(245, 244, 240, 0.09)");
  const softTaupe = isLight ? "#6E675E" : "#B8B3AA";

  return (
    <View
      collapsable={false}
      style={[styles.screen, { paddingTop: Platform.OS === "ios" ? 16 : insets.top + 8 }]}
    >
      <View
        style={[styles.top, { marginLeft: 20 + gutters.left, marginRight: 20 + gutters.right }]}
      >
        <GlassIconButton
          testID="search-sheet-close"
          accessibilityLabel={t("Close")}
          ios="xmark"
          android="close"
          size={44}
          color={tokens?.foreground ?? native.label}
          fallbackStyle={{
            backgroundColor: porcelainSurface,
            borderWidth: hairline,
            borderColor: porcelainBorder,
          }}
          onPress={() => {
            cancelOpen();
            router.back();
          }}
        />
        <GlassSurface
          shape="capsule"
          style={styles.fieldPill}
          fallbackStyle={{
            backgroundColor: porcelainSurface,
            borderWidth: hairline,
            borderColor: porcelainBorder,
          }}
        >
          <NativeSymbol ios="magnifyingglass" android="search" size={17} color={softTaupe} />
          <TextInput
            ref={field}
            testID="search-sheet-field"
            accessibilityLabel={t("Search")}
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={t("Search")}
            placeholderTextColor={tokens?.mutedForeground ?? native.secondaryLabel}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            keyboardAppearance={appearance}
            clearButtonMode="while-editing"
            style={styles.field}
          />
          {Platform.OS === "android" && query ? (
            <MotionPressable
              preset="icon"
              accessibilityRole="button"
              accessibilityLabel={t("Clear")}
              hitSlop={8}
              onPress={() => {
                setQuery("");
                field.current?.focus();
              }}
              style={styles.clear}
            >
              <NativeSymbol
                ios="xmark.circle.fill"
                android="close-circle"
                size={20}
                color={tokens?.mutedForeground ?? softTaupe}
              />
            </MotionPressable>
          ) : null}
        </GlassSurface>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingLeft: gutters.left,
          paddingRight: gutters.right,
          paddingBottom: insets.bottom + 16,
        }}
        ListEmptyComponent={
          error ? null : (
            <Text style={styles.empty}>{loading ? t("Searching…") : t("No results")}</Text>
          )
        }
        ListFooterComponent={
          error ? (
            <View style={styles.failure}>
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
              <NativeActionButton
                label={t("Try again")}
                prominence="secondary"
                size="compact"
                onPress={retry}
              />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <MotionPressable
            preset="row"
            highlightColor={native.fillPressed}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${item.label}`}
            onPress={() => void open(item)}
            style={styles.row}
          >
            {item.group ? (
              <GroupAvatar members={item.group.members} size={50} />
            ) : item.bot ? (
              <BotAvatar
                identity={item.bot.id}
                color={item.bot.color || botColors[3]}
                avatarSet={item.bot.avatarSet}
                status={item.bot.status}
                size={50}
              />
            ) : (
              <View style={styles.neutralAvatar}>
                <NativeSymbol {...kindIcons[item.kind]} color={softTaupe} size={22} />
              </View>
            )}
            <View style={styles.body}>
              <View style={styles.rowTop}>
                <Text numberOfLines={1} style={styles.name}>
                  {item.title}
                </Text>
                <Text style={styles.time}>{item.label}</Text>
              </View>
              <Text numberOfLines={1} style={styles.preview}>
                {item.preview}
              </Text>
            </View>
          </MotionPressable>
        )}
      />
    </View>
  );
}

function createStyles(
  tokens: ColorTokens = mobileTokens(),
  colors: NativeColors = native,
  scope: ResolvedScopedTheme | null = null,
) {
  const bg = tokens?.background;
  const isLight =
    typeof bg === "string" && bg.startsWith("#") && bg.length >= 7
      ? Number.parseInt(bg.slice(1, 3), 16) >= 128
      : true;
  const hairline = StyleSheet.hairlineWidth ?? 0.5;
  const porcelainCard = scope ? colors.fill : isLight ? "#FFFEFC" : "#242933";
  const porcelainBorder = scope
    ? colors.separator
    : (tokens?.border ?? (isLight ? "rgba(38, 35, 31, 0.055)" : "rgba(245, 244, 240, 0.09)"));
  const creamChip = scope ? colors.fillPressed : isLight ? "#F8F6F2" : "#2A303B";
  const creamChipBorder = scope
    ? colors.separator
    : isLight
      ? "rgba(38, 35, 31, 0.07)"
      : "rgba(245, 244, 240, 0.10)";
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: scope?.background ? "transparent" : (tokens?.background ?? colors.page),
    },
    top: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
    fieldPill: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderRadius: 999,
      paddingHorizontal: 15,
      shadowColor: "#26231F",
      shadowOpacity: isLight ? 0.028 : 0.16,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 5 },
      elevation: 1,
    },
    field: {
      flex: 1,
      minHeight: 44,
      paddingVertical: 10,
      color: colors.label,
      fontSize: 17,
      writingDirection: "auto",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: 20,
      marginBottom: 8,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 18,
      backgroundColor: porcelainCard,
      experimental_backgroundImage: cardGradient(isLight, "champagne"),
      overflow: "hidden",
      borderWidth: hairline,
      borderColor: porcelainBorder,
      gap: 12,
      shadowColor: "#26231F",
      shadowOpacity: isLight ? 0.02 : 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 3 },
      elevation: 1,
    },
    rowPressed: {
      backgroundColor: creamChip,
      opacity: 0.85,
    },
    pressed: { opacity: 0.65 },
    clear: { minWidth: 32, minHeight: 44, alignItems: "center", justifyContent: "center" },
    neutralAvatar: {
      width: 50,
      height: 50,
      borderRadius: 18,
      backgroundColor: creamChip,
      borderWidth: hairline,
      borderColor: creamChipBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    body: { flex: 1, minWidth: 0, gap: 3 },
    rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
    // Result rows match the inbox rows.
    name: {
      flex: 1,
      color: colors.label,
      ...typeScale.cardTitle,
      writingDirection: "auto",
    },
    time: { color: colors.secondaryLabel, ...typeScale.caption },
    preview: {
      color: colors.secondaryLabel,
      ...typeScale.secondary,
      writingDirection: "auto",
    },
    empty: { color: colors.secondaryLabel, fontSize: 16, paddingHorizontal: 20, paddingTop: 28 },
    failure: { alignItems: "flex-start", gap: 12, paddingHorizontal: 20, paddingTop: 28 },
    error: { color: tokens?.destructive ?? "#C4272D", fontSize: 14 },
  });
}
