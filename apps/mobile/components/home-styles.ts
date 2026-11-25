import { typeScale } from "@rakazo/ui-tokens";
import { StyleSheet } from "react-native";
import { mobileTokens } from "../lib/appearance";
import { cardGradient } from "../lib/card-gradient";
import { native } from "../lib/native";
import { effectiveThemeAssignments } from "../lib/theme-manager";
import { resolveScopedTheme } from "../lib/theme-pack";
import { themeManager } from "../lib/theme-state";

export const INBOX_ROW = { padding: 20, gap: 12, avatarSize: 62 };
export const COMPACT_INBOX_ROW = { padding: 12, gap: 10 };
// Drops the Android create menu below the header pill; the trigger's negative margin keeps the layout.
export const CREATE_MENU_GAP = 6;

export function createHomeStyles() {
  const tokens = mobileTokens();
  const hairline = StyleSheet.hairlineWidth ?? 0.5;
  const bg = tokens?.background;
  const isLight =
    typeof bg === "string" && /^#[\da-f]{6}/i.test(bg)
      ? Number.parseInt(bg.slice(1, 3), 16) > 128
      : true;
  const porcelainCard = isLight ? "#FFFEFC" : "#242933";
  const porcelainBorder =
    tokens?.border ?? (isLight ? "rgba(38, 35, 31, 0.055)" : "rgba(245, 244, 240, 0.09)");
  const creamChip = isLight ? "#F8F6F2" : "#2A303B";
  const creamChipBorder = isLight ? "rgba(38, 35, 31, 0.07)" : "rgba(245, 244, 240, 0.10)";
  const softTaupe = isLight ? "#6E675E" : "#B8B3AA";
  const snapshot = themeManager.getSnapshot();
  const scope = themeManager.getActiveScope();
  const layout =
    snapshot.hydrated &&
    (snapshot.assignments.globalPackId !== "classic" || snapshot.assignments.pages[scope])
      ? resolveScopedTheme(snapshot.packs, effectiveThemeAssignments(snapshot), scope, "dark")
          .layout
      : "classic";
  const cards = layout === "cards";
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: tokens?.background ?? native.page,
    },
    centered: {
      alignItems: "center",
      justifyContent: "center",
    },
    emptyPaneCard: {
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingHorizontal: 28,
      paddingVertical: 22,
      borderRadius: 22,
      backgroundColor: porcelainCard,
      borderWidth: hairline,
      borderColor: porcelainBorder,
      shadowColor: "#26231F",
      shadowOpacity: isLight ? 0.028 : 0.16,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 5 },
      elevation: 1,
    },
    emptyPaneBadge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: creamChip,
      borderWidth: hairline,
      borderColor: creamChipBorder,
    },
    emptyPaneBadgeDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: softTaupe,
      opacity: 0.75,
    },
    emptyPane: {
      color: native.secondaryLabel,
      ...typeScale.secondary,
      textAlign: "center",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 10,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      padding: 2,
      gap: 2,
      borderRadius: 999,
      backgroundColor: porcelainCard,
      borderWidth: hairline,
      borderColor: porcelainBorder,
      shadowColor: "#26231F",
      shadowOpacity: isLight ? 0.028 : 0.16,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
      elevation: 1,
    },
    circleButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: porcelainCard,
      borderWidth: hairline,
      borderColor: porcelainBorder,
      shadowColor: "#26231F",
      shadowOpacity: isLight ? 0.028 : 0.16,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
      elevation: 1,
    },
    headerButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    createMenuAnchor: {
      height: 40 + CREATE_MENU_GAP,
      paddingBottom: CREATE_MENU_GAP,
    },
    headerButtonActive: {
      backgroundColor: creamChip,
    },
    headerButtonAccent: {
      backgroundColor: tokens?.primary ?? "#2B2823",
    },
    profileInitials: {
      color: native.label,
      fontSize: 15,
      fontWeight: "600",
    },
    error: {
      color: native.secondaryLabel,
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
    listArea: {
      flex: 1,
      minHeight: 0,
      overflow: "hidden",
    },
    list: {
      flexGrow: 1,
      paddingBottom: 32,
    },
    inboxIntro: {
      gap: 12,
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 16,
    },
    inboxTitle: {
      color: native.label,
      fontSize: 32,
      fontWeight: "700",
    },
    inboxSearch: {
      minHeight: 46,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 15,
      paddingVertical: 10,
      borderRadius: 20,
      backgroundColor: porcelainCard,
      experimental_backgroundImage: cardGradient(isLight, "pearl"),
      overflow: "hidden",
      borderWidth: hairline,
      borderColor: porcelainBorder,
      shadowColor: "#26231F",
      shadowOpacity: isLight ? 0.028 : 0.16,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 5 },
      elevation: 1,
    },
    inboxSearchLabel: {
      color: native.secondaryLabel,
      flexShrink: 1,
      ...typeScale.secondary,
    },
    empty: {
      color: native.secondaryLabel,
      fontSize: 16,
      paddingHorizontal: 20,
      paddingTop: 28,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: cards ? 20 : 0,
      paddingHorizontal: cards ? 14 : INBOX_ROW.padding,
      paddingVertical: cards ? 15 : 14,
      gap: INBOX_ROW.gap,
      borderRadius: cards ? 18 : 0,
      backgroundColor: cards ? porcelainCard : "transparent",
      ...(cards
        ? {
            experimental_backgroundImage: cardGradient(isLight, "champagne"),
            overflow: "hidden" as const,
          }
        : {}),
      borderWidth: cards ? hairline : 0,
      borderColor: cards ? porcelainBorder : "transparent",
      marginBottom: cards ? 8 : 0,
    },
    rowSelected: {
      borderRadius: 18,
      backgroundColor: creamChip,
      borderWidth: hairline,
      borderColor: creamChipBorder,
    },
    rosterRow: {
      marginHorizontal: 20,
      marginBottom: 8,
      paddingHorizontal: 14,
      paddingVertical: 12,
      minHeight: 68,
      borderRadius: 18,
      backgroundColor: porcelainCard,
      experimental_backgroundImage: cardGradient(isLight, "champagne"),
      overflow: "hidden",
      borderWidth: hairline,
      borderColor: porcelainBorder,
      shadowColor: "#26231F",
      shadowOpacity: isLight ? 0.022 : 0.14,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 3 },
      elevation: 1,
    },
    compactRosterRow: {
      marginHorizontal: 10,
      paddingHorizontal: 10,
    },
    pinnedTiles: {
      flexDirection: "row",
      flexWrap: "wrap",
      paddingHorizontal: 16,
      paddingTop: 6,
      paddingBottom: 14,
    },
    pinnedTile: {
      width: "33.33%",
      alignItems: "center",
      paddingVertical: 10,
      paddingHorizontal: 4,
      borderRadius: 20,
      gap: 6,
      backgroundColor: cards ? porcelainCard : "transparent",
      ...(cards
        ? {
            experimental_backgroundImage: cardGradient(isLight, "champagne"),
            overflow: "hidden" as const,
          }
        : {}),
      borderWidth: cards ? hairline : 0,
      borderColor: cards ? porcelainBorder : "transparent",
    },
    pinnedTileSelected: {
      backgroundColor: creamChip,
      borderWidth: hairline,
      borderColor: creamChipBorder,
    },
    pinnedName: {
      color: native.secondaryLabel,
      fontSize: 13,
      fontWeight: "500",
      textAlign: "center",
      writingDirection: "auto",
    },
    pinnedUnread: {
      color: native.label,
      fontWeight: "700",
    },
    compactRow: {
      paddingHorizontal: COMPACT_INBOX_ROW.padding,
      gap: COMPACT_INBOX_ROW.gap,
    },
    rowPressed: {
      opacity: 0.68,
    },
    rowBody: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    rowTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    titleRow: {
      flex: 1,
      minWidth: 0,
      overflow: "hidden",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    rowMeta: {
      flexShrink: 0,
      maxWidth: "44%",
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },
    name: {
      flexShrink: 1,
      color: native.label,
      ...typeScale.cardTitle,
      writingDirection: "auto",
    },
    time: {
      color: native.secondaryLabel,
      ...typeScale.caption,
      fontVariant: ["tabular-nums"],
    },
    unreadName: {
      fontWeight: "700",
    },
    preview: {
      color: native.secondaryLabel,
      ...typeScale.secondary,
      writingDirection: "auto",
    },
    unreadPreview: {
      color: native.label,
      fontWeight: "600",
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: tokens?.unread ?? "#0A68EB",
    },
    spaceHeading: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 8,
    },
    spaceSelect: {
      flex: 1,
      minHeight: 44,
      justifyContent: "center",
    },
    spaceTitle: {
      color: native.label,
      fontSize: 14,
      fontWeight: "600",
      writingDirection: "auto",
    },
    spaceActions: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    recoveryAction: {
      minHeight: 44,
      paddingHorizontal: 20,
      justifyContent: "center",
    },
    sectionHeadingRow: { flexDirection: "row", alignItems: "center", paddingRight: 20 },
    sectionToggle: {
      flex: 1,
      alignSelf: "stretch",
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 4,
    },
    archivedRow: { flex: 0, width: "100%" },
    sectionTitle: {
      flexShrink: 1,
      color: native.secondaryLabel,
      ...typeScale.secondary,
    },
    sectionCount: {
      color: native.tertiaryLabel,
      ...typeScale.caption,
      fontVariant: ["tabular-nums"],
    },
    sectionHeading: {
      color: native.secondaryLabel,
      ...typeScale.secondary,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 4,
    },
    activitySection: {
      borderBottomWidth: hairline,
      borderBottomColor: porcelainBorder,
      marginBottom: 4,
      paddingBottom: 4,
    },
    activityGap: {
      paddingTop: 16,
    },
    groupAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: creamChip,
      borderWidth: hairline,
      borderColor: creamChipBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    groupAvatarLabel: {
      color: native.secondaryLabel,
      fontSize: 16,
      fontWeight: "600",
    },
  });
}
