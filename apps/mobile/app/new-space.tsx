import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Text, TextInput } from "react-native";
import { GlassSurface } from "../components/glass-surface";
import { NativeActionButton } from "../components/native-action-button";
import { cancelHeaderOptions } from "../components/sheet-header";
import { rpc, selectSpace } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { native, useMobileTokens } from "../lib/native";
import { useSideInsets } from "../lib/side-insets";
import { errorText } from "../lib/user-error";

export default function NewSpace() {
  const sideInsets = useSideInsets();
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    try {
      const space = await rpc("spaces/create", { name: trimmed });
      if (!(await selectSpace(space.id))) {
        Alert.alert(t("Space created"), t("It could not be opened. Try again from the sidebar."));
        router.dismissAll();
        router.replace("/");
        return;
      }
      router.dismissAll();
      router.replace("/");
    } catch (reason) {
      setError(errorText(reason, t("Could not create space")));
      setPending(false);
    }
  }

  return (
    <>
      <Stack.Screen options={cancelHeaderOptions(t("Cancel"), () => router.back())} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={[{ flex: 1, backgroundColor: tokens.background }, sideInsets]}
        contentContainerStyle={{ padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ color: tokens.mutedForeground, fontSize: 14 }}>{t("Name")}</Text>
        <GlassSurface
          shape="roundedRectangle"
          cornerRadius={11}
          style={{ marginTop: 8, borderRadius: 11 }}
          fallbackStyle={{ backgroundColor: native.fill }}
        >
          <TextInput
            autoFocus
            value={name}
            maxLength={60}
            onChangeText={setName}
            onSubmitEditing={() => void create()}
            placeholder={t("Customer support")}
            placeholderTextColor={tokens.mutedForeground}
            returnKeyType="done"
            style={{ padding: 14, color: tokens.foreground, fontSize: 16 }}
          />
        </GlassSurface>
        {error ? <Text style={{ color: tokens.destructive, marginTop: 14 }}>{error}</Text> : null}
        <NativeActionButton
          disabled={!name.trim() || pending}
          label={pending ? t("Creating…") : t("Create space")}
          onPress={() => void create()}
          style={{ marginTop: 20 }}
        />
      </ScrollView>
    </>
  );
}
