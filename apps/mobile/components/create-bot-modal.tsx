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
  StyleSheet,
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
import type { SavedBotAvatar } from "../lib/bot-avatar-library";
import { loadBotAvatarLibrary, removeBotAvatar, saveBotAvatar } from "../lib/bot-avatar-library";
import { BUILT_IN_BOT_AVATARS, bundledBotAvatar, pickBotAvatar } from "../lib/create-bot-avatar";
import type { InboxBotIdentity } from "../lib/create-inbox-bot";
import { useI18n } from "../lib/i18n";
import { native, useMobileTokens } from "../lib/native";
import { currentSessionGeneration } from "../lib/session";
import { errorText } from "../lib/user-error";
import { GlassSurface } from "./glass-surface";
import { NativeActionButton } from "./native-action-button";
import { NativeSymbol } from "./native-symbol";
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
  const text = (chinese: string, english: string) => (locale.startsWith("zh") ? chinese : english);
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
      .then((items) => {
        if (active) setSavedAvatars(items);
      })
      .catch(() => {
        if (active)
          setError(text("无法读取本机头像库", "Could not load the device avatar library"));
      })
      .finally(() => {
        if (active) setAvatarsLoading(false);
      });
    return () => {
      active = false;
      mounted.current = false;
    };
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
            setError(
              text(
                "头像可用于本次创建，但未保存到本机头像库。",
                "The photo can be used now but could not be saved to the device library.",
              ),
            );
        }
      }
    } catch (cause) {
      if (mounted.current)
        setError(errorText(cause, text("无法读取头像", "Could not read avatar")));
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
      setError(
        text("工作区已改变，请关闭后重新创建。", "The workspace changed. Close and try again."),
      );
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const color = photo ?? (await bundledBotAvatar(BUILT_IN_BOT_AVATARS[avatarIndex]!.source));
      if (!current())
        throw new Error(
          text("工作区已改变，请关闭后重新创建。", "The workspace changed. Close and try again."),
        );
      const instructions =
        personal?.instructions ??
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
        setError(
          text(
            "工作区已改变，Bot 可能已在原工作区创建。请返回原工作区查看。",
            "The workspace changed. The bot may have been created in the original workspace; check there.",
          ),
        );
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
  const personalityRows: (typeof SYDNEY_PERSONALITIES)[number][][] = [];
  for (let index = 0; index < SYDNEY_PERSONALITIES.length; index += 2) {
    personalityRows.push(SYDNEY_PERSONALITIES.slice(index, index + 2));
  }
  const choiceStyle = (selected: boolean) => ({
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? tokens.primary : tokens.border,
    borderRadius: 16,
    padding: 12,
    backgroundColor: tokens.card,
  });
  const avatarTileStyle = (selected: boolean) => ({
    width: 68,
    height: 68,
    borderRadius: 20,
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? tokens.primary : tokens.border,
    backgroundColor: tokens.card,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
      onDismiss={() => {
        if (!mounted.current || !finished.current) return;
        finished.current = false;
        onCreated(current() ? destination.current : null);
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: tokens.overlay }}
      >
        <Pressable
          accessibilityLabel={text("关闭", "Close")}
          disabled={disabled}
          onPress={close}
          style={{ flex: 1 }}
        />
        <View
          accessibilityViewIsModal
          style={{
            maxHeight: "92%",
            backgroundColor: tokens.background,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom, 16),
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
              marginBottom: 10,
            }}
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              paddingBottom: 12,
            }}
          >
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={{ color: tokens.foreground, fontSize: 22, fontWeight: "700" }}>
                {text("新建 Bot", "New bot")}
              </Text>
              <Text style={{ color: tokens.mutedForeground, fontSize: 14 }}>
                {text("赋予你的助手独特的身份", "Give your assistant a unique identity")}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text("关闭", "Close")}
              disabled={disabled}
              onPress={close}
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
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 18, gap: 18 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={{ alignItems: "center", paddingTop: 4 }}>
              <GlassSurface
                shape="roundedRectangle"
                cornerRadius={28}
                style={{
                  width: 112,
                  height: 112,
                  borderRadius: 28,
                  alignItems: "center",
                  justifyContent: "center",
                }}
                fallbackStyle={{
                  backgroundColor: tokens.card,
                  borderWidth: 1,
                  borderColor: tokens.border,
                }}
              >
                <Image source={preview} style={{ width: 84, height: 84, borderRadius: 42 }} />
              </GlassSurface>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: tokens.foreground, fontWeight: "600", fontSize: 15 }}>
                {text("Bot 名称", "Bot name")}
              </Text>
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
                  maxLength={BOT_NAME_MAX_LENGTH}
                  editable={!disabled}
                  placeholder={text("为你的 Bot 命名", "Name your bot")}
                  placeholderTextColor={tokens.mutedForeground}
                  style={{
                    minHeight: 48,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    color: tokens.foreground,
                    fontSize: 16,
                  }}
                />
              </GlassSurface>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: tokens.foreground, fontWeight: "600", fontSize: 15 }}>
                {text("人格", "Personality")}
              </Text>
              <View style={{ gap: 8 }}>
                {personalityRows.map((row) => (
                  <View
                    key={row.map((entry) => entry.id).join("-")}
                    style={{ flexDirection: "row", gap: 8 }}
                  >
                    {row.map((item) => {
                      const selected = !personal && personality === item.id;
                      return (
                        <Pressable
                          key={item.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`${text(...labels[item.id])}，${text(...descriptions[item.id])}`}
                          disabled={disabled}
                          onPress={() => {
                            setPersonality(item.id);
                            setPersonal(null);
                          }}
                          style={[choiceStyle(selected), { flex: 1, minWidth: 0, gap: 4 }]}
                        >
                          <Text style={{ color: tokens.foreground, fontWeight: "600" }}>
                            {text(...labels[item.id])}
                          </Text>
                          <Text
                            numberOfLines={2}
                            style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 16 }}
                          >
                            {text(...descriptions[item.id])}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>

              <GlassSurface
                shape="roundedRectangle"
                cornerRadius={14}
                style={{ borderRadius: 14, marginTop: 2 }}
                fallbackStyle={{
                  backgroundColor: tokens.card,
                  borderWidth: 1,
                  borderColor: tokens.border,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  disabled={disabled}
                  onPress={() => {
                    if (!current()) {
                      setError(
                        text(
                          "工作区已改变，请关闭后重新创建。",
                          "The workspace changed. Close and try again.",
                        ),
                      );
                      return;
                    }
                    setLibraryOpen((open) => !open);
                  }}
                  style={{
                    minHeight: 48,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{ flex: 1, color: tokens.foreground, fontWeight: "500" }}
                  >
                    {text("个人人格库", "Personal personality library")}
                    {personal ? ` · ${personal.name}` : ""}
                  </Text>
                  <NativeSymbol
                    ios={libraryOpen ? "chevron.up" : "chevron.down"}
                    android={libraryOpen ? "chevron-up" : "chevron-down"}
                    size={15}
                    color={tokens.mutedForeground}
                  />
                </Pressable>
              </GlassSurface>

              {libraryOpen ? (
                <PersonalPersonalityLibrary
                  current={current}
                  disabled={busy}
                  selectedId={personal?.id}
                  onSelect={(item) => {
                    setPersonal(item);
                    setLibraryOpen(false);
                  }}
                  onSaved={(item) => setPersonal((old) => (old?.id === item.id ? item : old))}
                  onRemoved={(id) => setPersonal((old) => (old?.id === id ? null : old))}
                  onBusyChange={setLibraryBusy}
                />
              ) : null}
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: tokens.foreground, fontWeight: "600", fontSize: 15 }}>
                {text("头像", "Avatar")}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {BUILT_IN_BOT_AVATARS.map((item, index) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={item.name}
                    accessibilityState={{ selected: !photo && avatarIndex === index }}
                    disabled={disabled}
                    onPress={() => {
                      setAvatarIndex(index);
                      setPhoto(null);
                    }}
                    style={avatarTileStyle(!photo && avatarIndex === index)}
                  >
                    <Image
                      source={item.source}
                      style={{ width: 48, height: 48, borderRadius: 24 }}
                    />
                  </Pressable>
                ))}
                {savedAvatars.map((avatar) => (
                  <View key={avatar.id}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={text("选择已保存头像", "Select saved avatar")}
                      accessibilityState={{ selected: photo === avatar.dataUrl }}
                      disabled={disabled}
                      onPress={() => setPhoto(avatar.dataUrl)}
                      style={avatarTileStyle(photo === avatar.dataUrl)}
                    >
                      <Image
                        source={{ uri: avatar.dataUrl }}
                        style={{ width: 48, height: 48, borderRadius: 24 }}
                      />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={text("移除已保存头像", "Remove saved avatar")}
                      disabled={disabled}
                      hitSlop={6}
                      onPress={() => confirmRemoveAvatar(avatar)}
                      style={{
                        position: "absolute",
                        top: -4,
                        right: -4,
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        backgroundColor: tokens.card,
                        borderWidth: 1,
                        borderColor: tokens.border,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <NativeSymbol
                        ios="xmark"
                        android="close"
                        size={11}
                        color={tokens.mutedForeground}
                      />
                    </Pressable>
                  </View>
                ))}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={text("上传头像", "Choose photo")}
                  disabled={disabled || avatarsLoading}
                  onPress={() => void choosePhoto()}
                  style={[avatarTileStyle(false), { gap: 3 }]}
                >
                  <NativeSymbol ios="plus" android="add" size={20} color={tokens.foreground} />
                  <Text style={{ color: tokens.mutedForeground, fontSize: 11 }}>
                    {text("上传", "Upload")}
                  </Text>
                </Pressable>
              </View>
              <Text style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 17 }}>
                {text(
                  "上传的头像保存在此设备，设备上的账号均可使用，不会自动同步。",
                  "Uploaded avatars are saved on this device, available to its accounts, and do not sync automatically.",
                )}
              </Text>
            </View>
          </ScrollView>

          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 12,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: tokens.border,
              gap: 10,
            }}
          >
            {error ? (
              <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>
                {error}
              </Text>
            ) : null}
            <NativeActionButton
              label={text("创建", "Create")}
              disabled={!name.trim() || libraryBusy}
              busy={busy}
              onPress={() => void create()}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
