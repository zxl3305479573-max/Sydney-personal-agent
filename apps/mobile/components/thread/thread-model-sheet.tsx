import type { ChatModelChoice } from "@rakazo/core";
import { modelOptionKey, parseModelOptionKey, resolveSelectableModelId } from "@rakazo/core";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { rpc } from "../../lib/api";
import { mobileTokens } from "../../lib/appearance";
import { chatModelPickerChoices } from "../../lib/chat-model";
import { useI18n } from "../../lib/i18n";
import { errorText } from "../../lib/user-error";

export function ThreadModelSheet({
  botId,
  onClose,
  onAdd,
  onChanged,
}: {
  botId: string;
  onClose: () => void;
  onAdd: () => void;
  onChanged: (modelId: string | null) => void;
}) {
  const { t } = useI18n();
  const tokens = mobileTokens();
  const [choices, setChoices] = useState<ChatModelChoice[] | null>(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);
  const saving = useRef(false);
  const adding = useRef(false);

  useEffect(() => {
    let active = true;
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
  }, [botId, t]);

  async function select(choice: ChatModelChoice) {
    if (saving.current) return;
    if (choice.key === selectedKey) {
      onClose();
      return;
    }
    const selected = choice.key ? parseModelOptionKey(choice.key) : null;
    if (choice.key && !selected) return;
    saving.current = true;
    try {
      await rpc("bots/update", {
        botId,
        modelProvider: selected?.provider ?? null,
        modelId: selected?.modelId ?? null,
        thinkingLevel: null,
      });
      onChanged(selected?.modelId ?? null);
      onClose();
    } catch (cause) {
      Alert.alert(t("Could not save changes"), errorText(cause, t("Try again.")));
    } finally {
      saving.current = false;
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={() => {
        if (adding.current) onAdd();
      }}
    >
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: tokens.overlay }}>
        <Pressable accessibilityLabel={t("Cancel")} onPress={onClose} style={{ flex: 1 }} />
        <View
          accessibilityViewIsModal
          style={{
            maxHeight: "70%",
            backgroundColor: tokens.popover,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 20,
          }}
        >
          <Text
            style={{ color: tokens.popoverForeground, fontSize: 18, fontWeight: "600", marginBottom: 12 }}
          >
            {t("Model")}
          </Text>
          {error ? (
            <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>
              {error}
            </Text>
          ) : null}
          {!choices && !error ? <ActivityIndicator /> : null}
          <ScrollView>
            {choices?.map((choice) => (
              <Pressable
                key={choice.key}
                accessibilityRole="button"
                accessibilityState={{ selected: choice.key === selectedKey }}
                onPress={() => void select(choice)}
                style={{ minHeight: 52, justifyContent: "center", paddingVertical: 8 }}
              >
                <Text style={{ color: tokens.popoverForeground, fontSize: 16 }}>
                  {choice.title ?? choice.label}{choice.key === selectedKey ? " ✓" : ""}
                </Text>
                {choice.detail ? <Text style={{ color: tokens.mutedForeground }}>{choice.detail}</Text> : null}
              </Pressable>
            ))}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (adding.current) return;
              adding.current = true;
              setVisible(false);
              if (Platform.OS !== "ios") onAdd();
            }}
            style={{ paddingVertical: 16 }}
          >
            <Text style={{ color: tokens.popoverForeground, fontSize: 16 }}>＋ {t("Add model")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
