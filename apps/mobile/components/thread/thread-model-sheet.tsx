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
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { rpc } from "../../lib/api";
import { mobileTokens } from "../../lib/appearance";
import { chatModelPickerChoices } from "../../lib/chat-model";
import { useI18n } from "../../lib/i18n";
import { errorText } from "../../lib/user-error";
import { NativeSymbol } from "../native-symbol";
import { Checkmark } from "../row-accessories";

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
  const insets = useSafeAreaInsets();
  const [choices, setChoices] = useState<ChatModelChoice[] | null>(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
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
    setSavingKey(choice.key);
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
      setSavingKey(null);
    }
  }

  const busy = savingKey !== null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
      onDismiss={() => {
        if (adding.current) onAdd();
      }}
    >
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: tokens.overlay }}>
        <Pressable
          accessibilityLabel={t("Cancel")}
          disabled={busy}
          onPress={onClose}
          style={{ flex: 1 }}
        />
        <View
          accessibilityViewIsModal
          style={{
            maxHeight: "75%",
            backgroundColor: tokens.popover,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingTop: 10,
            paddingHorizontal: 20,
            paddingBottom: Math.max(insets.bottom, 20),
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
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <Text style={{ color: tokens.popoverForeground, fontSize: 19, fontWeight: "600" }}>
              {t("Model")}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("Close")}
              disabled={busy}
              onPress={onClose}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: tokens.muted,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <NativeSymbol
                ios="xmark"
                android="close"
                size={16}
                color={tokens.popoverForeground}
              />
            </Pressable>
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={{ color: tokens.destructive, marginBottom: 8 }}>
              {error}
            </Text>
          ) : null}
          {!choices && !error ? (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <ActivityIndicator />
            </View>
          ) : null}
          <ScrollView style={{ flexShrink: 1 }}>
            {choices?.map((choice, index) => {
              const isSelected = choice.key === selectedKey;
              const isSaving = savingKey === choice.key;
              return (
                <Pressable
                  key={choice.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected, disabled: busy }}
                  disabled={busy}
                  onPress={() => void select(choice)}
                  style={({ pressed }) => ({
                    minHeight: 54,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 10,
                    borderBottomWidth: index < choices.length - 1 ? StyleSheet.hairlineWidth : 0,
                    borderBottomColor: tokens.border,
                    opacity: busy && !isSaving ? 0.55 : pressed ? 0.7 : 1,
                  })}
                >
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: tokens.popoverForeground,
                        fontSize: 16,
                        fontWeight: isSelected ? "600" : "400",
                      }}
                    >
                      {choice.title ?? choice.label}
                    </Text>
                    {choice.detail ? (
                      <Text
                        numberOfLines={1}
                        style={{ color: tokens.mutedForeground, fontSize: 13 }}
                      >
                        {choice.detail}
                      </Text>
                    ) : null}
                  </View>
                  {isSaving ? <ActivityIndicator /> : isSelected ? <Checkmark /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
          <View
            style={{
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: tokens.border,
              marginTop: 8,
              paddingTop: 10,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("Add model")}
              disabled={busy}
              onPress={() => {
                if (adding.current || busy) return;
                adding.current = true;
                setVisible(false);
                if (Platform.OS !== "ios") onAdd();
              }}
              style={({ pressed }) => ({
                minHeight: 46,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                opacity: busy ? 0.5 : pressed ? 0.7 : 1,
              })}
            >
              <NativeSymbol
                ios="plus.circle"
                android="add-circle-outline"
                size={19}
                color={tokens.primary ?? tokens.popoverForeground}
              />
              <Text
                style={{
                  color: tokens.primary ?? tokens.popoverForeground,
                  fontSize: 16,
                  fontWeight: "500",
                }}
              >
                {t("Add model")}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
