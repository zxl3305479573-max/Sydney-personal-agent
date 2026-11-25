import type { NativeStackNavigationOptions } from "expo-router";
import { router } from "expo-router";
import { Pressable } from "react-native";
import { mobileTokens } from "../lib/appearance";
import { iosAtLeast } from "../lib/native-controls";
import { setInboxHidden } from "../lib/split-view";
import { threadEdgeOptions } from "../lib/thread-edges";
import type { ChatTitleParams } from "./chat-header-title";
import { ChatHeaderTitle } from "./chat-header-title";
import { NativeSymbol } from "./native-symbol";
import { trailingHeaderOptions } from "./sheet-header";
import { threadHeaderRight } from "./thread-header-right";
import { createThreadHeaderStyles } from "./thread-header-styles";

/**
 * Whether the chat sits beside the chat list, whether that list is hidden, and whether a
 * book-like fold keeps the list beside the chat.
 */
export type ChatSplit = { split: boolean; inboxHidden: boolean; foldActive?: boolean };

/**
 * A chat's whole header as its route declares it when the screen is created, before the chat
 * has rendered: the title capsule, the right-side button and, beside the chat list, the
 * sidebar button. Everything is in the first native header, so the title sits at its final
 * place from the first frame of the push and is never re-laid out. The open chat feeds the
 * title its data and fills in the buttons' actions, without changing their shape.
 */
export function chatRouteHeader(
  route: { key: string; params?: object },
  t: (text: string) => string,
  { split, inboxHidden, foldActive }: ChatSplit,
): NativeStackNavigationOptions {
  const params = (route.params ?? {}) as ChatTitleParams;
  const { groupId, botId } = params;
  const readOnly = params.readOnly === "1";
  const tokens = mobileTokens();
  const color = tokens?.foreground ?? "#26231F";
  return {
    headerTitleAlign: "center",
    ...threadEdgeOptions(),
    headerTitle: () => <ChatHeaderTitle routeKey={route.key} params={params} />,
    ...threadHeaderRight({
      inGroup: Boolean(groupId),
      readOnly,
      hasBot: Boolean(botId),
      t,
      color,
      rowStyle: createThreadHeaderStyles().headerActions,
      onGroupSettings: () =>
        router.push({ pathname: "/group-settings", params: { groupId: groupId ?? "" } }),
      onBotActions: () => undefined,
      menuActions: [],
    }),
    ...threadHeaderLeft({ split, inboxHidden, foldActive, t, color }),
    // An archived chat offers Restore; the open chat gives it its action.
    ...(readOnly ? trailingHeaderOptions(t("Restore"), () => undefined) : {}),
  };
}

/** Beside the chat list, the chat's left button shows or hides the list instead of going back. */
export function threadHeaderLeft({
  split,
  inboxHidden,
  foldActive,
  t,
  color,
}: ChatSplit & { t: (text: string) => string; color: string }): NativeStackNavigationOptions {
  if (!split || foldActive) {
    // Folding back takes the list away, so the chat gets its back button again. Folded like
    // a book, the list stays beside the chat, so it needs neither.
    return {
      headerBackVisible: !split && !iosAtLeast(26),
      headerLeft: undefined,
      ...(iosAtLeast(26)
        ? {
            unstable_headerLeftItems: () =>
              split
                ? []
                : [
                    {
                      type: "button" as const,
                      label: t("Back"),
                      accessibilityLabel: t("Back"),
                      icon: { type: "sfSymbol" as const, name: "chevron.left" },
                      hidesSharedBackground: true,
                      onPress: () => router.back(),
                    },
                  ],
          }
        : {}),
    };
  }
  const label = inboxHidden ? t("Show chats") : t("Hide chats");
  const tokens = mobileTokens();
  const bg = tokens?.background;
  const isLight =
    typeof bg === "string" && /^#[\da-f]{6}/i.test(bg)
      ? Number.parseInt(bg.slice(1, 3), 16) > 128
      : true;
  const fallbackPillStyle = {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: isLight ? "#FFFEFC" : "#242933",
    borderWidth: 0.5,
    borderColor:
      tokens?.border ??
      (isLight ? "rgba(38, 35, 31, 0.055)" : "rgba(245, 244, 240, 0.09)"),
  };
  return {
    headerBackVisible: false,
    ...(iosAtLeast(26)
      ? {
          unstable_headerLeftItems: () => [
            {
              type: "button" as const,
              hidesSharedBackground: true,
              label,
              icon: { type: "sfSymbol" as const, name: "sidebar.left" },
              onPress: () => setInboxHidden(!inboxHidden),
            },
          ],
        }
      : {}),
    headerLeft: () => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={8}
        onPress={() => setInboxHidden(!inboxHidden)}
        style={fallbackPillStyle}
      >
        <NativeSymbol
          ios={inboxHidden ? "sidebar.left" : "arrow.up.left.and.arrow.down.right"}
          android={inboxHidden ? "contract-outline" : "expand-outline"}
          size={19}
          color={color}
        />
      </Pressable>
    ),
  };
}
