import {
  defaultGroupName,
  GROUP_MEMBER_MAX,
  GROUP_MEMBER_MIN,
  GROUP_NAME_MAX_LENGTH,
} from "@rakazo/contracts";
import { newClientId } from "@rakazo/core";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureApiRequestContext, rpc } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { native, useMobileTokens } from "../lib/native";
import { GlassSurface } from "./glass-surface";
import { NativeActionButton } from "./native-action-button";
import { NativeSymbol } from "./native-symbol";

type Member = { id: string; name: string };
export type ProjectGroupAttempt = { fingerprint: string; id: string };

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
  onCreated: () => void;
}) {
  const { locale } = useI18n();
  const text = (chinese: string, english: string) => (locale.startsWith("zh") ? chinese : english);
  const tokens = useMobileTokens();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Member[]>([]);
  const [selected, setSelected] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const after = cursors.at(-1);

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
          { id: projectId, afterBotId: after },
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
  }, [projectId, after]);

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
      await rpc(
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
      onCreated();
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

  return (
    <Modal
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: tokens.overlay }}
      >
        <Pressable
          accessibilityLabel={text("关闭", "Close")}
          disabled={busy}
          onPress={onClose}
          style={{ flex: 1 }}
        />
        <View
          accessibilityViewIsModal
          style={{
            maxHeight: "90%",
            backgroundColor: tokens.background,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingTop: 10,
            paddingHorizontal: 20,
            paddingBottom: Math.max(insets.bottom, 16),
            gap: 12,
          }}
        >
          <View
            accessible={false}
            style={{
              alignSelf: "center",
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: tokens.mutedForeground,
              opacity: 0.35,
            }}
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text
                accessibilityRole="header"
                style={{ fontSize: 20, fontWeight: "700", color: tokens.foreground }}
              >
                {text("新建项目群聊", "New project group")}
              </Text>
              <Text style={{ color: tokens.mutedForeground, fontSize: 13 }}>
                {text(
                  `选择 ${GROUP_MEMBER_MIN}–${GROUP_MEMBER_MAX} 个项目 Bot，已选 ${selected.length} 个`,
                  `Choose ${GROUP_MEMBER_MIN}–${GROUP_MEMBER_MAX} project bots · ${selected.length} selected`,
                )}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text("取消", "Cancel")}
              disabled={busy}
              onPress={onClose}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: native.fill,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <NativeSymbol ios="xmark" android="close" size={16} color={tokens.foreground} />
            </Pressable>
          </View>

          <ScrollView
            style={{ flexShrink: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            contentContainerStyle={{ gap: 12 }}
          >
            <GlassSurface
              shape="roundedRectangle"
              cornerRadius={16}
              style={{ borderRadius: 16, overflow: "hidden" }}
              fallbackStyle={{
                backgroundColor: tokens.card,
                borderWidth: 1,
                borderColor: tokens.border,
              }}
            >
              {loading ? (
                <View style={{ padding: 20, alignItems: "center", gap: 8 }}>
                  <ActivityIndicator />
                  <Text style={{ color: tokens.mutedForeground }}>
                    {text("正在加载…", "Loading…")}
                  </Text>
                </View>
              ) : items.length === 0 ? (
                <Text style={{ padding: 18, color: tokens.mutedForeground }}>
                  {text(
                    "此项目暂无可选 Bot，请先新建项目 Bot。",
                    "No project bots available yet. Create project bots first.",
                  )}
                </Text>
              ) : (
                items.map((item, index) => {
                  const checked = selected.some((member) => member.id === item.id);
                  const rowDisabled = busy || (!checked && selected.length >= GROUP_MEMBER_MAX);
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked, disabled: rowDisabled }}
                      disabled={rowDisabled}
                      onPress={() =>
                        setSelected((old) =>
                          checked ? old.filter((member) => member.id !== item.id) : [...old, item],
                        )
                      }
                      style={({ pressed }) => ({
                        minHeight: 52,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        borderBottomWidth: index < items.length - 1 ? StyleSheet.hairlineWidth : 0,
                        borderBottomColor: tokens.border,
                        opacity: rowDisabled ? 0.5 : pressed ? 0.7 : 1,
                      })}
                    >
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 17,
                          backgroundColor: native.fill,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ color: tokens.foreground, fontSize: 14, fontWeight: "600" }}>
                          {item.name.trim().slice(0, 1).toUpperCase() || "B"}
                        </Text>
                      </View>
                      <Text
                        numberOfLines={1}
                        style={{ flex: 1, color: tokens.foreground, fontSize: 16 }}
                      >
                        {item.name}
                      </Text>
                      <NativeSymbol
                        ios={checked ? "checkmark.circle.fill" : "circle"}
                        android={checked ? "checkmark-circle" : "ellipse-outline"}
                        size={22}
                        color={checked ? tokens.primary : tokens.mutedForeground}
                      />
                    </Pressable>
                  );
                })
              )}
            </GlassSurface>

            {cursors.length || next ? (
              <View style={{ flexDirection: "row", gap: 12 }}>
                {cursors.length ? (
                  <NativeActionButton
                    label={text("上一页", "Previous")}
                    disabled={loading || busy}
                    prominence="quiet"
                    onPress={() =>
                      setCursors((old) => (old.at(-1) === after ? old.slice(0, -1) : old))
                    }
                  />
                ) : null}
                {next ? (
                  <NativeActionButton
                    label={text("下一页", "Next")}
                    disabled={loading || busy}
                    prominence="quiet"
                    onPress={() => {
                      const nextCursor = next;
                      if (nextCursor)
                        setCursors((old) => (old.at(-1) === after ? [...old, nextCursor] : old));
                    }}
                  />
                ) : null}
              </View>
            ) : null}
          </ScrollView>

          <GlassSurface
            shape="roundedRectangle"
            cornerRadius={14}
            style={{ borderRadius: 14 }}
            fallbackStyle={{
              backgroundColor: tokens.card,
              borderWidth: 1,
              borderColor: tokens.border,
            }}
          >
            <TextInput
              value={name}
              onChangeText={setName}
              maxLength={GROUP_NAME_MAX_LENGTH}
              editable={!busy}
              placeholder={text("群聊名称（可选）", "Group name (optional)")}
              placeholderTextColor={tokens.mutedForeground}
              returnKeyType="done"
              style={{
                color: tokens.foreground,
                minHeight: 46,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            />
          </GlassSurface>
          {error ? (
            <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>
              {error}
            </Text>
          ) : null}
          <NativeActionButton
            label={busy ? text("正在创建…", "Creating…") : text("创建群聊", "Create group")}
            disabled={busy || loading || selected.length < GROUP_MEMBER_MIN}
            busy={busy}
            onPress={() => void create()}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
