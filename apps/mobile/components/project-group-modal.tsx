import type { RpcOutput } from "@rakazo/contracts";
import {
  defaultGroupName,
  GROUP_MEMBER_MAX,
  GROUP_MEMBER_MIN,
  GROUP_NAME_MAX_LENGTH,
} from "@rakazo/contracts";
import { newClientId } from "@rakazo/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { captureApiRequestContext, rpc } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { AppModalSheet } from "./app-modal-sheet";
import { BotAvatar } from "./bot-avatar";
import { GlassSurface } from "./glass-surface";
import { FALLBACK_COLOR } from "./inbox-rows";
import { MotionPressable } from "./motion-pressable";
import { NativeActionButton } from "./native-action-button";
import { NativeSymbol } from "./native-symbol";

function isLightSurface(background?: string): boolean {
  if (!background || !background.startsWith("#") || background.length < 7) return true;
  return Number.parseInt(background.slice(1, 3), 16) >= 128;
}

type Member = RpcOutput<"projectWorkspaces/roster">["bots"][number];
export type ProjectGroupAttempt = { fingerprint: string; id: string };

function mergeMembers(existing: Member[], incoming: Member[]): Member[] {
  const seen = new Set(existing.map((member) => member.id));
  const merged = [...existing];
  for (const member of incoming) {
    if (!seen.has(member.id)) {
      seen.add(member.id);
      merged.push(member);
    }
  }
  return merged;
}

