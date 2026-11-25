import {
  defaultGroupName,
  GROUP_MEMBER_MAX,
  GROUP_MEMBER_MIN,
  GROUP_NAME_MAX_LENGTH,
} from "@rakazo/contracts";
import { Stack, useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BackHandler, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { BotChipPicker } from "../components/bot-chip-picker";
import { GlassIconButton } from "../components/glass-icon-button";
import { GlassSurface } from "../components/glass-surface";
import { GroupAvatar } from "../components/group-avatar";
import { NativeActionButton } from "../components/native-action-button";
import { SheetCloseButton } from "../components/sheet-close-button";
import type { MobileBot } from "../lib/api";
import { captureApiRequestContext, isSpaceSelectionPending, rpc } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { native, useMobileTokens } from "../lib/native";
import { iosAtLeast } from "../lib/native-controls";
import { projectScopeKey, subscribeProjectScope } from "../lib/project-scope";
import { addToSearchInbox, searchInboxSession } from "../lib/search-inbox";
import { useSideInsets } from "../lib/side-insets";
import { errorText } from "../lib/user-error";

export default function NewGroup() {
  const sideInsets = useSideInsets();
  const { t, locale } = useI18n();
  const tokens = useMobileTokens();
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const [bots, setBots] = useState<MobileBot[]>([]);
  const [step, setStep] = useState<"bots" | "name">("bots");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const creating = useRef(false);
  const mounted = useRef(false);
  const scopeKey = useSyncExternalStore(subscribeProjectScope, projectScopeKey);
  const openedScope = useRef(scopeKey).current;
  const current = () => openedScope === projectScopeKey() && !isSpaceSelectionPending();
  const scopeChanged = scopeKey !== openedScope || isSpaceSelectionPending();
  const valid = !scopeChanged && selected.length >= GROUP_MEMBER_MIN && selected.length <= GROUP_MEMBER_MAX;
  const picked = selected.flatMap((id) => bots.find((bot) => bot.id === id) ?? []);
  const goBack = () => {
    if (!creating.current) setStep("bots");
  };
  function close() {
    if (router.canDismiss()) router.dismiss();
    else if (router.canGoBack()) router.back();
    else router.replace("/");
  }
  useEffect(() => {
    mounted.current = true;
    let active = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const requestContext = await captureApiRequestContext();
        if (!active || !mounted.current || !current()) return;
        const nextBots = await rpc("bots/list", undefined, {
          requestContext, signal: controller.signal, skipSpaceAuthRecovery: true,
        });
        if (active && mounted.current && current()) setBots(nextBots.filter((bot) => !bot.archivedAt));
      } catch (cause) {
        if (active && mounted.current && current())
          setError(errorText(cause, t("Could not load bots")));
      }
    })();
    return () => { active = false; mounted.current = false; controller.abort(); };
  }, []);
  useEffect(() => {
    if (step !== "name") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!creating.current) setStep("bots");
      return true;
    });
    return () => subscription.remove();
  }, [step]);

  async function create() {
    if (!valid || creating.current || !current()) return;
    creating.current = true;
    setPending(true);
    setError(null);
    const askedIn = searchInboxSession();
    try {
      const requestContext = await captureApiRequestContext();
      if (!mounted.current || !current()) return;
      const group = await rpc("groups/create", {
        name: name.trim() || defaultGroupName(picked.map((bot) => bot.name)),
        botIds: selected,
      }, {
        requestContext, skipSpaceAuthRecovery: true,
      });
      if (!mounted.current || !current()) return;
      addToSearchInbox({ kind: "group", group }, askedIn);
      router.replace({
        pathname: "/group-thread",
        params: { groupId: group.id, name: group.name },
      });
    } catch (err) {
      if (mounted.current && current()) setError(errorText(err, t("Could not create group")));
    } finally {
      creating.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return (
    <>
      <Stack.Screen
        options={{
          title: t("New group chat"),
          headerTransparent: true,
          headerStyle: { backgroundColor: "transparent" },
          headerBackVisible: false,
          headerLeft: () =>
            step === "bots" ? (
              <SheetCloseButton onPress={close} />
            ) : (
              <GlassIconButton
                accessibilityLabel={t("Back")}
                ios="chevron.left"
                android="chevron-back"
                onPress={goBack}
              />
            ),
          headerRight: () =>
            step === "bots" ? (
              <NativeActionButton
                label={t("Next")}
                disabled={!valid}
                size="compact"
                onPress={() => setStep("name")}
                style={{ borderRadius: 24 }}
              />
            ) : null,
          ...(iosAtLeast(26)
            ? {
                unstable_headerLeftItems: () => [
                  {
                    type: "button" as const,
                    hidesSharedBackground: true,
                    label: step === "bots" ? t("Close") : t("Back"),
                    icon: {
                      type: "sfSymbol" as const,
                      name: step === "bots" ? "xmark" : "chevron.left",
                    },
                    onPress: step === "bots" ? close : goBack,
                    disabled: pending,
                  },
                ],
                unstable_headerRightItems: () =>
                  step === "bots"
                    ? [
                        {
                          type: "button" as const,
                          hidesSharedBackground: true,
                          label: t("Next"),
                          icon: { type: "sfSymbol" as const, name: "chevron.right" },
                          variant: "plain" as const,
                          tintColor: tokens.primary,
                          disabled: !valid,
                          onPress: () => setStep("name"),
                        },
                      ]
                    : [],
              }
            : {}),
        }}
      />
      {/* Shrinks above the keyboard so Skip/Create and the last bot rows stay reachable. */}
      <KeyboardAvoidingView
        behavior="padding"
        automaticOffset
        style={{ flex: 1, backgroundColor: tokens.background }}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          style={[{ flex: 1 }, sideInsets]}
          contentContainerStyle={{
            padding: 24,
            paddingTop: Platform.OS === "ios" ? 24 : headerHeight + 24,
          }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          {scopeChanged ? (
            <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>
              {locale.startsWith("zh")
                ? "账号或空间已变化，请关闭后重新创建群聊。若创建请求已发出，请回到原空间确认结果。"
                : "The account or space changed. Close and start again. If creation was submitted, check the original space."}
            </Text>
          ) : step === "bots" ? (
            <>
              {error ? <Text accessibilityRole="alert" style={{ color: tokens.destructive, marginBottom: 12 }}>{error}</Text> : null}
              <BotChipPicker bots={bots} selected={selected} onChange={setSelected} />
            </>
          ) : (
            <View key="name">
              <View style={{ alignItems: "center", marginTop: 24, marginBottom: 32 }}>
                <GroupAvatar
                  size={120}
                  members={picked
                    .slice(0, 3)
                    .map((bot) => ({ botId: bot.id, color: bot.color, avatarSet: bot.avatarSet }))}
                />
              </View>
              <GlassSurface
                shape="roundedRectangle"
                cornerRadius={11}
                style={{ borderRadius: 11 }}
                fallbackStyle={{ backgroundColor: native.fill }}
              >
                <TextInput
                  accessibilityLabel={t("Group name")}
                  autoFocus
                  value={name}
                  onChangeText={setName}
                  maxLength={GROUP_NAME_MAX_LENGTH}
                  autoCapitalize="words"
                  autoCorrect={false}
                  autoComplete="off"
                  textContentType="none"
                  editable={!pending}
                  placeholder={t("Ex: Project Falcon")}
                  placeholderTextColor={tokens.mutedForeground}
                  returnKeyType="done"
                  onSubmitEditing={() => void create()}
                  style={{
                    height: 56,
                    borderRadius: 11,
                    color: tokens.foreground,
                    fontSize: 22,
                    fontWeight: "600",
                    textAlign: "center",
                    paddingHorizontal: 14,
                  }}
                />
              </GlassSurface>
              <NativeActionButton
                fill
                label={pending ? t("Creating…") : name.trim() ? t("Create") : t("Skip")}
                prominence={name.trim() ? "primary" : "secondary"}
                disabled={pending || scopeChanged}
                onPress={() => void create()}
                style={{ marginTop: 24, borderRadius: 28 }}
              />
              {error ? (
                <Text accessibilityRole="alert" style={{ color: tokens.destructive, marginTop: 12 }}>
                  {error}
                </Text>
              ) : null}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
