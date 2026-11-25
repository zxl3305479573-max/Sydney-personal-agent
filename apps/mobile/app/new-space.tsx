import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { GlassSurface } from "../components/glass-surface";
import { NativeActionButton } from "../components/native-action-button";
import { cancelHeaderOptions } from "../components/sheet-header";
import { rpc, selectSpace } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { native, useMobileTokens } from "../lib/native";
import { useScreenBackground } from "../lib/scoped-theme-context";
import { useSideInsets } from "../lib/side-insets";
import { errorText } from "../lib/user-error";

export default function NewSpace() {
  const sideInsets = useSideInsets();
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const screenBackground = useScreenBackground(tokens.background);
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bg = tokens?.background;
  const isLight =
    typeof bg === "string" && /^#[\da-f]{6}/i.test(bg)
      ? Number.parseInt(bg.slice(1, 3), 16) > 128
      : true;
  const hairline = StyleSheet.hairlineWidth ?? 0.5;
  const porcelainSurface = isLight ? "#FFFEFC" : "#242933";
  const porcelainBorder =
    tokens?.border ?? (isLight ? "rgba(38, 35, 31, 0.055)" : "rgba(245, 244, 240, 0.09)");
  const creamSurface = isLight ? "#F8F6F2" : "#2A303B";
  const creamBorder = isLight ? "rgba(38, 35, 31, 0.07)" : "rgba(245, 244, 240, 0.10)";

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
        style={[{ flex: 1, backgroundColor: screenBackground }, sideInsets]}
        contentContainerStyle={{ padding: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            backgroundColor: porcelainSurface,
            borderRadius: 20,
            borderWidth: hairline,
            borderColor: porcelainBorder,
            padding: 18,
            shadowColor: "#26231F",
            shadowOpacity: isLight ? 0.028 : 0.16,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 5 },
            elevation: 1,
          }}
        >
          <Text style={{ color: tokens.mutedForeground, fontSize: 14, fontWeight: "500" }}>
            {t("Name")}
          </Text>
          <GlassSurface
            shape="roundedRectangle"
            cornerRadius={16}
            style={{ marginTop: 10, borderRadius: 16 }}
            fallbackStyle={{
              backgroundColor: creamSurface,
              borderWidth: hairline,
              borderColor: creamBorder,
            }}
          >
            <TextInput
              accessibilityLabel={t("Name")}
              autoFocus
              value={name}
              maxLength={60}
              onChangeText={setName}
              onSubmitEditing={() => void create()}
              placeholder={t("Customer support")}
              placeholderTextColor={tokens.mutedForeground}
              returnKeyType="done"
              style={{
                paddingHorizontal: 15,
                paddingVertical: 13,
                color: tokens.foreground,
                fontSize: 16,
              }}
            />
          </GlassSurface>
          {error ? (
            <Text accessibilityRole="alert" style={{ color: tokens.destructive, marginTop: 14 }}>
              {error}
            </Text>
          ) : null}
          <NativeActionButton
            disabled={!name.trim() || pending}
            label={pending ? t("Creating…") : t("Create space")}
            onPress={() => void create()}
            style={{ marginTop: 18, borderRadius: 999 }}
          />
        </View>
      </ScrollView>
    </>
  );
}
