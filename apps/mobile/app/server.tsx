import type { ModelHeaderRow } from "@rakazo/contracts";
import { serverHeadersFromRows } from "@rakazo/contracts";
import type { ColorTokens } from "@rakazo/ui-tokens";
import { Stack, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GlassSurface } from "../components/glass-surface";
import { HeaderRowsEditor } from "../components/header-rows-editor";
import { NativeActionButton } from "../components/native-action-button";
import { cancelHeaderOptions, trailingHeaderOptions } from "../components/sheet-header";
import {
  apiBaseWarning,
  currentApiBase,
  defaultApiBase,
  normalizeApiBase,
  probeApiBase,
  resetApiBase,
  saveApiBase,
  usesCustomApiBase,
} from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { useScopedTheme, useScreenBackground } from "../lib/scoped-theme-context";
import { serverHeaders } from "../lib/server-headers";
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

export default function ServerScreen() {
  const sideInsets = useSideInsets();
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const screenBackground = useScreenBackground(tokens.background);
  const router = useRouter();
  const current = currentApiBase();
  const [draft, setDraft] = useState(current);
  const [headerRows, setHeaderRows] = useState<ModelHeaderRow[]>(() =>
    Object.entries(serverHeaders(current)).map(([name, value]) => ({ name, value })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const active = useRef(true);
  const saving = useRef(false);

  useEffect(() => {
    return () => {
      active.current = false;
    };
  }, []);

  function close() {
    if (!active.current) return;
    active.current = false;
    if (router.canGoBack()) router.back();
    else router.replace("/sign-in");
  }

  const parsedDraft = normalizeApiBase(draft);
  const warning = parsedDraft.ok ? apiBaseWarning(parsedDraft.url) : null;
  const mayChangeServer =
    usesCustomApiBase(current) || (parsedDraft.ok && parsedDraft.url !== current);

  async function save() {
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setError(null);
    try {
      let headers: Record<string, string>;
      try {
        headers = serverHeadersFromRows(headerRows);
      } catch (headerError) {
        setError(errorText(headerError));
        return;
      }
      const probed = await probeApiBase(draft, fetch, headers);
      if (!active.current) return;
      if (!probed.ok) {
        setError(probed.error);
        return;
      }
      const saved = await saveApiBase(probed.url, headers);
      if (!saved.ok) {
        setError(saved.error);
        return;
      }
      close();
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  async function restoreDefault() {
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setError(null);
    try {
      const saved = await resetApiBase();
      if (!active.current) return;
      if (!saved.ok) {
        setError(saved.error);
        return;
      }
      close();
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  const scope = useScopedTheme();
  const isLight = scope ? scope.appearance === "light" : isLightPalette(tokens);
  const hairline = StyleSheet?.hairlineWidth ?? 0.5;
  const cardBg = scope ? (scope.tokens?.card ?? "#FFFEFC") : isLight ? "#FFFEFC" : "#242933";
  const cardBorder = scope
    ? (scope.tokens?.border ?? "rgba(38, 35, 31, 0.06)")
    : isLight
      ? "rgba(38, 35, 31, 0.06)"
      : "rgba(245, 244, 240, 0.09)";
  const chipBg = isLight ? "#F8F6F2" : "#2A303B";
  const chipBorder = isLight ? "rgba(38, 35, 31, 0.07)" : "rgba(245, 244, 240, 0.10)";

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: screenBackground }}>
      <Stack.Screen
        options={{
          title: t("Server"),
          ...cancelHeaderOptions(t("Cancel"), close),
          ...trailingHeaderOptions(
            pending ? t("Checking…") : t("Save"),
            () => void save(),
            pending,
          ),
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={sideInsets}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <GlassSurface
            shape="roundedRectangle"
            cornerRadius={18}
            style={{
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
              testID="server-address"
              accessibilityLabel={t("Server")}
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect={false}
              keyboardType="url"
              onChangeText={(value) => {
                setDraft(value);
                setError(null);
              }}
              onSubmitEditing={() => void save()}
              placeholder={defaultApiBase()}
              placeholderTextColor={tokens.mutedForeground}
              returnKeyType="go"
              style={{
                borderRadius: 18,
                paddingHorizontal: 16,
                paddingVertical: 15,
                minHeight: 50,
                color: tokens.foreground,
                fontSize: 17,
              }}
              textContentType="URL"
              value={draft}
            />
          </GlassSurface>
          {warning ? (
            <View
              style={{
                marginTop: 12,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 14,
                backgroundColor: chipBg,
                borderWidth: hairline,
                borderColor: chipBorder,
              }}
            >
              <Text style={{ color: tokens.mutedForeground, fontSize: 13, lineHeight: 18 }}>
                {warning}
              </Text>
            </View>
          ) : null}
          {mayChangeServer ? (
            <View
              style={{
                marginTop: 12,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 14,
                backgroundColor: chipBg,
                borderWidth: hairline,
                borderColor: chipBorder,
              }}
            >
              <Text
                accessibilityRole="alert"
                style={{ color: tokens.warning, fontSize: 13, lineHeight: 18 }}
              >
                {t(
                  "Changing servers signs you out and may delete unsent messages and attachments. Send or save them first.",
                )}
              </Text>
            </View>
          ) : null}
          <HeaderRowsEditor
            rows={headerRows}
            onChange={(rows) => {
              setHeaderRows(rows);
              setError(null);
            }}
            disabled={pending}
          />
          {error ? (
            <View
              style={{
                marginTop: 12,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 14,
                backgroundColor: cardBg,
                borderWidth: hairline,
                borderColor: cardBorder,
              }}
            >
              <Text accessibilityRole="alert" style={{ color: tokens.destructive, fontSize: 14 }}>
                {error}
              </Text>
            </View>
          ) : null}
          {usesCustomApiBase(current) || draft.trim() !== current ? (
            <NativeActionButton
              disabled={pending}
              label={t("Use default server")}
              onPress={() => void restoreDefault()}
              prominence="plain"
              style={{ marginTop: 28, alignSelf: "center" }}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
