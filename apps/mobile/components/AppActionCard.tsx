import type { MessageBlock } from "@rakazo/contracts";
import { typeScale } from "@rakazo/ui-tokens";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { ViewProps } from "react-native";
import { Text, View } from "react-native";
import { useI18n } from "../lib/i18n";
import {
  executeMobileAppAction,
  isMobileActionExecuted,
  maybeAutoExecuteMobileAppAction,
  subscribeMobileActionExecution,
} from "../lib/mobile-bridge";
import { useMobileTokens } from "../lib/native";
import { GlassSurface } from "./glass-surface";
import { MotionPressable } from "./motion-pressable";
import { NativeSymbol } from "./native-symbol";

function isLightSurface(background?: string): boolean {
  if (!background?.startsWith("#") || background.length < 7) return true;
  return Number.parseInt(background.slice(1, 3), 16) >= 128;
}

type AppActionBlock = Extract<MessageBlock, { kind: "app_action" }>;

function iconForAction(kind: AppActionBlock["payload"]["actionKind"]): {
  ios: string;
  android:
    | "navigate-outline"
    | "open-outline"
    | "sparkles-outline"
    | "calendar-outline"
    | "checkbox-outline"
    | "copy-outline";
} {
  switch (kind) {
    case "open_amap_navigation":
      return { ios: "location.north.line", android: "navigate-outline" };
    case "open_screen":
      return { ios: "arrow.up.right.square", android: "open-outline" };
    case "control_companion":
      return { ios: "sparkles", android: "sparkles-outline" };
    case "create_calendar_event":
      return { ios: "calendar.badge.plus", android: "calendar-outline" };
    case "create_reminder":
      return { ios: "checklist", android: "checkbox-outline" };
    case "set_clipboard":
      return { ios: "doc.on.clipboard", android: "copy-outline" };
  }
}

function buttonLabelForAction(
  kind: AppActionBlock["payload"]["actionKind"],
  executed: boolean,
  chinese: boolean,
): string {
  switch (kind) {
    case "open_amap_navigation":
      return chinese
        ? executed
          ? "再次打开高德"
          : "打开高德导航"
        : executed
          ? "Open Amap again"
          : "Open in Amap";
    case "open_screen":
      return chinese ? "立即打开" : "Open now";
    case "control_companion":
      return chinese ? (executed ? "已执行 · 重试" : "执行切换") : executed ? "Run again" : "Apply";
    case "create_calendar_event":
      return chinese
        ? executed
          ? "已写入日历"
          : "写入手机日历"
        : executed
          ? "Added"
          : "Add to Calendar";
    case "create_reminder":
      return chinese
        ? executed
          ? "已添加提醒"
          : "添加到提醒事项"
        : executed
          ? "Added"
          : "Add Reminder";
    case "set_clipboard":
      return chinese ? (executed ? "已复制" : "复制到剪贴板") : executed ? "Copied" : "Copy";
  }
}

export function AppActionCard({
  block,
  accessibilityActions,
  onAccessibilityAction,
}: {
  block: AppActionBlock;
  accessibilityActions?: ViewProps["accessibilityActions"];
  onAccessibilityAction?: ViewProps["onAccessibilityAction"];
}) {
  const { locale } = useI18n();
  const tokens = useMobileTokens();
  const chinese = locale.startsWith("zh");
  const executed = useSyncExternalStore(
    subscribeMobileActionExecution,
    () => isMobileActionExecuted(block.actionId),
    () => false,
  );
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void maybeAutoExecuteMobileAppAction(block).then((res) => {
      if (!res) return;
      setFailed(!res.ok);
      setStatusMessage(res.message);
    });
  }, [block]);

  async function runAction() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const res = await executeMobileAppAction(block, { acknowledge: true });
      setFailed(!res.ok);
      setStatusMessage(res.message);
    } finally {
      setBusy(false);
    }
  }

  const isLight = isLightSurface(tokens?.background);
  const cardBg = isLight ? "#FFFEFC" : "#242933";
  const cardBorder = isLight ? "rgba(38, 35, 31, 0.065)" : "rgba(245, 244, 240, 0.10)";
  const chipBg = isLight ? "#F8F6F2" : "#2A303B";
  const fg = tokens?.foreground ?? (isLight ? "#26231F" : "#F5F4F0");
  const mutedFg = tokens?.mutedForeground ?? (isLight ? "#6E675E" : "#B8B3AA");
  const primaryBg = isLight ? "#2E2B27" : "#E7E4DD";
  const primaryFg = isLight ? "#FAF8F4" : "#15171C";
  const destructiveColor = tokens?.destructive ?? (isLight ? "#C4272D" : "#FF8F8C");
  const icon = iconForAction(block.payload.actionKind);

  return (
    <View
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      style={{ width: "92%" }}
    >
      <GlassSurface
        testID="app-action-card"
        accessibilityLabel={block.title}
        shape="roundedRectangle"
        cornerRadius={18}
        fallbackStyle={{
          backgroundColor: cardBg,
          borderRadius: 18,
          borderWidth: 0.5,
          borderColor: cardBorder,
          shadowColor: "#26231F",
          shadowOpacity: isLight ? 0.03 : 0.16,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 4 },
          elevation: 1,
        }}
        style={{
          width: "100%",
          borderRadius: 18,
          paddingHorizontal: 15,
          paddingVertical: 13,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              backgroundColor: chipBg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <NativeSymbol ios={icon.ios} android={icon.android} size={17} color={fg} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text numberOfLines={2} style={{ color: fg, ...typeScale.cardTitle }}>
              {block.title}
            </Text>
            {block.subtitle ? (
              <Text numberOfLines={2} style={{ color: mutedFg, ...typeScale.secondary }}>
                {block.subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        {statusMessage ? (
          <Text
            style={{
              color: failed ? destructiveColor : mutedFg,
              fontSize: 12.5,
              lineHeight: 17,
            }}
          >
            {statusMessage}
          </Text>
        ) : null}

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }}>
          <MotionPressable
            preset="control"
            testID="app-action-card-button"
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void runAction()}
            style={{
              minHeight: 36,
              paddingHorizontal: 14,
              borderRadius: 999,
              backgroundColor: executed ? chipBg : primaryBg,
              borderWidth: executed ? 0.5 : 0,
              borderColor: cardBorder,
              alignItems: "center",
              justifyContent: "center",
              opacity: busy ? 0.55 : 1,
            }}
          >
            <Text
              style={{
                color: executed ? fg : primaryFg,
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              {busy
                ? chinese
                  ? "执行中…"
                  : "Running…"
                : buttonLabelForAction(block.payload.actionKind, executed, chinese)}
            </Text>
          </MotionPressable>
        </View>
      </GlassSurface>
    </View>
  );
}
