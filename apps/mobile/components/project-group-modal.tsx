import { defaultGroupName, GROUP_MEMBER_MAX, GROUP_MEMBER_MIN, GROUP_NAME_MAX_LENGTH } from "@rakazo/contracts";
import { newClientId } from "@rakazo/core";
import { useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureApiRequestContext, rpc } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { NativeActionButton } from "./native-action-button";

type Member = { id: string; name: string };
export type ProjectGroupAttempt = { fingerprint: string; id: string };

export function ProjectGroupModal({ projectId, current, attempt, onClose, onCreated }: {
  projectId: string;
  current: () => boolean;
  attempt: { current: ProjectGroupAttempt | null };
  onClose: () => void;
  onCreated: () => void;
}) {
  const { locale } = useI18n();
  const text = (chinese: string, english: string) => locale.startsWith("zh") ? chinese : english;
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
    return () => { mounted.current = false; };
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
        const page = await rpc("projectWorkspaces/roster", { id: projectId, afterBotId: after }, {
          requestContext, signal: controller.signal, skipSpaceAuthRecovery: true,
        });
        if (active && current()) {
          setItems(page.bots);
          setNext(page.nextBotId);
        }
      } catch {
        if (active && current()) setError(text("无法加载项目成员，请关闭后重试。", "Could not load project members. Close and retry."));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [projectId, after]);

  async function create() {
    if (inFlight.current || !current() || selected.length < GROUP_MEMBER_MIN || selected.length > GROUP_MEMBER_MAX) return;
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
      await rpc("projectWorkspaces/createGroup", {
        projectId, requestId, group,
      }, { requestContext, skipSpaceAuthRecovery: true });
      if (!mounted.current || !current()) return;
      attempt.current = null;
      onCreated();
    } catch {
      if (mounted.current && current())
        setError(text("创建未确认。请使用相同内容重试，或返回项目名单确认。", "Creation was not confirmed. Retry with the same details or check the project list."));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: tokens.overlay }}>
        <Pressable accessibilityLabel={text("关闭", "Close")} disabled={busy} onPress={onClose} style={{ flex: 1 }} />
        <View accessibilityViewIsModal style={{ maxHeight: "90%", backgroundColor: tokens.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: insets.bottom + 16 }}>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}>
            <Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: "700", color: tokens.foreground }}>{text("新建项目群聊", "New project group")}</Text>
            <Text style={{ color: tokens.mutedForeground, marginVertical: 12 }}>
              {text(`选择 ${GROUP_MEMBER_MIN}–${GROUP_MEMBER_MAX} 个项目 Bot，已选 ${selected.length} 个。`, `Choose ${GROUP_MEMBER_MIN}–${GROUP_MEMBER_MAX} project bots; ${selected.length} selected.`)}
            </Text>
            {loading ? <Text style={{ color: tokens.mutedForeground }}>{text("正在加载…", "Loading…")}</Text> : items.map((item) => {
              const checked = selected.some((member) => member.id === item.id);
              return <Pressable key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked, disabled: busy || (!checked && selected.length >= GROUP_MEMBER_MAX) }}
                disabled={busy || (!checked && selected.length >= GROUP_MEMBER_MAX)}
                onPress={() => setSelected((old) => checked ? old.filter((member) => member.id !== item.id) : [...old, item])}
                style={{ paddingVertical: 12, flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: tokens.foreground }}>{item.name}</Text>
                <Text style={{ color: tokens.primary }}>{checked ? "✓" : "○"}</Text>
              </Pressable>;
            })}
            <View style={{ flexDirection: "row", gap: 16, marginVertical: 8 }}>
              {cursors.length ? <NativeActionButton label={text("上一页", "Previous")} disabled={loading || busy}
                prominence="quiet" onPress={() => setCursors((old) => old.at(-1) === after ? old.slice(0, -1) : old)} /> : null}
              {next ? <NativeActionButton label={text("下一页", "Next")} disabled={loading || busy}
                prominence="quiet" onPress={() => {
                  const nextCursor = next;
                  if (nextCursor) setCursors((old) => old.at(-1) === after ? [...old, nextCursor] : old);
                }} /> : null}
            </View>
            <TextInput value={name} onChangeText={setName} maxLength={GROUP_NAME_MAX_LENGTH} editable={!busy}
              placeholder={text("群聊名称（可选）", "Group name (optional)")} placeholderTextColor={tokens.mutedForeground}
              style={{ color: tokens.foreground, borderColor: tokens.border, borderWidth: 1, borderRadius: 12, padding: 12, marginVertical: 12 }} />
            {error ? <Text accessibilityRole="alert" style={{ color: tokens.destructive, marginBottom: 12 }}>{error}</Text> : null}
            <NativeActionButton label={busy ? text("正在创建…", "Creating…") : text("创建群聊", "Create group")}
              disabled={busy || loading || selected.length < GROUP_MEMBER_MIN} onPress={() => void create()} />
            <NativeActionButton label={text("取消", "Cancel")} disabled={busy} prominence="quiet" onPress={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
