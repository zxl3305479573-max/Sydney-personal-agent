import { GROUP_MEMBER_MAX, GROUP_MEMBER_MIN, GROUP_NAME_MAX_LENGTH } from "@rakazo/contracts";
import type { ColorTokens } from "@rakazo/ui-tokens";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { BotMemberPicker } from "../components/bot-member-picker";
import { GlassSurface } from "../components/glass-surface";
import { glassHeaderOptions } from "../components/glass-title";
import { NativeActionButton } from "../components/native-action-button";
import type { MobileBot, MobileGroup } from "../lib/api";
import { rpc } from "../lib/api";
import { notifyArchivedChatsChanged } from "../lib/archived-chats";
import { confirmDeleteGroup } from "../lib/bot-lifecycle";
import { useI18n } from "../lib/i18n";
import { native, useMobileTokens } from "../lib/native";
import { projectRequestOptions, projectScopeKey } from "../lib/project-scope";
import { useScopedTheme, useScreenBackground } from "../lib/scoped-theme-context";
import { useSideInsets } from "../lib/side-insets";
import { errorText } from "../lib/user-error";

function isLightPalette(tokens?: Partial<ColorTokens> | null): boolean {
  const bg = tokens?.background;
  if (typeof bg === "string" && bg.startsWith("#") && bg.length >= 7) {
    const red = Number.parseInt(bg.slice(1, 3), 16);
    if (!Number.isNaN(red)) return red >= 128;
  }
  return true;
}