export function ProjectGroupModal({
  projectId,
  current,
  attempt,
  onClose,
  onCreated,
}: {
  projectId: string;
  current: () => boolean;
  attempt: { current: ProjectGroupAttempt | null };
  onClose: () => void;
  onCreated: (groupId: string) => void;
}) {
  const { locale } = useI18n();
  const text = (chinese: string, english: string) => (locale.startsWith("zh") ? chinese : english);
  const tokens = useMobileTokens();
  const [items, setItems] = useState<Member[]>([]);
  const [selected, setSelected] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const loadMoreInFlight = useRef(false);
  const nextRef = useRef<string | null>(null);
  nextRef.current = next;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const requestContext = await captureApiRequestContext();
        if (!active || !current()) return;
        const page = await rpc(
          "projectWorkspaces/roster",
          { id: projectId, afterBotId: undefined },
          {
            requestContext,
            signal: controller.signal,
            skipSpaceAuthRecovery: true,
          },
        );
        if (active && current()) {
          setItems(page.bots);
          setNext(page.nextBotId);
        }
      } catch {
        if (active && current())
          setError(
            text(
              "无法加载项目成员，请关闭后重试。",
              "Could not load project members. Close and retry.",
            ),
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [projectId]);

  const loadMore = useCallback(async () => {
    const cursor = nextRef.current;
    if (!cursor || loading || loadMoreInFlight.current || busy || !current()) return;
    loadMoreInFlight.current = true;
    setLoadingMore(true);
    try {
      const requestContext = await captureApiRequestContext();
      if (!mounted.current || !current()) return;
      const page = await rpc(
        "projectWorkspaces/roster",
        { id: projectId, afterBotId: cursor },
        {
          requestContext,
          skipSpaceAuthRecovery: true,
        },
      );
      if (mounted.current && current()) {
        setItems((previous) => mergeMembers(previous, page.bots));
        setNext(page.nextBotId);
      }
    } catch {
      if (mounted.current && current())
        setError(
          text("无法加载更多成员，请稍后重试。", "Could not load more members. Please try again."),
        );
    } finally {
      loadMoreInFlight.current = false;
      if (mounted.current) setLoadingMore(false);
    }
  }, [projectId, loading, busy, current, locale]);

  async function create() {
    if (
      inFlight.current ||
      !current() ||
      selected.length < GROUP_MEMBER_MIN ||
      selected.length > GROUP_MEMBER_MAX
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const group = {
      name: name.trim() || defaultGroupName(selected.map((member) => member.name)),
      botIds: selected.map((member) => member.id),
    };
    const fingerprint = JSON.stringify([projectId, group]);
    if (attempt.current?.fingerprint !== fingerprint)
      attempt.current = { fingerprint, id: newClientId() };
    const requestId = attempt.current.id;
    try {
      const requestContext = await captureApiRequestContext();
      if (!mounted.current || !current()) return;
      const created = await rpc(
        "projectWorkspaces/createGroup",
        {
          projectId,
          requestId,
          group,
        },
        { requestContext, skipSpaceAuthRecovery: true },
      );
      if (!mounted.current || !current()) return;
      attempt.current = null;
      onCreated(created.id);
    } catch {
      if (mounted.current && current())
        setError(
          text(
            "创建未确认。请使用相同内容重试，或返回项目名单确认。",
            "Creation was not confirmed. Retry with the same details or check the project list.",
          ),
        );
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const isLight = isLightSurface(tokens?.background);
  const hairline = StyleSheet.hairlineWidth ?? 0.5;
  const canvasBg = tokens?.background ?? (isLight ? "#F3F1EC" : "#15171C");
  const cardBg = isLight ? "#FFFEFC" : "#242933";
  const cardBorder = isLight ? "rgba(38, 35, 31, 0.055)" : "rgba(245, 244, 240, 0.09)";
  const chipBg = isLight ? "#F8F6F2" : "#2A303B";
  const chipBorder = isLight ? "rgba(38, 35, 31, 0.07)" : "rgba(245, 244, 240, 0.10)";
  const fg = tokens?.foreground ?? (isLight ? "#26231F" : "#F5F4F0");
  const mutedFg = tokens?.mutedForeground ?? (isLight ? "#6E675E" : "#B8B3AA");
  const destructive = tokens?.destructive ?? (isLight ? "#C4272D" : "#FF8F8C");

  return (
    <AppModalSheet
      visible
      onClose={() => {
        if (!busy) onClose();
      }}
      preventDismiss={busy}
      accessibilityLabel={text("新建项目群聊", "New project group")}
      backgroundColor={canvasBg}
      contentStyle={{ paddingHorizontal: 20, gap: 14 }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: "700", color: fg }}>
            {text("新建项目群聊", "New project group")}
          </Text>
          <Text style={{ color: mutedFg, fontSize: 13 }}>
            {text(
              `选择 ${GROUP_MEMBER_MIN}–${GROUP_MEMBER_MAX} 个项目 Bot，已选 ${selected.length} 个`,
              `Choose ${GROUP_MEMBER_MIN}–${GROUP_MEMBER_MAX} project bots · ${selected.length} selected`,
            )}
          </Text>
        </View>
        <MotionPressable
          preset="icon"
          accessibilityRole="button"
          accessibilityLabel={text("取消", "Cancel")}
          disabled={busy}
          onPress={onClose}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: chipBg,
            borderWidth: hairline,
            borderColor: chipBorder,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <NativeSymbol ios="xmark" android="close" size={16} color={fg} />
        </MotionPressable>
      </View>

      <GlassSurface
        shape="roundedRectangle"
        cornerRadius={20}
        style={{ flex: 1, flexShrink: 1, borderRadius: 20, overflow: "hidden" }}
        fallbackStyle={{
          flex: 1,
          flexShrink: 1,
          backgroundColor: cardBg,
          borderRadius: 20,
          borderWidth: hairline,
          borderColor: cardBorder,
        }}
      >
        <FlatList<Member>
          data={loading ? [] : items}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            loading ? (
              <View style={{ padding: 22, alignItems: "center", gap: 8 }}>
                <ActivityIndicator color={mutedFg} />
                <Text style={{ color: mutedFg }}>{text("正在加载…", "Loading…")}</Text>
              </View>
            ) : (
              <Text style={{ padding: 20, color: mutedFg }}>
                {text(
                  "此项目暂无可选 Bot，请先新建项目 Bot。",
                  "No project bots available yet. Create project bots first.",
                )}
              </Text>
            )
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 12, alignItems: "center" }}>
                <ActivityIndicator color={mutedFg} />
              </View>
            ) : null
          }
          renderItem={({ item, index }) => {
            const checked = selected.some((member) => member.id === item.id);
            const rowDisabled = busy || (!checked && selected.length >= GROUP_MEMBER_MAX);
            return (
              <MotionPressable
                preset="row"
                highlightColor={chipBg}
                accessibilityRole="checkbox"
                accessibilityState={{ checked, disabled: rowDisabled }}
                disabled={rowDisabled}
                onPress={() =>
                  setSelected((old) =>
                    checked ? old.filter((member) => member.id !== item.id) : [...old, item],
                  )
                }
                style={{
                  minHeight: 54,
                  paddingHorizontal: 16,
                  paddingVertical: 11,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  backgroundColor: checked ? chipBg : "transparent",
                  borderBottomWidth: index < items.length - 1 ? hairline : 0,
                  borderBottomColor: cardBorder,
                  opacity: rowDisabled ? 0.5 : 1,
                }}
              >
                <BotAvatar
                  color={item.color || FALLBACK_COLOR}
                  avatarSet={item.avatarSet}
                  identity={item.id}
                  size={34}
                  motion="lazy"
                />
                <Text numberOfLines={1} style={{ flex: 1, color: fg, fontSize: 16 }}>
                  {item.name}
                </Text>
                <NativeSymbol
                  ios={checked ? "checkmark.circle.fill" : "circle"}
                  android={checked ? "checkmark-circle" : "ellipse-outline"}
                  size={22}
                  color={checked ? (tokens?.primary ?? fg) : mutedFg}
                />
              </MotionPressable>
            );
          }}
        />
      </GlassSurface>

      <GlassSurface
        shape="roundedRectangle"
        cornerRadius={16}
        style={{ borderRadius: 16 }}
        fallbackStyle={{
          backgroundColor: cardBg,
          borderRadius: 16,
          borderWidth: hairline,
          borderColor: cardBorder,
        }}
      >
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={GROUP_NAME_MAX_LENGTH}
          editable={!busy}
          placeholder={text("群聊名称（可选）", "Group name (optional)")}
          placeholderTextColor={mutedFg}
          returnKeyType="done"
          style={{
            color: fg,
            minHeight: 48,
            paddingHorizontal: 14,
            paddingVertical: 11,
            fontSize: 16,
          }}
        />
      </GlassSurface>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: destructive }}>
          {error}
        </Text>
      ) : null}
      <NativeActionButton
        label={busy ? text("正在创建…", "Creating…") : text("创建群聊", "Create group")}
        disabled={busy || loading || selected.length < GROUP_MEMBER_MIN}
        busy={busy}
        onPress={() => void create()}
      />
    </AppModalSheet>
  );
}
