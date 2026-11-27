import type {
  Bot,
  BotAvatarSet,
  ComputerMode,
  PersonalityPreset,
  RpcInput,
  ThinkingLevel,
} from "@rakazo/contracts";
import {
  BOT_DESCRIPTION_MAX_LENGTH,
  BOT_INSTRUCTIONS_MAX_LENGTH,
  BOT_NAME_MAX_LENGTH,
  combinePersonalityInstructions,
  ProjectWorkspaceIdInput,
  resolveBotAvatarSet,
  SYDNEY_PERSONALITIES,
  splitPersonalityInstructions,
} from "@rakazo/contracts";
import {
  credentialForModel,
  MODEL_SEARCH_THRESHOLD,
  modelOptionKey,
  parseModelOptionKey,
  resolveSelectableModelId,
} from "@rakazo/core";
import type { ColorTokens } from "@rakazo/ui-tokens";
import type { ErrorBoundaryProps } from "expo-router";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import type { Voice } from "expo-speech";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Alert, Image, Modal, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { BotAvatar } from "../components/bot-avatar";
import { BotContextCards } from "../components/bot-context-cards";
import { ComputerModePicker } from "../components/computer-mode-picker";
import { GlassSurface } from "../components/glass-surface";
import { glassHeaderOptions } from "../components/glass-title";
import { GrowingTextInput } from "../components/growing-text-input";
import type { MenuPickerChoice } from "../components/menu-picker";
import { MenuPicker, MenuPickerMenu } from "../components/menu-picker";
import { MotionPressable } from "../components/motion-pressable";
import { NativeActionButton } from "../components/native-action-button";
import { NativeSwitch } from "../components/native-switch";
import { NativeSymbol } from "../components/native-symbol";
import { PersonalPersonalityLibrary } from "../components/personal-personality-library";
import { ProfileEditDialog } from "../components/profile-edit-dialog";
import { RenderErrorDetails } from "../components/render-error-details";
import { Chevron } from "../components/row-accessories";
import type { MobileMe, MobileModel, MobileModelCredential } from "../lib/api";
import {
  currentApiBase,
  isSpaceSelectionPending,
  loadSessionToken,
  rpc,
  selectedSpaceId,
  spaceSelectionSeq,
} from "../lib/api";
import { isAvatarPhoto } from "../lib/bot-avatar-edit";
import type { SavedBotAvatar } from "../lib/bot-avatar-library";
import { loadBotAvatarLibrary, removeBotAvatar, saveBotAvatar } from "../lib/bot-avatar-library";
import { deviceVoices, setVoiceForBot, voiceForBot, voiceLabel } from "../lib/bot-voices";
import { chatModelPickerChoices } from "../lib/chat-model";
import { COMPUTER_LIFECYCLE_TIMEOUT_MS } from "../lib/computer";
import { BUILT_IN_BOT_AVATARS, bundledBotAvatar, pickBotAvatar } from "../lib/create-bot-avatar";
import { DEFAULT_BOT_AVATAR_DATA_URI } from "../lib/default-bot-avatar";
import { loadDeviceVoiceEnabled } from "../lib/device-voice";
import { useFeatureAccess } from "../lib/feature-access";
import { useI18n } from "../lib/i18n";
import { afterChatNotifyChange } from "../lib/live-notifications";
import { reportMobileError } from "../lib/monitoring";
import { native, useMobileTokens } from "../lib/native";
import {
  projectRequestOptions,
  projectScopeKey,
  subscribeProjectScope,
} from "../lib/project-scope";
import { createQueuedSave } from "../lib/queued-save";
import { useScopedTheme, useScreenBackground } from "../lib/scoped-theme-context";
import { currentSessionGeneration } from "../lib/session";
import { useSideInsets } from "../lib/side-insets";
import { thinkingLevelLabel } from "../lib/thinking-level";
import { errorText } from "../lib/user-error";
import { stopVoicePlayback } from "../lib/voice";

function isLightPalette(tokens?: Partial<ColorTokens> | null): boolean {
  const bg = tokens?.background;
  if (typeof bg === "string" && bg.startsWith("#") && bg.length >= 7) {
    const red = Number.parseInt(bg.slice(1, 3), 16);
    if (!Number.isNaN(red)) return red >= 128;
  }
  return true;
}

type BotSettingsParams = {
  botId: string;
  model?: string;
  focus?: string;
  projectId?: string;
  scope?: string;
};

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const router = useRouter();
  useEffect(() => {
    reportMobileError(error, "react.render", { screen: "bot-settings" });
  }, [error]);
  return (
    <>
      <Stack.Screen options={glassHeaderOptions(t("Chat settings"))} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: tokens.background }}
        contentContainerStyle={{ padding: 24, gap: 20 }}
      >
        <Text accessibilityRole="header" style={{ color: tokens.foreground, fontSize: 18 }}>
          {t("Could not load bot")}
        </Text>
        <RenderErrorDetails error={error} color={tokens.foreground} />
        <MotionPressable
          preset="control"
          accessibilityRole="button"
          onPress={() => void retry()}
          style={{ padding: 16, borderRadius: 12, backgroundColor: tokens.primary }}
        >
          <Text style={{ color: tokens.primaryForeground, textAlign: "center" }}>
            {t("Try again")}
          </Text>
        </MotionPressable>
        <MotionPressable
          preset="control"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={{ padding: 16 }}
        >
          <Text style={{ color: tokens.foreground, textAlign: "center" }}>{t("Back")}</Text>
        </MotionPressable>
      </ScrollView>
    </>
  );
}

export default function BotSettingsRoute() {
  const params = useLocalSearchParams<BotSettingsParams>();
  if (params.projectId !== undefined) return <ProjectBotSettingsRoute params={params} />;
  return <BotSettingsScreen key={params.botId} params={params} />;
}

function ProjectBotSettingsRoute({ params }: { params: BotSettingsParams }) {
  const scope = useSyncExternalStore(subscribeProjectScope, projectScopeKey);
  const [openedScope] = useState(params.scope ?? scope);
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const project = ProjectWorkspaceIdInput.safeParse({ id: params.projectId });
  if (!project.success || scope !== openedScope) {
    return (
      <>
        <Stack.Screen options={glassHeaderOptions(t("Chat settings"))} />
        <Text accessibilityRole="alert" style={{ padding: 24, color: tokens.destructive }}>
          {t("Could not load bot")}
        </Text>
      </>
    );
  }
  return (
    <BotSettingsScreen
      key={JSON.stringify([scope, project.data.id, params.botId])}
      params={params}
      projectId={project.data.id}
      scope={scope}
    />
  );
}

