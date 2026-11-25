import type { ColorTokens } from "@rakazo/ui-tokens";
import { typeScale } from "@rakazo/ui-tokens";
import { StyleSheet } from "react-native";
import { mobileTokens } from "../lib/appearance";
import type { NativeColors } from "../lib/native";
import { native } from "../lib/native";
import type { ResolvedScopedTheme } from "../lib/theme-pack";

export const INBOX_ROW = { padding: 16, gap: 12, avatarSize: 62 };
export const COMPACT_INBOX_ROW = { padding: 12, gap: 10 };
// Drops the Android create menu below the header pill; the trigger's negative margin keeps the layout.
export const CREATE_MENU_GAP = 6;

export function createHomeStyles(
  tokens: ColorTokens = mobileTokens(),
  colors: NativeColors = native,
  scope: ResolvedScopedTheme | null = null,
) {
  const cards = scope?.layout === "cards";
  const outlined = scope?.surface === "outlined";
  const hasBackground = Boolean(scope?.background);
  const cardRadius = Math.max(10, Math.min(24, scope?.geometry.cardRadius ?? 18));
  const cardBorderWidth =
    cards || outlined
      ? Math.max(StyleSheet.hairlineWidth, scope?.geometry.borderWidth ?? StyleSheet.hairlineWidth)
      : 0;
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: hasBackground ? "transparent" : colors.page,
    },
    centered: {
      alignItems: "center",
      justifyContent: "center",
    },
    emptyPane: {
      color: colors.secondaryLabel,
      ...typeScale.secondary,
      textAlign: "center",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 10,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      padding: 2,
      borderRadius: 22,
      backgroundColor: colors.fillPressed,
    },
    circleButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.fillPressed,
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
      backgroundColor: colors.fill,
    },
    headerButtonAccent: {
      backgroundColor: tokens.primary,
    },
    profileInitials: {
      color: colors.label,
      fontSize: 15,
      fontWeight: "600",
    },
    error: {
      color: colors.secondaryLabel,
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
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 16,
    },
    inboxTitle: {
      color: colors.label,
      fontSize: 32,
      fontWeight: "700",
    },
    inboxSearch: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: colors.fillPressed,
    },
    inboxSearchLabel: {
      color: colors.secondaryLabel,
      flexShrink: 1,
      ...typeScale.secondary,
    },
    empty: {
      color: colors.secondaryLabel,
      fontSize: 16,
      paddingHorizontal: 20,
      paddingTop: 28,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: cards ? 12 : 0,
      paddingHorizontal: cards ? 14 : INBOX_ROW.padding,
      paddingVertical: cards ? 16 : 14,
      gap: INBOX_ROW.gap,
      borderRadius: cards ? cardRadius : 0,
      backgroundColor: cards ? tokens.card : "transparent",
      borderWidth: cards ? cardBorderWidth : 0,
      borderColor: cards ? tokens.border : "transparent",
      marginBottom: cards ? 8 : 0,
    },
    rowSelected: {
      borderRadius: 12,
      backgroundColor: colors.fillPressed,
    },
    rosterRow: {
      marginHorizontal: 8,
      paddingHorizontal: 8,
      paddingVertical: 10,
      minHeight: 64,
      borderRadius: 12,
    },
    pinnedTiles: {
      flexDirection: "row",
      flexWrap: "wrap",
      paddingHorizontal: 8,
      paddingTop: 4,
      paddingBottom: 12,
    },
    pinnedTile: {
      width: "33.33%",
      alignItems: "center",
      paddingVertical: 8,
      paddingHorizontal: 4,
      borderRadius: cards ? Math.min(24, cardRadius + 2) : 16,
      gap: 4,
      backgroundColor: cards ? tokens.card : "transparent",
      borderWidth: cards ? cardBorderWidth : 0,
      borderColor: cards ? tokens.border : "transparent",
    },
    pinnedName: {
      color: colors.secondaryLabel,
      fontSize: 13,
      fontWeight: "500",
      textAlign: "center",
      writingDirection: "auto",
    },
    pinnedUnread: {
      color: colors.label,
      fontWeight: "700",
    },
    compactRow: {
      paddingHorizontal: COMPACT_INBOX_ROW.padding,
      gap: COMPACT_INBOX_ROW.gap,
    },
    rowPressed: {
      opacity: 0.55,
    },
    rowBody: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    rowTop: {
      flexDirection: "row",
      alignItems: "flex-start",
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
      flexShrink: 1,
      maxWidth: "40%",
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },
    name: {
      flexShrink: 1,
      color: colors.label,
      ...typeScale.cardTitle,
      writingDirection: "auto",
    },
    time: {
      flexShrink: 1,
      color: colors.secondaryLabel,
      ...typeScale.caption,
      fontVariant: ["tabular-nums"],
    },
    unreadName: {
      fontWeight: "700",
    },
    preview: {
      color: colors.secondaryLabel,
      ...typeScale.secondary,
      writingDirection: "auto",
    },
    unreadPreview: {
      color: colors.label,
      fontWeight: "600",
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: tokens.unread,
    },
    spaceHeading: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    spaceSelect: {
      flex: 1,
      minHeight: 44,
      justifyContent: "center",
    },
    spaceTitle: {
      color: colors.label,
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
    sectionHeadingRow: { flexDirection: "row", alignItems: "center", paddingRight: 16 },
    sectionToggle: {
      flex: 1,
      alignSelf: "stretch",
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 4,
    },
    archivedRow: { flex: 0, width: "100%" },
    sectionTitle: {
      flexShrink: 1,
      color: colors.secondaryLabel,
      ...typeScale.secondary,
    },
    sectionCount: {
      color: colors.tertiaryLabel,
      ...typeScale.caption,
      fontVariant: ["tabular-nums"],
    },
    sectionHeading: {
      color: colors.secondaryLabel,
      ...typeScale.secondary,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 4,
    },
    activitySection: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.fillPressed,
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
      backgroundColor: colors.fill,
      alignItems: "center",
      justifyContent: "center",
    },
    groupAvatarLabel: {
      color: colors.secondaryLabel,
      fontSize: 16,
      fontWeight: "600",
    },
  });
}
