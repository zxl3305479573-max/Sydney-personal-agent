import type { LoginFieldInput } from "@rakazo/contracts";
import { normalizeOneTimeCode } from "@rakazo/contracts";
import { isSecretAskBlock } from "@rakazo/core";
import { fontWeight, typeScale } from "@rakazo/ui-tokens";
import { useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type { MobileMessage } from "../../lib/api";
import { plainAskTitle } from "../../lib/ask-title";
import { useI18n } from "../../lib/i18n";
import { useMobileTokens } from "../../lib/native";
import { secretDestinationLabel, siteHost } from "../../lib/secret-destination";
import { secretFieldTraits } from "../../lib/secret-field-traits";
import { errorText } from "../../lib/user-error";
import { GlassSurface } from "../glass-surface";
import { NativeActionButton } from "../native-action-button";
import { SecretAskSheet } from "../secret-ask-sheet";
import type { MessageActionProps } from "./message-bubble";

export function AskBlock({
  ask,
  canAnswer,
  canDismiss,
  onAnswer,
  onDismiss,
  actionProps,
}: {
  ask: Extract<MobileMessage["blocks"][number], { kind: "ask" }>;
  canAnswer: boolean;
  canDismiss: boolean;
  onAnswer: (
    answer: string,
    fields?: readonly LoginFieldInput[],
    remember?: false,
  ) => Promise<void>;
  /** Turns down a secret request without a value. */
  onDismiss: () => Promise<void>;
  actionProps: MessageActionProps;
}) {
  const tokens = useMobileTokens();
  const { t } = useI18n();
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetSession = useRef(0);
  const session = sheetSession.current;
  const [saved, setSaved] = useState(false);
  const [sentOnce, setSentOnce] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const answered = saved || dismissed || ask.status === "answered";
  const secretInput = isSecretAskBlock(ask);
  const loginInput = secretInput && ask.credential?.auth.type === "login";
  // A login, credential or code is for the run's user, so only they can fill one in; others see
  // the card without fields or buttons.
  const ownerOnly = secretInput && Boolean(ask.credential || ask.oneTimeCode) && !canDismiss;
  const destination = ask.credential
    ? secretDestinationLabel(ask.credential)
    : ask.oneTimeCode &&
      t("Only enter a code {host} sent you.", { host: siteHost(ask.oneTimeCode.origin) });
  const incomplete = ask.oneTimeCode
    ? !normalizeOneTimeCode(answer)
    : secretInput
      ? answer.length === 0
      : !answer.trim();
  const secretLabel =
    ask.purpose === "password"
      ? t("Password")
      : ask.purpose === "api_key"
        ? t("API key")
        : t("Code");
  const submitLabel = ask.oneTimeCode ? t("Continue") : secretInput ? t("Save") : t("Send answer");

  async function dismiss() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setAnswer("");
    try {
      await onDismiss();
      setDismissed(true);
    } catch {
      setError(t("Could not send answer"));
    } finally {
      setSubmitting(false);
    }
  }

  async function submit() {
    if (submitting) return;
    if (incomplete) return;
    const submitValue = secretInput ? answer : answer.trim();
    setSubmitting(true);
    setError(null);
    if (secretInput) setAnswer("");
    try {
      await onAnswer(submitValue);
      if (secretInput) setSaved(true);
    } catch (cause) {
      setError(
        secretInput ? t("Could not send answer") : errorText(cause, t("Could not send answer")),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const bg = tokens?.background;
  const isLight =
    typeof bg === "string" && /^#[\da-f]{6}/i.test(bg)
      ? Number.parseInt(bg.slice(1, 3), 16) > 128
      : true;
  const hairline = StyleSheet.hairlineWidth ?? 0.5;
  const cardBg = isLight ? "#FFFEFC" : "#242933";
  const cardBorder =
    tokens?.border ?? (isLight ? "rgba(38, 35, 31, 0.055)" : "rgba(245, 244, 240, 0.09)");
  const fieldBg = isLight ? "#F8F6F2" : "#2A303B";
  const fieldBorder = isLight ? "rgba(38, 35, 31, 0.09)" : "rgba(245, 244, 240, 0.12)";

  return (
    <GlassSurface
      shape="roundedRectangle"
      cornerRadius={20}
      fallbackStyle={{
        backgroundColor: cardBg,
        borderWidth: hairline,
        borderColor: cardBorder,
      }}
      style={{
        width: secretInput ? "100%" : "90%",
        borderRadius: 20,
        paddingHorizontal: 18,
        paddingVertical: 16,
        gap: 12,
      }}
    >
      <Text
        {...actionProps}
        numberOfLines={secretInput ? 2 : undefined}
        style={{ color: tokens.foreground, ...typeScale.cardTitle }}
      >
        {plainAskTitle(ask.text)}
      </Text>
      {secretInput && destination ? (
        <Text style={{ color: tokens.mutedForeground, ...typeScale.secondary }}>{destination}</Text>
      ) : null}
      {ask.detail && (!secretInput || ask.oneTimeCode) ? (
        <Text style={{ color: tokens.mutedForeground, ...typeScale.secondary }}>{ask.detail}</Text>
      ) : null}
      {answered ? (
        <Text
          style={{
            // Dismissed reads like a declined approval, not a success.
            color: dismissed || ask.dismissed ? tokens.mutedForeground : tokens.success,
            ...typeScale.secondary,
            fontWeight: fontWeight.medium,
            ...(secretInput ? { marginTop: 12 } : null),
          }}
        >
          {secretInput
            ? t(
                dismissed || ask.dismissed
                  ? "Dismissed"
                  : sentOnce || ask.remembered === false || ask.oneTimeCode
                    ? "Sent"
                    : "Saved",
              )
            : t("Answered: {answer}", { answer: ask.answer ?? t("Done") })}
        </Text>
      ) : canAnswer && ownerOnly ? null : canAnswer && loginInput ? (
        <View style={askInputStyles.buttons}>
          <NativeActionButton
            label={t("Continue")}
            disabled={submitting}
            fill={secretInput}
            style={secretInput ? askInputStyles.button : undefined}
            onPress={() => {
              sheetSession.current += 1;
              setSheetOpen(true);
            }}
          />
          {canDismiss ? (
            <NativeActionButton
              label={t("Dismiss")}
              disabled={submitting}
              fill={secretInput}
              style={secretInput ? askInputStyles.button : undefined}
              prominence="secondary"
              onPress={() => void dismiss()}
            />
          ) : null}
        </View>
      ) : canAnswer ? (
        <>
          <TextInput
            accessibilityLabel={secretInput ? secretLabel : t("Answer")}
            value={answer}
            onChangeText={setAnswer}
            placeholder={secretInput ? secretLabel : t("Type your answer")}
            placeholderTextColor={tokens.faintForeground}
            secureTextEntry={secretInput}
            autoComplete="off"
            {...(secretInput ? secretFieldTraits(ask.purpose, ask.credential) : {})}
            autoCorrect={secretInput ? false : undefined}
            autoCapitalize={secretInput ? "none" : "sentences"}
            editable={!submitting}
            onSubmitEditing={() => void submit()}
            style={[
              askInputStyles.field,
              secretInput ? { alignSelf: "stretch" } : undefined,
              {
                backgroundColor: fieldBg,
                borderWidth: hairline,
                borderColor: fieldBorder,
                color: tokens.foreground,
              },
            ]}
          />
          <View style={askInputStyles.buttons}>
            <NativeActionButton
              label={submitLabel}
              disabled={incomplete}
              busy={submitting}
              fill={secretInput}
              style={secretInput ? askInputStyles.button : undefined}
              onPress={() => void submit()}
            />
            {secretInput && canDismiss ? (
              <NativeActionButton
                label={t("Dismiss")}
                disabled={submitting}
                fill={secretInput}
                style={secretInput ? askInputStyles.button : undefined}
                prominence="secondary"
                onPress={() => void dismiss()}
              />
            ) : null}
          </View>
        </>
      ) : (
        <Text style={{ color: tokens.mutedForeground, ...typeScale.caption }}>
          {t("Waiting for this bot’s response.")}
        </Text>
      )}
      {error ? (
        <Text style={{ color: tokens.destructive, ...typeScale.caption }}>{error}</Text>
      ) : null}
      {sheetOpen && loginInput && ask.credential ? (
        <SecretAskSheet
          title={plainAskTitle(ask.text)}
          destination={secretDestinationLabel(ask.credential)}
          // Once any save is accepted, or the viewer is no longer the run's user, the open sheet
          // clears its own fields, then closes itself.
          pending={canAnswer && !answered && !ownerOnly}
          onClose={() => {
            if (session === sheetSession.current) setSheetOpen(false);
          }}
          loginFields={ask.loginFields}
          onSave={async (fields, remember) => {
            if (remember) await onAnswer("", fields);
            else await onAnswer("", fields, false);
            setSentOnce(!remember);
            setSaved(true);
            if (session === sheetSession.current) setSheetOpen(false);
          }}
        />
      ) : null}
    </GlassSurface>
  );
}

const askInputStyles = StyleSheet.create({
  field: {
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  button: {
    flex: 1,
    minWidth: 100,
  },
  // Wraps at large text sizes so neither button is pushed off the card.
  buttons: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    alignItems: "center",
    gap: 8,
  },
});