function BotSettingsScreen({
  params: { botId, model: pickedModel, focus },
  projectId,
  scope,
}: {
  params: BotSettingsParams;
  projectId?: string;
  scope?: string;
}) {
  const sideInsets = useSideInsets();
  const tokens = useMobileTokens();
  const themedScope = useScopedTheme();
  const screenBackground = useScreenBackground(tokens.background);
  const isLight = themedScope ? themedScope.appearance === "light" : isLightPalette(tokens);
  const hairline = StyleSheet.hairlineWidth ?? 0.5;
  const cardBg = themedScope
    ? (themedScope.tokens?.card ?? "#FFFEFC")
    : isLight
      ? "#FFFEFC"
      : "#242933";
  const cardBorder = themedScope
    ? (themedScope.tokens?.border ?? "rgba(38, 35, 31, 0.06)")
    : isLight
      ? "rgba(38, 35, 31, 0.055)"
      : "rgba(245, 244, 240, 0.09)";
  const chipBg = isLight ? "#F8F6F2" : "#2A303B";
  const chipBorder = isLight ? "rgba(38, 35, 31, 0.07)" : "rgba(245, 244, 240, 0.10)";
  const { t } = useI18n();
  const router = useRouter();
  const updateBot = useCallback(
    async (bot: RpcInput<"bots/update">) =>
      projectId && scope !== undefined
        ? rpc("projectWorkspaces/updateBot", { projectId, bot }, await projectRequestOptions(scope))
        : rpc("bots/update", bot),
    [projectId, scope],
  );
  const { computer: computerAllowed } = useFeatureAccess();
  const scrollRef = useRef<ScrollView>(null);
  const modelY = useRef(0);
  const [bot, setBot] = useState<Bot | null>(null);
  const threadId = useRef<string | undefined>(undefined);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [savedPersonalities, setSavedPersonalities] = useState<PersonalityPreset[]>([]);
  const { duties, personality } = splitPersonalityInstructions(instructions);
  const personalityLabels = {
    balanced: t("Balanced"),
    professional: t("Professional"),
    friendly: t("Friendly"),
    concise: t("Concise"),
    creative: t("Creative"),
    teacher: t("Teacher"),
  };
  const savedPersonality = savedPersonalities.find((item) => item.instructions === personality);
  const personalityPreset = personality
    ? savedPersonality
      ? `personal:${savedPersonality.id}`
      : (SYDNEY_PERSONALITIES.find((preset) => preset.instructions === personality)?.id ?? "custom")
    : "";
  const instructionsError =
    instructions.length > BOT_INSTRUCTIONS_MAX_LENGTH
      ? t("Instructions and personality must fit within {max} characters.", {
          max: BOT_INSTRUCTIONS_MAX_LENGTH,
        })
      : null;
  const [color, setColor] = useState<string>(DEFAULT_BOT_AVATAR_DATA_URI);
  const [computerMode, setComputerMode] = useState<ComputerMode>("team");
  const [avatarSet, setAvatarSet] = useState<BotAvatarSet>("organic");
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [savedAvatars, setSavedAvatars] = useState<SavedBotAvatar[]>([]);
  const [avatarsLoading, setAvatarsLoading] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(focus === "model" || pickedModel !== undefined);
  const [modelKey, setModelKey] = useState("");
  const [thinkingLevel, setThinkingLevel] = useState("");
  const [notifyOnFinish, setNotifyOnFinish] = useState(true);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [dailyCheckIns, setDailyCheckIns] = useState(true);
  const [crossSpaceCommunication, setCrossSpaceCommunication] = useState(true);
  const [fleetManagement, setFleetManagement] = useState(true);
  const [credentials, setCredentials] = useState<MobileModelCredential[]>([]);
  const [catalog, setCatalog] = useState<MobileModel[]>([]);
  const [me, setMe] = useState<MobileMe | null>(null);
  const [modelMetaReady, setModelMetaReady] = useState(false);
  const [modelMetaError, setModelMetaError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [deviceVoiceEnabled, setDeviceVoiceEnabled] = useState(false);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState<string | undefined>();
  const savedVoiceId = useRef<string | undefined>(undefined);
  const voiceChoice = useRef(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const mounted = useRef(false);
  const [openedContext] = useState(() => ({
    generation: currentSessionGeneration(),
    apiBase: currentApiBase(),
    spaceId: selectedSpaceId(),
    selection: spaceSelectionSeq(),
  }));
  const editorCurrent = useCallback(
    () =>
      mounted.current &&
      openedContext.generation === currentSessionGeneration() &&
      openedContext.apiBase === currentApiBase() &&
      openedContext.spaceId === selectedSpaceId() &&
      openedContext.selection === spaceSelectionSeq() &&
      !isSpaceSelectionPending() &&
      (!projectId || scope === projectScopeKey()),
    [openedContext, projectId, scope],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!avatarOpen) return;
    let active = true;
    setAvatarsLoading(true);
    void loadBotAvatarLibrary()
      .then((items) => {
        if (active && editorCurrent()) setSavedAvatars(items);
      })
      .catch((error) => {
        if (active && editorCurrent())
          setAvatarError(errorText(error, t("Could not load the device avatar library")));
      })
      .finally(() => {
        if (active) setAvatarsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [avatarOpen, editorCurrent, t]);

  const crossSpaceSave = useMemo(
    () =>
      createQueuedSave<boolean>(false, {
        save: async (value) => {
          await rpc("bots/update", { botId, crossSpaceCommunication: value });
        },
        onChange: setCrossSpaceCommunication,
        onError: (err) => setError(errorText(err, t("Could not save bot"))),
      }),
    [botId, t],
  );
  const dailyCheckInsSave = useMemo(
    () =>
      createQueuedSave<boolean>(true, {
        save: async (value) => {
          await rpc("bots/update", { botId, dailyCheckIns: value });
        },
        onChange: setDailyCheckIns,
        onError: (err) => setError(errorText(err, t("Could not save bot"))),
      }),
    [botId, t],
  );

  const fleetSave = useMemo(
    () =>
      createQueuedSave<boolean>(false, {
        save: async (value) => {
          await rpc("bots/update", { botId, fleetManagement: value });
        },
        onChange: setFleetManagement,
        onError: (err) => setError(errorText(err, t("Could not save bot"))),
      }),
    [botId, t],
  );

  const notifySave = useMemo(
    () =>
      createQueuedSave<boolean>(true, {
        save: async (notifyOnFinish) => {
          const next = await updateBot({ botId, notifyOnFinish });
          threadId.current = next.threadId;
        },
        onChange: setNotifyOnFinish,
        onSaved: async (notify) => {
          if (projectId) return;
          try {
            await afterChatNotifyChange(
              currentApiBase(),
              await loadSessionToken(),
              selectedSpaceId() ?? "",
              { botId, threadId: threadId.current, notify },
            );
          } catch {
            // The server save succeeded; device reconciliation can retry later.
          }
        },
        onError: (err) => setError(errorText(err)),
      }),
    [botId, projectId, updateBot],
  );
  const nameSave = useMemo(
    () =>
      createQueuedSave<string>("", {
        save: async (name) => {
          await updateBot({ botId, name });
        },
        onChange: setName,
        onSaved: async (name) => {
          setBot((prev) => (prev ? { ...prev, name } : prev));
        },
        onError: (err) => setError(errorText(err)),
      }),
    [botId, updateBot],
  );

  useEffect(() => {
    if (!botId) return;
    setError(null);
    const load = async () =>
      projectId && scope !== undefined
        ? rpc(
            "projectWorkspaces/getBot",
            { projectId, botId, includeArchived: true },
            await projectRequestOptions(scope),
          )
        : rpc("bots/get", { botId });
    let active = true;
    void load()
      .then((next) => {
        if (!active) return;
        threadId.current = next.threadId;
        setBot(next);
        setName(next.name);
        nameSave.reset(next.name);
        notifySave.reset(next.notifyOnFinish ?? true);
        setDescription(next.description ?? "");
        setInstructions(next.instructions ?? "");
        setColor(next.color);
        setAvatarSet(resolveBotAvatarSet(next.avatarSet));
        setComputerMode(next.computerMode);
        setModelKey(
          next.modelProvider && next.modelId
            ? modelOptionKey(next.modelProvider, next.modelId)
            : "",
        );
        setThinkingLevel(next.thinkingLevel ?? "");
        setAutoSpeak(next.autoSpeak);
        setNotifyOnFinish(next.notifyOnFinish ?? true);
        setDailyCheckIns(next.dailyCheckIns ?? true);
        dailyCheckInsSave.reset(next.dailyCheckIns ?? true);
        setCrossSpaceCommunication(next.crossSpaceCommunication ?? true);
        crossSpaceSave.reset(next.crossSpaceCommunication ?? true);
        setFleetManagement(next.fleetManagement);
        fleetSave.reset(next.fleetManagement);
      })
      .catch((err) => {
        if (active) setError(errorText(err, t("Could not load bot")));
      });
    return () => {
      active = false;
    };
  }, [
    botId,
    loadAttempt,
    projectId,
    scope,
    dailyCheckInsSave,
    crossSpaceSave,
    fleetSave,
    notifySave,
    nameSave,
    t,
  ]);

  useEffect(() => {
    void Promise.all([rpc("me"), rpc("models/list"), rpc("models/credentials")])
      .then(([nextMe, nextCatalog, nextCredentials]) => {
        setMe(nextMe);
        setCatalog(nextCatalog);
        setCredentials(nextCredentials);
        setModelMetaError(null);
        setModelMetaReady(true);
      })
      .catch((err) => {
        setModelMetaReady(false);
        setModelMetaError(errorText(err, t("Could not load model settings")));
      });
  }, [t]);

  const storedModel = modelKey ? parseModelOptionKey(modelKey) : null;
  const selectedModel = storedModel
    ? {
        provider: storedModel.provider,
        modelId: resolveSelectableModelId(catalog, storedModel.provider, storedModel.modelId),
      }
    : null;
  const selectedModelKey = selectedModel
    ? modelOptionKey(selectedModel.provider, selectedModel.modelId)
    : "";

  const effectiveProvider = selectedModel?.provider ?? me?.defaultProvider ?? null;
  const effectiveModelId = selectedModel?.modelId ?? me?.defaultModel ?? null;
  const effectiveEntry =
    effectiveProvider && effectiveModelId
      ? catalog.find(
          (entry) =>
            entry.provider === effectiveProvider &&
            resolveSelectableModelId(catalog, entry.provider, entry.id) === effectiveModelId,
        )
      : undefined;
  const effectiveCredential = credentialForModel(credentials, effectiveProvider, effectiveModelId);
  const thinkingOptions = (
    effectiveCredential?.thinkingLevels ??
    effectiveEntry?.thinkingLevels ??
    []
  ).filter((level) => level !== "off");

  const modelChoices = useMemo(
    () => chatModelPickerChoices(me, catalog, credentials, selectedModelKey, t),
    [catalog, credentials, me, selectedModelKey, t],
  );

  const thinkingChoices: MenuPickerChoice[] = useMemo(
    () => [
      { key: "", label: t("Default") },
      ...thinkingOptions.map((level) => ({
        key: level,
        label: thinkingLevelLabel(level, t),
      })),
    ],
    [t, thinkingOptions],
  );

  useEffect(() => {
    if (focus === "model") setAdvancedOpen(true);
  }, [focus]);

  function selectModel(key: string) {
    if (key === selectedModelKey) return;
    setModelKey(key);
    setThinkingLevel("");
  }

  // The searchable model list hands its pick back as a one-shot route param.
  useEffect(() => {
    if (!bot || pickedModel === undefined) return;
    router.setParams({ model: undefined });
    setAdvancedOpen(true);
    selectModel(pickedModel);
  }, [bot, pickedModel]);

  function applyVoices(available: Voice[], assigned: string | undefined) {
    setVoices(available);
    savedVoiceId.current = assigned;
    setVoiceId(assigned);
    setVoiceError(null);
  }

  function failVoices() {
    setVoices([]);
    setVoiceError(t("Could not load voices"));
  }

  useFocusEffect(
    useCallback(() => {
      let current = true;
      void loadDeviceVoiceEnabled()
        .then((enabled) => {
          if (current) setDeviceVoiceEnabled(Boolean(projectId) || enabled);
        })
        .catch(() => {
          if (current) setDeviceVoiceEnabled(false);
        });
      return () => {
        current = false;
      };
    }, [projectId]),
  );

  useEffect(() => {
    if (!botId || !deviceVoiceEnabled || projectId) return;
    let current = true;
    void Promise.all([deviceVoices(), voiceForBot(botId)])
      .then(([available, assigned]) => {
        if (!current) return;
        applyVoices(available, assigned);
      })
      .catch(() => {
        if (!current) return;
        failVoices();
      });
    return () => {
      current = false;
    };
  }, [botId, deviceVoiceEnabled, projectId, t]);

  async function chooseVoice(voice: Voice) {
    if (!botId) return;
    // Picking a voice cuts off a reply in progress before the sample starts.
    stopVoicePlayback();
    const choice = ++voiceChoice.current;
    setVoiceId(voice.identifier);
    setError(null);
    try {
      await setVoiceForBot(botId, voice.identifier);
      savedVoiceId.current = voice.identifier;
    } catch {
      if (choice !== voiceChoice.current) return;
      setVoiceId(savedVoiceId.current);
      setError(t("Could not save that voice"));
      return;
    }
    if (choice !== voiceChoice.current) return;
    try {
      // Native speech loads only when a voice is previewed, as in lib/voice.
      const Speech = await import("expo-speech");
      if (choice !== voiceChoice.current) return;
      await Speech.stop();
      if (choice !== voiceChoice.current) return;
      const sampleName = name.trim();
      Speech.speak(
        sampleName ? t("Hi, I'm {name}.", { name: sampleName }) : t("Hi, this is how I'll sound."),
        { voice: voice.identifier },
      );
    } catch {
      // The choice is already saved. A sample that cannot play is not a failed save.
    }
  }

  const currentVoice = voices.find((voice) => voice.identifier === voiceId);
  const currentVoiceLabel = currentVoice ? voiceLabel(currentVoice) : t("Default");

  async function retryDeviceVoices() {
    if (!botId) return;
    try {
      const [available, assigned] = await Promise.all([deviceVoices(), voiceForBot(botId)]);
      applyVoices(available, assigned);
    } catch {
      failVoices();
    }
  }

  async function chooseAvatarPhoto() {
    if (pickingAvatar || pending || libraryBusy || !editorCurrent()) return;
    setPickingAvatar(true);
    setAvatarError(null);
    try {
      const photo = await pickBotAvatar();
      if (photo && editorCurrent()) {
        setColor(photo);
        try {
          const saved = await saveBotAvatar(photo);
          if (editorCurrent()) setSavedAvatars((old) => [saved, ...old]);
        } catch {
          if (editorCurrent())
            setAvatarError(
              t("The photo can be used now but could not be saved to the device library."),
            );
        }
      }
    } catch (error) {
      if (editorCurrent()) setAvatarError(errorText(error, t("Could not load image")));
    } finally {
      if (mounted.current) setPickingAvatar(false);
    }
  }

  function confirmRemoveAvatar(avatar: SavedBotAvatar) {
    Alert.alert(t("Remove this device avatar?"), t("Existing bot avatars will not change."), [
      { text: t("Cancel"), style: "cancel" },
      {
        text: t("Remove"),
        style: "destructive",
        onPress: () => {
          if (pickingAvatar || pending || !editorCurrent()) return;
          try {
            removeBotAvatar(avatar.id);
            setSavedAvatars((old) => old.filter((item) => item.id !== avatar.id));
          } catch (error) {
            setAvatarError(errorText(error, t("Could not remove the device avatar")));
          }
        },
      },
    ]);
  }

  async function save() {
    if (!botId || !bot || pending || pickingAvatar || libraryBusy || instructionsError) return;
    if (!editorCurrent()) {
      setError(t("The workspace changed. Close and reopen."));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const profile = { description: description.trim() };
      const selected = selectedModel;
      const input: {
        botId: string;
        description?: string;
        instructions?: string;
        expectedInstructions?: string;
        color?: string;
        avatarSet?: BotAvatarSet;
        modelProvider?: string | null;
        modelId?: string | null;
        thinkingLevel?: ThinkingLevel | null;
        autoSpeak?: boolean;
      } = { botId };
      if (profile.description !== (bot.description ?? "")) {
        input.description = profile.description;
      }
      if (instructions !== bot.instructions) {
        input.instructions = instructions;
        input.expectedInstructions = bot.instructions;
      }
      if (color !== bot.color) input.color = color;
      if (avatarSet !== resolveBotAvatarSet(bot.avatarSet)) input.avatarSet = avatarSet;
      const modelChanged =
        (selected?.provider ?? null) !== (bot.modelProvider ?? null) ||
        (selected?.modelId ?? null) !== (bot.modelId ?? null);
      const thinkingChanged = (thinkingLevel || null) !== (bot.thinkingLevel ?? null);
      if (modelChanged) {
        input.modelProvider = selected?.provider ?? null;
        input.modelId = selected?.modelId ?? null;
      }
      if (modelMetaReady && (modelChanged || thinkingChanged)) {
        input.thinkingLevel = thinkingOptions.length
          ? ((thinkingLevel || null) as ThinkingLevel | null)
          : null;
      }
      if (autoSpeak !== bot.autoSpeak) input.autoSpeak = autoSpeak;
      if (!projectId && computerMode !== bot.computerMode) {
        await rpc(
          "bots/setComputer",
          { botId, mode: computerMode },
          { timeoutMs: COMPUTER_LIFECYCLE_TIMEOUT_MS },
        );
        setBot((prev) => (prev ? { ...prev, computerMode } : prev));
      }
      // Use key presence so clearing description to "" still persists.
      if (Object.keys(input).length > 1) {
        const updated = await updateBot(input);
        // Saved edits and their history become the baseline, so a retry after a failed switch write
        // does not resend them.
        const { botId: _botId, expectedInstructions: _expected, ...saved } = input;
        setBot((prev) => (prev ? { ...prev, ...saved, ...updated } : prev));
      }
      await Promise.all([
        dailyCheckInsSave.flush(),
        crossSpaceSave.flush(),
        fleetSave.flush(),
        notifySave.flush(),
        nameSave.flush(),
      ]);
      if (!projectId || scope === projectScopeKey()) router.back();
    } catch (err) {
      setError(errorText(err, t("Could not save bot")));
    } finally {
      setPending(false);
    }
  }

  const dirty =
    bot &&
    (description.trim() !== (bot.description ?? "") ||
      instructions !== (bot.instructions ?? "") ||
      color !== bot.color ||
      avatarSet !== resolveBotAvatarSet(bot.avatarSet) ||
      computerMode !== bot.computerMode ||
      autoSpeak !== bot.autoSpeak ||
      (selectedModel?.provider ?? null) !== (bot.modelProvider ?? null) ||
      (selectedModel?.modelId ?? null) !== (bot.modelId ?? null) ||
      (thinkingLevel || null) !== (bot.thinkingLevel ?? null));

  const voiceValue = (
    <Text
      numberOfLines={1}
      style={[styles.rowValue, { color: voiceError ? tokens.destructive : tokens.foreground }]}
    >
      {voiceError ?? currentVoiceLabel}
    </Text>
  );
  const hasVoiceMenu = !voiceError && voices.length > 1;
  const voiceRowContent = (
    <View
      accessibilityLabel={hasVoiceMenu ? t("Device voice") : undefined}
      accessibilityRole={hasVoiceMenu ? "button" : undefined}
      accessibilityValue={hasVoiceMenu ? { text: currentVoiceLabel } : undefined}
      accessible={hasVoiceMenu}
      style={styles.row}
    >
      <Text style={[styles.rowLabel, { color: tokens.foreground }]}>{t("Device voice")}</Text>
      {hasVoiceMenu ? (
        <View style={styles.voiceTrigger}>
          {voiceValue}
          <NativeSymbol
            android="chevron-expand"
            color={native.tertiaryLabel}
            ios="chevron.up.chevron.down"
            size={13}
          />
        </View>
      ) : (
        voiceValue
      )}
    </View>
  );
  const voiceRow = hasVoiceMenu ? (
    <MenuPickerMenu
      choices={voices.map((voice) => ({ key: voice.identifier, label: voiceLabel(voice) }))}
      label={t("Device voice")}
      onChange={(key) => {
        const voice = voices.find((candidate) => candidate.identifier === key);
        if (voice) void chooseVoice(voice);
      }}
      value={voiceId ?? ""}
    >
      {voiceRowContent}
    </MenuPickerMenu>
  ) : (
    voiceRowContent
  );

  return (
    <>
      <Stack.Screen options={glassHeaderOptions(t("Chat settings"))} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        ref={scrollRef}
        style={[{ flex: 1, backgroundColor: screenBackground }, sideInsets]}
        contentContainerStyle={{ padding: 24 }}
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {bot ? (
          <View style={{ alignItems: "center", marginBottom: 24 }}>
            <MotionPressable
              preset="icon"
              accessibilityRole="button"
              accessibilityLabel={t("Edit avatar")}
              onPress={() => {
                setAvatarError(null);
                setAvatarOpen(true);
              }}
              style={{ padding: 4 }}
            >
              <BotAvatar
                color={color}
                avatarSet={avatarSet}
                identity={bot.id}
                size={64}
                status={bot.status}
              />
              <View
                style={{
                  position: "absolute",
                  right: 0,
                  bottom: 0,
                  padding: 5,
                  borderRadius: 12,
                  backgroundColor: cardBg,
                  borderWidth: hairline,
                  borderColor: cardBorder,
                }}
              >
                <NativeSymbol ios="pencil" android="pencil" size={12} color={tokens.foreground} />
              </View>
            </MotionPressable>
          </View>
        ) : null}
        <View style={{ alignItems: "center", gap: 4, marginTop: -16, marginBottom: -8 }}>
          <ProfileEditDialog
            label={t("Name")}
            editLabel={t("Edit name")}
            value={name}
            maxLength={BOT_NAME_MAX_LENGTH}
            large
            onCommit={async (value) => {
              if (value && botId) nameSave.update(value);
            }}
          />
        </View>
        <View style={{ marginTop: 24 }}>
          <SettingsGroup label={t("Notifications")}>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: tokens.foreground }]}>
                {t("When it finishes or needs input")}
              </Text>
              <NativeSwitch
                accessibilityLabel={t("When it finishes or needs input")}
                value={notifyOnFinish}
                onValueChange={(value) => notifySave.update(value)}
              />
            </View>
          </SettingsGroup>
        </View>
        {bot ? (
          <View style={{ marginTop: 24 }}>
            <SettingsGroup label={t("Personality")}>
              <MenuPicker
                label={t("Personality preset")}
                plain
                choices={[
                  { key: "", label: t("None") },
                  ...SYDNEY_PERSONALITIES.map((preset) => ({
                    key: preset.id,
                    label: personalityLabels[preset.id],
                  })),
                  ...savedPersonalities.map((preset) => ({
                    key: `personal:${preset.id}`,
                    label: preset.name,
                  })),
                  { key: "custom", label: t("Custom") },
                ]}
                value={personalityPreset}
                onChange={(key) => {
                  if (pending || libraryBusy || !editorCurrent()) return;
                  if (key === "custom") {
                    setLibraryOpen(true);
                    return;
                  }
                  const saved = savedPersonalities.find((item) => `personal:${item.id}` === key);
                  const preset = SYDNEY_PERSONALITIES.find((item) => item.id === key);
                  if (key !== "" && !saved && !preset) return;
                  setInstructions((current) =>
                    combinePersonalityInstructions(
                      splitPersonalityInstructions(current).duties,
                      saved?.instructions ?? preset?.instructions ?? "",
                    ),
                  );
                }}
              />
              <GrowingTextInput
                label={t("Personality")}
                value={personality}
                maxLength={BOT_INSTRUCTIONS_MAX_LENGTH}
                editable={!pending && !libraryBusy}
                onChangeText={(value) =>
                  setInstructions((current) =>
                    combinePersonalityInstructions(
                      splitPersonalityInstructions(current).duties,
                      value,
                    ),
                  )
                }
                placeholder={t("Describe this bot's personality and speaking style.")}
                inset={0}
              />
              <NativeActionButton
                label={t("Personal personality library")}
                prominence="secondary"
                disabled={pending || libraryBusy}
                onPress={() => {
                  if (!editorCurrent()) {
                    setError(t("The workspace changed. Close and reopen."));
                    return;
                  }
                  setLibraryOpen((open) => !open);
                }}
              />
              {instructions !== bot.instructions && !libraryOpen ? (
                <NativeActionButton
                  label={pending ? t("Saving…") : t("Save")}
                  disabled={
                    !name.trim() || pending || pickingAvatar || libraryBusy || !!instructionsError
                  }
                  onPress={() => void save()}
                />
              ) : null}
            </SettingsGroup>
            <View style={libraryOpen ? { marginTop: 16 } : undefined}>
              <PersonalPersonalityLibrary
                current={editorCurrent}
                disabled={pending}
                visible={libraryOpen}
                onItemsChange={setSavedPersonalities}
                selectedInstructions={personality}
                onSelect={(item) => {
                  if (!editorCurrent()) return;
                  setInstructions((current) =>
                    combinePersonalityInstructions(
                      splitPersonalityInstructions(current).duties,
                      item.instructions,
                    ),
                  );
                  setLibraryOpen(false);
                }}
                onSaved={(item, previous) =>
                  setInstructions((current) => {
                    const parts = splitPersonalityInstructions(current);
                    return previous && parts.personality === previous.instructions
                      ? combinePersonalityInstructions(parts.duties, item.instructions)
                      : current;
                  })
                }
                onRemoved={() => undefined}
                onBusyChange={setLibraryBusy}
              />
            </View>
          </View>
        ) : null}
        {botId ? (
          <BotContextCards key={botId} botId={botId} projectId={projectId} scope={scope} />
        ) : null}
        <MotionPressable
          preset="row"
          accessibilityRole="button"
          accessibilityLabel={t("Advanced")}
          accessibilityState={{ expanded: advancedOpen }}
          onPress={() => setAdvancedOpen((open) => !open)}
          style={{
            marginTop: 24,
            minHeight: 44,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={[styles.sectionHeading, { color: tokens.mutedForeground }]}>
            {t("Advanced")}
          </Text>
          <Chevron expanded={advancedOpen} />
        </MotionPressable>
        {advancedOpen ? (
          <View
            style={{ gap: 24, marginTop: 24 }}
            onLayout={(event) => {
              modelY.current = event.nativeEvent.layout.y;
              if (focus === "model" || pickedModel !== undefined)
                scrollRef.current?.scrollTo({ y: modelY.current, animated: true });
            }}
          >
            <SettingsGroup label={t("Model")}>
              <MenuPicker
                plain
                choices={modelChoices}
                label={t("Model")}
                showLabel={false}
                onChange={selectModel}
                onPress={
                  modelChoices.length > MODEL_SEARCH_THRESHOLD
                    ? () =>
                        router.push({
                          pathname: "/bot-model",
                          params: { botId, value: selectedModelKey, projectId, scope },
                        })
                    : undefined
                }
                value={selectedModelKey}
              />
              {thinkingOptions.length ? (
                <MenuPicker
                  plain
                  choices={thinkingChoices}
                  label={t("Thinking")}
                  onChange={setThinkingLevel}
                  value={thinkingLevel}
                />
              ) : null}
            </SettingsGroup>
            {modelMetaError ? (
              <Text style={{ color: tokens.mutedForeground, marginTop: 12, fontSize: 13 }}>
                {modelMetaError}
              </Text>
            ) : null}

            {!projectId && computerAllowed ? (
              <SettingsGroup label={t("Computer")}>
                <ComputerModePicker plain value={computerMode} onChange={setComputerMode} />
              </SettingsGroup>
            ) : null}
            <SettingsGroup label={t(projectId ? "Device voice" : "Voice")}>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: tokens.foreground }]}>
                  {t("Read replies aloud")}
                </Text>
                <NativeSwitch
                  accessibilityLabel={t("Read replies aloud")}
                  onValueChange={setAutoSpeak}
                  value={autoSpeak}
                />
              </View>
              {deviceVoiceEnabled ? (
                voiceError ? (
                  <MotionPressable
                    preset="row"
                    accessibilityRole="button"
                    accessibilityLabel={t("Device voice")}
                    accessibilityValue={{ text: voiceError }}
                    onPress={() => void retryDeviceVoices()}
                  >
                    {voiceRow}
                  </MotionPressable>
                ) : (
                  voiceRow
                )
              ) : null}
            </SettingsGroup>
            {!projectId ? (
              <SettingsGroup label={t("Permissions")}>
                <View style={styles.row}>
                  <Text style={[styles.rowLabel, { color: tokens.foreground }]}>
                    {t("Daily check-ins on unfinished work")}
                  </Text>
                  <NativeSwitch
                    accessibilityLabel={t("Daily check-ins on unfinished work")}
                    value={dailyCheckIns}
                    onValueChange={(value) => {
                      if (!botId) return;
                      setError(null);
                      dailyCheckInsSave.update(value);
                    }}
                  />
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowLabel, { color: tokens.foreground }]}>
                    {t("Allow cross-space bot communication")}
                  </Text>
                  <NativeSwitch
                    accessibilityLabel={t("Allow cross-space bot communication")}
                    value={crossSpaceCommunication}
                    onValueChange={(value) => {
                      if (!botId) return;
                      setError(null);
                      crossSpaceSave.update(value);
                    }}
                  />
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowLabel, { color: tokens.foreground }]}>
                    {t("Manage other bots")}
                  </Text>
                  <NativeSwitch
                    accessibilityLabel={t("Manage other bots")}
                    onValueChange={(value) => {
                      if (!botId) return;
                      setError(null);
                      fleetSave.update(value);
                    }}
                    value={fleetManagement}
                  />
                </View>
              </SettingsGroup>
            ) : null}
            <View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingEnd: 16,
                  marginBottom: 8,
                }}
              >
                <SettingsSectionHeading>{t("Instructions")}</SettingsSectionHeading>
                {!projectId &&
                bot?.instructionHistory?.length &&
                instructions === bot.instructions ? (
                  <View style={{ width: 44 }}>
                    <MenuPickerMenu
                      label={t("Instruction history")}
                      value=""
                      choices={bot.instructionHistory.map((version) => ({
                        key: version.id,
                        label: `${new Date(version.createdAt).toLocaleString()} (${version.reason})`,
                      }))}
                      onChange={(versionId) => {
                        if (pending || instructions !== bot.instructions) return;
                        const version = bot.instructionHistory?.find(
                          (item) => item.id === versionId,
                        );
                        if (version)
                          Alert.alert(t("Restore"), version.instructions, [
                            { text: t("Cancel"), style: "cancel" },
                            {
                              text: t("Restore"),
                              onPress: () => {
                                const restore = {
                                  botId: bot.id,
                                  versionId,
                                  expectedInstructions: bot.instructions,
                                };
                                void (
                                  projectId && scope !== undefined
                                    ? projectRequestOptions(scope).then((options) =>
                                        rpc(
                                          "projectWorkspaces/restoreBotInstructions",
                                          { projectId, ...restore },
                                          options,
                                        ),
                                      )
                                    : rpc("bots/restoreInstructions", restore)
                                )
                                  .then((updated) => {
                                    setBot(updated);
                                    setInstructions(updated.instructions ?? "");
                                  })
                                  .catch((err) => setError(errorText(err)));
                              },
                            },
                          ]);
                      }}
                    >
                      <View
                        accessible
                        accessibilityRole="button"
                        accessibilityLabel={t("Instruction history")}
                        style={{
                          minHeight: 44,
                          minWidth: 44,
                          alignItems: "flex-end",
                          justifyContent: "center",
                        }}
                      >
                        <NativeSymbol
                          ios="clock.arrow.circlepath"
                          android="time-outline"
                          size={18}
                          color={tokens.mutedForeground}
                        />
                      </View>
                    </MenuPickerMenu>
                  </View>
                ) : null}
              </View>
              <View
                style={{
                  borderRadius: 20,
                  borderCurve: "continuous",
                  borderWidth: hairline,
                  borderColor: cardBorder,
                  backgroundColor: cardBg,
                  shadowColor: "#26231F",
                  shadowOpacity: isLight ? 0.028 : 0.16,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 5 },
                  elevation: 1,
                  overflow: "hidden",
                }}
              >
                <GrowingTextInput
                  label={t("Instructions")}
                  maxLength={BOT_INSTRUCTIONS_MAX_LENGTH}
                  value={duties}
                  onChangeText={(value) =>
                    setInstructions((current) =>
                      combinePersonalityInstructions(
                        value,
                        splitPersonalityInstructions(current).personality,
                      ),
                    )
                  }
                  backgroundColor={cardBg}
                />
              </View>
            </View>
            <SettingsGroup label={t("How other bots see it")}>
              <GrowingTextInput
                label={t("How other bots see it")}
                value={description}
                maxLength={BOT_DESCRIPTION_MAX_LENGTH}
                onChangeText={setDescription}
                placeholder={t("What this bot is for")}
                inset={0}
              />
            </SettingsGroup>
            <GlassSurface
              shape="roundedRectangle"
              cornerRadius={20}
              style={{
                paddingHorizontal: 16,
                borderRadius: 20,
                borderCurve: "continuous",
                borderWidth: hairline,
                borderColor: cardBorder,
                shadowColor: "#26231F",
                shadowOpacity: isLight ? 0.028 : 0.16,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 5 },
                elevation: 1,
                overflow: "hidden",
              }}
              fallbackStyle={{ backgroundColor: cardBg, borderRadius: 20 }}
            >
              <MotionPressable
                preset="row"
                highlightColor={native.fillPressed}
                accessibilityRole="button"
                accessibilityLabel={t("Export")}
                style={styles.row}
                onPress={() => {
                  void (
                    projectId && scope !== undefined
                      ? projectRequestOptions(scope).then((options) =>
                          rpc("projectWorkspaces/exportBot", { projectId, botId }, options),
                        )
                      : rpc("export/bot", { botId })
                  )
                    .then((manifest) => Share.share({ message: JSON.stringify(manifest, null, 2) }))
                    .catch((err) => setError(errorText(err)));
                }}
              >
                <Text style={{ color: tokens.foreground, fontSize: 14 }}>{t("Export")}</Text>
                <NativeSymbol
                  ios="square.and.arrow.down"
                  android="download-outline"
                  size={18}
                  color={tokens.mutedForeground}
                />
              </MotionPressable>
              <MotionPressable
                preset="row"
                highlightColor={native.fillPressed}
                accessibilityRole="button"
                accessibilityLabel={t("Clear conversation")}
                style={[
                  styles.row,
                  { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: native.separator },
                ]}
                onPress={() =>
                  Alert.alert(t("Clear conversation"), undefined, [
                    { text: t("Cancel"), style: "cancel" },
                    {
                      text: t("Clear conversation"),
                      style: "destructive",
                      onPress: () => {
                        void (
                          projectId && scope !== undefined
                            ? projectRequestOptions(scope).then((options) =>
                                rpc(
                                  "projectWorkspaces/conversationAction",
                                  { projectId, botId, action: "clear", deleteMemories: false },
                                  options,
                                ),
                              )
                            : rpc("threads/clear", { botId })
                        )
                          .then(() => router.back())
                          .catch((err) => setError(errorText(err)));
                      },
                    },
                  ])
                }
              >
                <Text style={{ color: tokens.destructive, fontSize: 14 }}>
                  {t("Clear conversation")}
                </Text>
              </MotionPressable>
            </GlassSurface>
          </View>
        ) : null}
        {instructionsError ? (
          <Text accessibilityRole="alert" style={{ color: tokens.destructive, marginTop: 16 }}>
            {instructionsError}
          </Text>
        ) : null}
        {error ? (
          <View style={{ marginTop: 16, gap: 12 }}>
            <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>
              {error}
            </Text>
            {!bot ? (
              <NativeActionButton
                label={t("Try Again")}
                onPress={() => setLoadAttempt((attempt) => attempt + 1)}
              />
            ) : null}
          </View>
        ) : null}
        {dirty ? (
          <NativeActionButton
            disabled={
              !name.trim() || pending || pickingAvatar || libraryBusy || !bot || !!instructionsError
            }
            label={pending ? t("Saving…") : t("Save")}
            onPress={() => void save()}
            style={{ marginTop: 24 }}
          />
        ) : null}
      </ScrollView>
      {avatarOpen ? (
        <Modal
          visible={avatarOpen}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => {
            if (!pickingAvatar) setAvatarOpen(false);
          }}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 24, gap: 16 }}
            style={{ backgroundColor: tokens.background }}
          >
            <NativeActionButton
              label={t("Done")}
              disabled={pickingAvatar}
              onPress={() => setAvatarOpen(false)}
            />
            <NativeActionButton
              label={t("Photo library")}
              prominence="secondary"
              busy={pickingAvatar}
              disabled={pending || avatarsLoading}
              onPress={() => void chooseAvatarPhoto()}
            />
            <Text style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 17 }}>
              {t(
                "Uploaded avatars are saved on this device, available to its accounts, and do not sync automatically.",
              )}
            </Text>
            {avatarError ? (
              <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>
                {avatarError}
              </Text>
            ) : null}
            {bot && isAvatarPhoto(color) && color !== DEFAULT_BOT_AVATAR_DATA_URI ? (
              <MotionPressable
                preset="inline"
                accessibilityRole="button"
                onPress={() => setColor(DEFAULT_BOT_AVATAR_DATA_URI)}
                style={{ marginTop: 12 }}
              >
                <Text style={{ color: tokens.mutedForeground, fontSize: 15 }}>
                  {t("Remove photo")}
                </Text>
              </MotionPressable>
            ) : null}
            {(BUILT_IN_BOT_AVATARS ?? []).length > 0 ? (
              <>
                <Text style={{ color: tokens.mutedForeground, marginTop: 16, fontSize: 14 }}>
                  {t("Avatar")}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 12, paddingVertical: 8, paddingHorizontal: 4 }}
                >
                  {(BUILT_IN_BOT_AVATARS ?? []).map((item) => (
                    <MotionPressable
                      key={item.id}
                      preset="control"
                      accessibilityRole="button"
                      accessibilityLabel={item.name}
                      disabled={pickingAvatar}
                      onPress={() => {
                        if (typeof bundledBotAvatar !== "function") {
                          setColor(DEFAULT_BOT_AVATAR_DATA_URI);
                          return;
                        }
                        setPickingAvatar(true);
                        setAvatarError(null);
                        void bundledBotAvatar(item.source)
                          .then((next) => setColor(next))
                          .catch((err) => setAvatarError(errorText(err)))
                          .finally(() => setPickingAvatar(false));
                      }}
                      style={{
                        padding: 6,
                        borderRadius: 16,
                        backgroundColor: chipBg,
                        borderWidth: hairline,
                        borderColor: chipBorder,
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Image
                        source={item.source}
                        style={{ width: 44, height: 44, borderRadius: 22 }}
                      />
                      <Text style={{ color: tokens.mutedForeground, fontSize: 11 }}>
                        {item.name}
                      </Text>
                    </MotionPressable>
                  ))}
                </ScrollView>
              </>
            ) : null}
            {savedAvatars.length > 0 ? (
              <>
                <Text style={{ color: tokens.mutedForeground, fontSize: 14 }}>
                  {t("Saved avatars")}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                  {savedAvatars.map((avatar) => (
                    <View key={avatar.id} style={{ gap: 4, alignItems: "center" }}>
                      <MotionPressable
                        preset="control"
                        accessibilityRole="button"
                        accessibilityLabel={t("Select saved avatar")}
                        accessibilityState={{ selected: color === avatar.dataUrl }}
                        disabled={pickingAvatar || pending}
                        onPress={() => {
                          if (editorCurrent()) setColor(avatar.dataUrl);
                        }}
                        style={{
                          minWidth: 64,
                          minHeight: 64,
                          padding: 8,
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 16,
                          borderWidth: color === avatar.dataUrl ? 2 : 1,
                          borderColor: color === avatar.dataUrl ? tokens.primary : chipBorder,
                          backgroundColor: chipBg,
                        }}
                      >
                        <Image
                          source={{ uri: avatar.dataUrl }}
                          style={{ width: 44, height: 44, borderRadius: 22 }}
                        />
                      </MotionPressable>
                      <NativeActionButton
                        label={t("Remove saved avatar")}
                        prominence="plain"
                        disabled={pickingAvatar || pending}
                        onPress={() => confirmRemoveAvatar(avatar)}
                      />
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </ScrollView>
        </Modal>
      ) : null}
    </>
  );
}

function SettingsSectionHeading({ children }: { children: string }) {
  const tokens = useMobileTokens();
  return (
    <Text
      accessibilityRole="header"
      style={[styles.sectionHeading, { color: tokens.mutedForeground }]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  sectionHeading: {
    fontSize: 12,
    fontWeight: "500",
    flexShrink: 1,
  },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowLabel: { fontSize: 14, flex: 1 },
  voiceTrigger: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowValue: { fontSize: 14, flexShrink: 1, textAlign: "right" },
});

function SettingsGroup({ label, children }: { label: string; children: ReactNode }) {
  const tokens = useMobileTokens();
  const scope = useScopedTheme();
  const isLight = scope ? scope.appearance === "light" : isLightPalette(tokens);
  const hairline = StyleSheet.hairlineWidth ?? 0.5;
  const cardBg = scope ? (scope.tokens?.card ?? "#FFFEFC") : isLight ? "#FFFEFC" : "#242933";
  const cardBorder = scope
    ? (scope.tokens?.border ?? "rgba(38, 35, 31, 0.06)")
    : isLight
      ? "rgba(38, 35, 31, 0.055)"
      : "rgba(245, 244, 240, 0.09)";
  return (
    <View style={{ gap: 8 }}>
      <SettingsSectionHeading>{label}</SettingsSectionHeading>
      <GlassSurface
        shape="roundedRectangle"
        cornerRadius={20}
        style={{
          padding: 16,
          gap: 12,
          borderRadius: 20,
          borderCurve: "continuous",
          borderWidth: hairline,
          borderColor: cardBorder,
          shadowColor: "#26231F",
          shadowOpacity: isLight ? 0.028 : 0.16,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 5 },
          elevation: 1,
        }}
        fallbackStyle={{ backgroundColor: cardBg, borderRadius: 20 }}
      >
        {children}
      </GlassSurface>
    </View>
  );
}
