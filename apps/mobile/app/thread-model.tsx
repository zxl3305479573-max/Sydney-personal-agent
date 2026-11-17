import type { ChatModelChoice } from "@rakazo/core";
import { modelOptionKey, parseModelOptionKey, resolveSelectableModelId } from "@rakazo/core";
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Alert, Pressable, Text } from "react-native";
import { ModelPickerList } from "../components/model-picker-list";
import { rpc } from "../lib/api";
import { chatModelPickerChoices } from "../lib/chat-model";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { errorText } from "../lib/user-error";

export default function ThreadModelScreen() {
  const { botId = "" } = useLocalSearchParams<{ botId?: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const [choices, setChoices] = useState<ChatModelChoice[] | null>(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("Add model")}
          onPress={() => router.push("/models")}
        >
          <Text style={{ color: tokens.foreground, fontSize: 16 }}>{t("Add model")}</Text>
        </Pressable>
      ),
    });
  }, [navigation, router, t, tokens.foreground]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setChoices(null);
      setError(null);
      void Promise.all([
        rpc("bots/get", { botId }),
        rpc("me"),
        rpc("models/list"),
        rpc("models/credentials"),
      ])
        .then(([bot, me, catalog, credentials]) => {
          if (!active) return;
          const key =
            bot.modelProvider && bot.modelId
              ? modelOptionKey(
                  bot.modelProvider,
                  resolveSelectableModelId(catalog, bot.modelProvider, bot.modelId),
                )
              : "";
          setSelectedKey(key);
          setChoices(chatModelPickerChoices(me, catalog, credentials, key, t));
        })
        .catch((cause: unknown) => {
          if (active) setError(errorText(cause, t("Could not load model settings")));
        });
      return () => {
        active = false;
      };
    }, [botId, t]),
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
    try {
      await rpc("bots/update", {
        botId,
        modelProvider: selected?.provider ?? null,
        modelId: selected?.modelId ?? null,
        thinkingLevel: null,
      });
      router.back();
    } catch (cause) {
      Alert.alert(t("Could not save changes"), errorText(cause, t("Try again.")));
    } finally {
      saving.current = false;
    }
  }

  return (
    <ModelPickerList
      choices={choices}
      selectedKey={selectedKey}
      error={error}
      onSelect={(choice) => void select(choice)}
    />
  );
}
