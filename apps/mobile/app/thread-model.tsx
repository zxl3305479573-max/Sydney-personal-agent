import type { ChatModelChoice } from "@rakazo/core";
import { parseModelOptionKey } from "@rakazo/core";
import { fetchFresh, writeSaved } from "@rakazo/core/query";
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";
import { ModelPickerList } from "../components/model-picker-list";
import { captureApiRequestContext, rpc, selectedSpaceId, spaceSelectionSeq } from "../lib/api";
import { chatModelPickerChoices, chatModelSelectionKey } from "../lib/chat-model";
import { useI18n } from "../lib/i18n";
import { queryClient, rpcQuery } from "../lib/query";
import { errorText } from "../lib/user-error";

export default function ThreadModelScreen() {
  const { botId = "" } = useLocalSearchParams<{ botId?: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { t } = useI18n();
  const [choices, setChoices] = useState<ChatModelChoice[] | null>(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const saving = useRef(false);
  const spaceId = selectedSpaceId() ?? undefined;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setChoices(null);
      setError(null);
      const reuse = { reuse: true };
      void Promise.all([
        fetchFresh(queryClient, rpcQuery("bots/get", { botId }, spaceId), reuse),
        fetchFresh(queryClient, rpcQuery("me", undefined, spaceId), reuse),
        fetchFresh(queryClient, rpcQuery("models/list", undefined, spaceId), reuse),
        fetchFresh(queryClient, rpcQuery("models/credentials", undefined, spaceId), reuse),
      ])
        .then(([bot, me, catalog, credentials]) => {
          if (!active) return;
          const key = chatModelSelectionKey(catalog, bot);
          setSelectedKey(key);
          setChoices(chatModelPickerChoices(me, catalog, credentials, key, t));
        })
        .catch((cause: unknown) => {
          if (active) setError(errorText(cause, t("Could not load model settings")));
        });
      return () => {
        active = false;
      };
    }, [botId, spaceId, t]),
  );

  async function select(choice: ChatModelChoice) {
    if (saving.current) return;
    if (choice.key === selectedKey) {
      router.back();
      return;
    }
    const selected = choice.key ? parseModelOptionKey(choice.key) : null;
    if (choice.key && !selected) {
      Alert.alert(t("Could not load model settings"));
      return;
    }
    saving.current = true;
    setSavingKey(choice.key);
    const botQuery = rpcQuery("bots/get", { botId }, spaceId);
    const selection = spaceSelectionSeq();
    try {
      const requestContext = await captureApiRequestContext(spaceId);
      if (selection !== spaceSelectionSeq() || spaceId !== (selectedSpaceId() ?? undefined))
        throw new Error(t("Space changed. Please try again."));
      const saved = await rpc(
        "bots/update",
        {
          botId,
          modelProvider: selected?.provider ?? null,
          modelId: selected?.modelId ?? null,
          thinkingLevel: null,
        },
        { requestContext },
      );
      await writeSaved(queryClient, botQuery.queryKey, () => saved);
      if (navigation.isFocused()) router.back();
    } catch (cause) {
      if (navigation.isFocused())
        Alert.alert(t("Could not save changes"), errorText(cause, t("Try again.")));
    } finally {
      saving.current = false;
      setSavingKey(null);
    }
  }

  return (
    <ModelPickerList
      choices={choices}
      selectedKey={selectedKey}
      error={error}
      savingKey={savingKey}
      onSelect={(choice) => void select(choice)}
    />
  );
}
