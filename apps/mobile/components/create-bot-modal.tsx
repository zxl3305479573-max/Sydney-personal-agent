import type { PersonalityPreset, SydneyPersonalityId } from "@rakazo/contracts";
import {
  BOT_NAME_MAX_LENGTH,
  combinePersonalityInstructions,
  SYDNEY_PERSONALITIES,
} from "@rakazo/contracts";
import { newClientId } from "@rakazo/core";
import type { Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  currentApiBase,
  isSpaceSelectionPending,
  selectedSpaceId,
  spaceSelectionSeq,
} from "../lib/api";
import { BUILT_IN_BOT_AVATARS, bundledBotAvatar, pickBotAvatar } from "../lib/create-bot-avatar";
import {
  type SavedBotAvatar,
  loadBotAvatarLibrary,
  removeBotAvatar,
  saveBotAvatar,
} from "../lib/bot-avatar-library";
import type { InboxBotIdentity } from "../lib/create-inbox-bot";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { currentSessionGeneration } from "../lib/session";
import { errorText } from "../lib/user-error";
import { NativeActionButton } from "./native-action-button";
import { PersonalPersonalityLibrary } from "./personal-personality-library";

const labels: Record<SydneyPersonalityId, [string, string]> = {
  balanced: ["均衡", "Balanced"],
  professional: ["专业", "Professional"],
  friendly: ["亲切", "Friendly"],
  concise: ["简洁", "Concise"],
  creative: ["创意", "Creative"],
  teacher: ["老师", "Teacher"],
};

const descriptions: Record<SydneyPersonalityId, [string, string]> = {
  balanced: ["适合日常对话", "Reliable for everyday conversations"],
  professional: ["表达有条理、准确", "Structured and precise"],
  friendly: ["温和、有耐心", "Warm and patient"],
  concise: ["简短并注重行动", "Short and action focused"],
  creative: ["提供创意和新方向", "Ideas and fresh directions"],
  teacher: ["耐心解释并举例", "Patient explanations and examples"],
};