export default function GroupSettingsScreen() {
  const sideInsets = useSideInsets();
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const screenBackground = useScreenBackground(tokens.background);
  const router = useRouter();
  const { groupId, projectId, scope } = useLocalSearchParams<{
    groupId: string;
    projectId?: string;
    scope?: string;
  }>();
  const isProject = Boolean(projectId);
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
      };
    }, []),
  );
  const routeKey = JSON.stringify([projectId, groupId, scope]);
  const activeKey = useRef(routeKey);
  activeKey.current = routeKey;
  const currentRef = useRef<() => boolean>(() => true);
  currentRef.current = () =>
    !isProject ||
    (focused.current && activeKey.current === routeKey && scope === projectScopeKey());
  const [group, setGroup] = useState<MobileGroup | null>(null);
  const [bots, setBots] = useState<MobileBot[]>([]);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    let current = true;
    const request = async () => {
      const options = isProject ? await projectRequestOptions(scope ?? "") : undefined;
      if (!current || !currentRef.current())
        throw new Error(t("The project changed. Reopen the project and try again."));
      return options;
    };
    void (async () => {
      const options = await request();
      if (isProject) {
        const conversations = await rpc(
          "projectWorkspaces/conversations",
          { projectId: projectId!, archived: false },
          options,
        );
        return [
          conversations.groups.find((row) => row.id === groupId) ?? null,
          conversations.bots,
        ] as const;
      }
      const [groups, nextBots] = await Promise.all([rpc("groups/list"), rpc("bots/list")]);
      return [groups.find((row) => row.id === groupId) ?? null, nextBots] as const;
    })()
      .then(([nextGroup, nextBots]) => {
        if (!current || !currentRef.current()) return;
        if (!nextGroup) throw new Error(t("Group not found"));
        setGroup(nextGroup);
        setName(nextGroup.name);
        setSelected(nextGroup.members.map((member) => member.botId));
        setBots(nextBots.filter((bot) => !bot.archivedAt));
      })
      .catch((err) => {
        if (current && currentRef.current()) setError(errorText(err, t("Could not load group")));
      });
    return () => {
      current = false;
    };
  }, [groupId, isProject, projectId, scope, t]);

  async function save() {
    if (!groupId || !group || pending) return;
    setPending(true);
    setError(null);
    try {
      if (!currentRef.current())
        throw new Error(t("The project changed. Reopen the project and try again."));
      const input: { groupId: string; name?: string; botIds?: string[] } = { groupId };
      if (name.trim() !== group.name) input.name = name.trim();
      const memberIds = group.members.map((member) => member.botId).join(",");
      if (selected.join(",") !== memberIds) input.botIds = selected;
      if (input.name || input.botIds) {
        if (isProject) {
          const options = await projectRequestOptions(scope ?? "");
          if (!currentRef.current())
            throw new Error(t("The project changed. Reopen the project and try again."));
          await rpc(
            "projectWorkspaces/updateGroup",
            { projectId: projectId!, group: input },
            options,
          );
        } else await rpc("groups/update", input);
      }
      if (currentRef.current()) router.back();
    } catch (err) {
      setError(errorText(err, t("Could not save group")));
    } finally {
      setPending(false);
    }
  }

  function remove() {
    if (!groupId || !group) return;
    const current = currentRef.current;
    const scoped = isProject
      ? {
          current,
          remove: async () => {
            if (!current())
              throw new Error(t("The project changed. Reopen the project and try again."));
            const options = await projectRequestOptions(scope ?? "");
            if (!current())
              throw new Error(t("The project changed. Reopen the project and try again."));
            await rpc(
              "projectWorkspaces/conversationAction",
              {
                projectId: projectId!,
                groupId,
                action: "remove",
                deleteMemories: false,
              },
              options,
            );
          },
        }
      : undefined;
    confirmDeleteGroup(
      { id: groupId, name: group.name },
      () => {
        notifyArchivedChatsChanged();
        if (current()) {
          if (isProject)
            router.dismissTo({
              pathname: "/projects/[workspaceId]",
              params: { workspaceId: projectId!, scope },
            });
          else router.replace("/");
        }
      },
      scoped,
    );
  }

  const themedScope = useScopedTheme();
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
      ? "rgba(38, 35, 31, 0.06)"
      : "rgba(245, 244, 240, 0.09)";

  return (
    <>
      <Stack.Screen options={glassHeaderOptions(t("Group settings"))} />
      <ScrollView
        style={[{ flex: 1, backgroundColor: screenBackground }, sideInsets]}
        contentContainerStyle={{ padding: 20, paddingBottom: 36 }}
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={{ color: tokens.mutedForeground, fontSize: 14, paddingStart: 4 }}>
          {t("Name")}
        </Text>
        <GlassSurface
          shape="roundedRectangle"
          cornerRadius={18}
          style={{
            marginTop: 8,
            borderRadius: 18,
            borderCurve: "continuous",
            borderWidth: hairline,
            borderColor: cardBorder,
            shadowColor: "#26231F",
            shadowOpacity: isLight ? 0.028 : 0.16,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 5 },
            elevation: 1,
          }}
          fallbackStyle={{ backgroundColor: cardBg, borderRadius: 18 }}
        >
          <TextInput
            accessibilityLabel={t("Group name")}
            value={name}
            onChangeText={setName}
            maxLength={GROUP_NAME_MAX_LENGTH}
            placeholder={t("Group name")}
            placeholderTextColor={tokens.mutedForeground}
            returnKeyType="done"
            style={{
              minHeight: 50,
              paddingHorizontal: 16,
              paddingVertical: 14,
              color: tokens.foreground,
              fontSize: 17,
            }}
          />
        </GlassSurface>
        {group ? (
          <BotMemberPicker
            key={group.id}
            bots={bots}
            selected={selected}
            onChange={setSelected}
            onOpenBot={(bot) =>
              router.push({
                pathname: "/bot-profile",
                params: {
                  botId: bot.id,
                  name: bot.name,
                  ...(isProject ? { projectId, scope } : {}),
                },
              })
            }
            disabled={pending}
          />
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={{ color: tokens.destructive, marginTop: 12 }}>
            {error}
          </Text>
        ) : null}
        <NativeActionButton
          disabled={
            !name.trim() ||
            selected.length < GROUP_MEMBER_MIN ||
            selected.length > GROUP_MEMBER_MAX ||
            pending
          }
          label={pending ? t("Saving…") : t("Save")}
          onPress={() => void save()}
          style={{ marginTop: 24 }}
        />
        <NativeActionButton
          label={t("Delete group")}
          onPress={remove}
          prominence="destructive"
          style={{ marginTop: 16 }}
        />
      </ScrollView>
    </>
  );
}