export function CreateBotModal({
  onClose,
  onCreate,
  onCreated,
}: {
  onClose: () => void;
  onCreate: (identity: InboxBotIdentity) => Promise<Href | null>;
  onCreated: (destination: Href | null) => void;
}) {
  const tokens = useMobileTokens();
  const insets = useSafeAreaInsets();
  const { locale } = useI18n();
  const text = (chinese: string, english: string) => locale.startsWith("zh") ? chinese : english;
  const [name, setName] = useState("");
  const [avatarIndex, setAvatarIndex] = useState(0);
  const [photo, setPhoto] = useState<string | null>(null);
  const [savedAvatars, setSavedAvatars] = useState<SavedBotAvatar[]>([]);
  const [avatarsLoading, setAvatarsLoading] = useState(true);
  const [personality, setPersonality] = useState<SydneyPersonalityId>("balanced");
  const [personal, setPersonal] = useState<PersonalityPreset | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(true);
  const submitting = useRef(false);
  const finished = useRef(false);
  const destination = useRef<Href | null>(null);
  const attempt = useRef<{ identity: string; key: string } | null>(null);
  const scope = useRef({
    generation: currentSessionGeneration(),
    apiBase: currentApiBase(),
    spaceId: selectedSpaceId(),
    selection: spaceSelectionSeq(),
  }).current;
  const current = () =>
    scope.generation === currentSessionGeneration() &&
    scope.apiBase === currentApiBase() &&
    scope.spaceId === selectedSpaceId() &&
    scope.selection === spaceSelectionSeq() &&
    !isSpaceSelectionPending();
  const mounted = useRef(true);
  useEffect(() => {
    let active = true;
    mounted.current = true;
    void loadBotAvatarLibrary()
      .then((items) => { if (active) setSavedAvatars(items); })
      .catch(() => {
        if (active) setError(text("无法读取本机头像库", "Could not load the device avatar library"));
      })
      .finally(() => { if (active) setAvatarsLoading(false); });
    return () => { active = false; mounted.current = false; };
  }, []);

  const disabled = busy || libraryBusy;

  async function choosePhoto() {
    if (submitting.current || libraryBusy) return;
    submitting.current = true;
    setBusy(true);
    try {
      const value = await pickBotAvatar();
      if (value && mounted.current && current()) {
        setPhoto(value);
        try {
          const saved = await saveBotAvatar(value);
          if (mounted.current && current()) setSavedAvatars((old) => [saved, ...old]);
        } catch {
          if (mounted.current && current())
            setError(text("头像可用于本次创建，但未保存到本机头像库。", "The photo can be used now but could not be saved to the device library."));
        }
      }
    } catch (cause) {
      if (mounted.current) setError(errorText(cause, text("无法读取头像", "Could not read avatar")));
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function confirmRemoveAvatar(avatar: SavedBotAvatar) {
    Alert.alert(
      text("移除本机头像？", "Remove this device avatar?"),
      text("已有 Bot 的头像不会改变。", "Existing bot avatars will not change."),
      [
        { text: text("取消", "Cancel"), style: "cancel" },
        {
          text: text("移除", "Remove"),
          style: "destructive",
          onPress: () => {
            if (!mounted.current || submitting.current || libraryBusy || !current()) return;
            try {
              removeBotAvatar(avatar.id);
              setSavedAvatars((old) => old.filter((item) => item.id !== avatar.id));
              if (photo === avatar.dataUrl) setPhoto(null);
            } catch {
              setError(text("无法移除本机头像", "Could not remove the device avatar"));
            }
          },
        },
      ],
    );
  }

  async function create() {
    if (submitting.current || libraryBusy || !name.trim()) return;
    if (!current()) {
      setError(text("工作区已改变，请关闭后重新创建。", "The workspace changed. Close and try again."));
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const color = photo ?? await bundledBotAvatar(BUILT_IN_BOT_AVATARS[avatarIndex]!.source);
      if (!current()) throw new Error(text("工作区已改变，请关闭后重新创建。", "The workspace changed. Close and try again."));
      const instructions = personal?.instructions ??
        SYDNEY_PERSONALITIES.find((item) => item.id === personality)!.instructions;
      const identity = {
        name: name.trim(),
        color,
        instructions: combinePersonalityInstructions("", instructions),
      };
      const fingerprint = JSON.stringify(identity);
      if (attempt.current?.identity !== fingerprint) {
        attempt.current = { identity: fingerprint, key: `mobile-create-${newClientId()}` };
      }
      destination.current = await onCreate({ ...identity, spawnKey: attempt.current.key });
      if (!mounted.current) return;
      if (!current()) {
        setError(text(
          "工作区已改变，Bot 可能已在原工作区创建。请返回原工作区查看。",
          "The workspace changed. The bot may have been created in the original workspace; check there.",
        ));
        return;
      }
      finished.current = true;
      setVisible(false);
      if (Platform.OS !== "ios") {
        finished.current = false;
        onCreated(current() ? destination.current : null);
      }
    } catch (cause) {
      if (mounted.current) setError(errorText(cause, text("无法创建 Bot", "Could not create bot")));
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function close() {
    if (!submitting.current && !libraryBusy) onClose();
  }

  const preview = photo ? { uri: photo } : BUILT_IN_BOT_AVATARS[avatarIndex]!.source;
  const choiceStyle = (selected: boolean) => ({
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? tokens.primary : tokens.border,
    borderRadius: 16,
    padding: 12,
    backgroundColor: tokens.card,
  });
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}
      onDismiss={() => {
        if (!mounted.current || !finished.current) return;
        finished.current = false;
        onCreated(current() ? destination.current : null);
      }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: tokens.overlay }}>
        <Pressable accessibilityLabel={text("关闭", "Close")} disabled={disabled} onPress={close} style={{ flex: 1 }} />
        <View accessibilityViewIsModal style={{ maxHeight: "92%", backgroundColor: tokens.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 20, paddingHorizontal: 20, paddingBottom: insets.bottom }}>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <Pressable accessibilityRole="button" accessibilityLabel={text("关闭", "Close")}
              disabled={disabled} onPress={close}
              style={{ alignSelf: "flex-end", paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ color: tokens.foreground }}>{text("关闭", "Close")}</Text>
            </Pressable>
            <Text style={{ color: tokens.foreground, fontSize: 22, fontWeight: "700" }}>{text("新建 Bot", "New bot")}</Text>
            <Text style={{ color: tokens.mutedForeground, marginTop: 6 }}>{text("赋予你的助手独特的身份", "Give your assistant a unique identity")}</Text>
            <Image source={preview} style={{ width: 96, height: 96, borderRadius: 48, alignSelf: "center", marginVertical: 20 }} />
            <Text style={{ color: tokens.foreground, fontWeight: "600", marginTop: 20, marginBottom: 8 }}>{text("Bot 名称", "Bot name")}</Text>
            <TextInput value={name} onChangeText={setName} maxLength={BOT_NAME_MAX_LENGTH} editable={!disabled}
              placeholder={text("为你的 Bot 命名", "Name your bot")} placeholderTextColor={tokens.mutedForeground}
              style={{ borderWidth: 1, borderColor: tokens.border, borderRadius: 14, padding: 12, color: tokens.foreground }} />
            <Text style={{ color: tokens.foreground, fontWeight: "600", marginTop: 20, marginBottom: 8 }}>{text("人格", "Personality")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {SYDNEY_PERSONALITIES.map((item) => (
                <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: !personal && personality === item.id }}
                  accessibilityLabel={`${text(...labels[item.id])}，${text(...descriptions[item.id])}`}
                  disabled={disabled} onPress={() => { setPersonality(item.id); setPersonal(null); }}
                  style={[choiceStyle(!personal && personality === item.id), { width: "48%", gap: 4 }]}>
                  <Text style={{ color: tokens.foreground, fontWeight: "600" }}>{text(...labels[item.id])}</Text>
                  <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>{text(...descriptions[item.id])}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable accessibilityRole="button" disabled={disabled} onPress={() => {
              if (!current()) {
                setError(text("工作区已改变，请关闭后重新创建。", "The workspace changed. Close and try again."));
                return;
              }
              setLibraryOpen((open) => !open);
            }} style={{ paddingVertical: 14 }}>
              <Text style={{ color: tokens.foreground }}>{text("个人人格库", "Personal personality library")}{personal ? ` · ${personal.name}` : ""}</Text>
            </Pressable>
            {libraryOpen ? (
              <PersonalPersonalityLibrary
                current={current}
                disabled={busy}
                selectedId={personal?.id}
                onSelect={(item) => { setPersonal(item); setLibraryOpen(false); }}
                onSaved={(item) => setPersonal((old) => old?.id === item.id ? item : old)}
                onRemoved={(id) => setPersonal((old) => old?.id === id ? null : old)}
                onBusyChange={setLibraryBusy}
              />
            ) : null}
            <Text style={{ color: tokens.foreground, fontWeight: "600", marginTop: 20, marginBottom: 8 }}>{text("头像", "Avatar")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {BUILT_IN_BOT_AVATARS.map((item, index) => (
                <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.name}
                  accessibilityState={{ selected: !photo && avatarIndex === index }}
                  disabled={disabled} onPress={() => { setAvatarIndex(index); setPhoto(null); }}
                  style={choiceStyle(!photo && avatarIndex === index)}>
                  <Image source={item.source} style={{ width: 48, height: 48, borderRadius: 24 }} />
                </Pressable>
              ))}
              {savedAvatars.map((avatar) => (
                <View key={avatar.id} style={{ alignItems: "center" }}>
                  <Pressable accessibilityRole="button" accessibilityLabel={text("选择已保存头像", "Select saved avatar")}
                    accessibilityState={{ selected: photo === avatar.dataUrl }} disabled={disabled}
                    onPress={() => setPhoto(avatar.dataUrl)} style={choiceStyle(photo === avatar.dataUrl)}>
                    <Image source={{ uri: avatar.dataUrl }} style={{ width: 48, height: 48, borderRadius: 24 }} />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={text("移除已保存头像", "Remove saved avatar")}
                    disabled={disabled} onPress={() => confirmRemoveAvatar(avatar)} style={{ padding: 8 }}>
                    <Text style={{ color: tokens.mutedForeground }}>{text("移除", "Remove")}</Text>
                  </Pressable>
                </View>
              ))}
              <Pressable accessibilityRole="button" disabled={disabled || avatarsLoading} onPress={() => void choosePhoto()} style={choiceStyle(false)}>
                <Text style={{ color: tokens.foreground }}>{text("上传头像", "Choose photo")}</Text>
              </Pressable>
            </View>
            <Text style={{ color: tokens.mutedForeground, marginTop: 8 }}>
              {text("上传的头像保存在此设备，设备上的账号均可使用，不会自动同步。", "Uploaded avatars are saved on this device, available to its accounts, and do not sync automatically.")}
            </Text>
            {error ? <Text accessibilityRole="alert" style={{ color: tokens.destructive, marginVertical: 8 }}>{error}</Text> : null}
            <View style={{ marginTop: 18, marginBottom: 20 }}>
              <NativeActionButton label={text("创建", "Create")} disabled={!name.trim() || libraryBusy} busy={busy} onPress={() => void create()} />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
