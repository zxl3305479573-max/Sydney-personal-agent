import type { AccountSecurity } from "@rakazo/contracts";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  captureServerSessionScope,
  deleteAccount,
  fetchAccountSecurity,
  isServerSessionScopeCurrent,
  requestAccountDeletionCode,
} from "../lib/api";
import type { ServerSessionScope } from "../lib/api";
import { mobileTokens } from "../lib/appearance";
import { replaceWithSignIn } from "../lib/auth-routing";
import { promptAccountDeletion } from "../lib/delete-account-prompt";
import { useI18n } from "../lib/i18n";
import { native, useThemedStyles } from "../lib/native";
import { continueWithSso } from "../lib/sso";
import { errorText } from "../lib/user-error";
import { NativeActionButton } from "./native-action-button";

/**
 * Deleting the account: confirms it's the owner (password, a fresh SSO sign-in, or an emailed
 * code), deletes, and returns to sign-in. Render `dialog`; `error` is for the screen while the
 * dialog is closed.
 */
export function useAccountDeletion({
  onSecurity,
}: {
  onSecurity?: (security: AccountSecurity) => void;
} = {}) {
  const { t } = useI18n();
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  const [dialogScope, setDialogScope] = useState<ServerSessionScope | null>(null);
  const [security, setSecurityState] = useState<AccountSecurity | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [ssoReauthenticated, setSsoReauthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled =
    pending ||
    (security?.hasPassword ? !password : !ssoReauthenticated && (!codeSent || !password.trim()));

  function setSecurity(value: AccountSecurity) {
    setSecurityState(value);
    onSecurity?.(value);
  }

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorText(err, t("Could not continue")));
    } finally {
      setPending(false);
    }
  }

  // Cancelling dismisses the dialog's error too, so it does not reappear behind it.
  function close() {
    if (pending) return;
    setOpen(false);
    setDialogScope(null);
    setPassword("");
    setError(null);
  }

  async function request() {
    if (pending) return;
    setError(null);
    let scope: ServerSessionScope;
    try {
      scope = captureServerSessionScope();
      const value = await fetchAccountSecurity();
      if (!isServerSessionScopeCurrent(scope))
        throw new Error(t("The session changed. Open account deletion again."));
      setSecurity(value);
      if (!value.hasPassword) {
        setPassword("");
        setCodeSent(false);
        setSsoReauthenticated(value.freshOidcAuth);
        setDialogScope(scope);
        setOpen(true);
        return;
      }
    } catch (err) {
      setError(errorText(err, t("Could not continue")));
      return;
    }

    const prompted = promptAccountDeletion({
      title: t("Delete your account?"),
      message: t(
        "This permanently deletes your account, bots, conversations, memories, files, and saved connections. This cannot be undone.",
      ),
      cancelLabel: t("Cancel"),
      deleteLabel: t("Delete"),
      onSubmit: (value) => void submit(value, true, scope),
    });
    if (!prompted) {
      setPassword("");
      setDialogScope(scope);
      setOpen(true);
    }
  }

  async function submit(
    value: string,
    hasPassword = security?.hasPassword === true,
    scope = dialogScope,
  ) {
    if ((!value && !ssoReauthenticated) || pending) return;
    setPending(true);
    setError(null);
    try {
      if (!scope || !isServerSessionScopeCurrent(scope))
        throw new Error(t("The session changed. Open account deletion again."));
      let result: Awaited<ReturnType<typeof deleteAccount>>;
      if (hasPassword) result = await deleteAccount(value, undefined, scope);
      else {
        const current = await fetchAccountSecurity();
        if (!isServerSessionScopeCurrent(scope))
          throw new Error(t("The session changed. Open account deletion again."));
        setSecurity(current);
        setSsoReauthenticated(current.freshOidcAuth);
        const token = codeSent ? value.trim() : undefined;
        if (current.hasPassword || (!current.freshOidcAuth && !token)) return;
        result = await deleteAccount(undefined, token, scope);
      }
      setOpen(false);
      setDialogScope(null);
      setPassword("");
      if (result.status === "session-changed" || !isServerSessionScopeCurrent(result.scope)) {
        Alert.alert(
          t("Account deleted"),
          (result.status === "session-changed" && result.cleanupFailed) ||
          result.status === "cleanup-failed"
            ? t("The original account was deleted, but local cleanup failed and your session has changed.")
            : t("The original account was deleted. Your current session has changed."),
        );
        return;
      }
      if (result.status === "cleanup-failed") {
        Alert.alert(
          t("Account deleted"),
          t("The account was deleted, but local session cleanup failed. Restart the app and try signing out."),
        );
        return;
      }
      replaceWithSignIn("/sign-in");
    } catch (err) {
      setError(errorText(err, t("Could not delete account")));
    } finally {
      setPending(false);
    }
  }

  const dialog = open ? (
    <Modal transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.dialogOverlay}
      >
        <Pressable
          accessibilityLabel={t("Cancel")}
          style={StyleSheet.absoluteFill}
          onPress={close}
        />
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.dialog}
          keyboardShouldPersistTaps="handled"
          style={styles.dialogScroll}
        >
          <Text style={styles.dialogTitle}>{t("Delete your account?")}</Text>
          <Text style={styles.dialogBody}>
            {t(
              "This permanently deletes your account, bots, conversations, memories, files, and saved connections. This cannot be undone.",
            )}
          </Text>
          {!security?.hasPassword ? (
            <>
              {security?.sso ? (
                <NativeActionButton
                  label={t("Sign in again")}
                  disabled={pending}
                  onPress={() =>
                    void run(async () => {
                      if (!dialogScope || !isServerSessionScopeCurrent(dialogScope))
                        throw new Error(t("The session changed. Open account deletion again."));
                      const authenticated = await continueWithSso("reauthenticate");
                      if (!authenticated) return;
                      const next = captureServerSessionScope();
                      if (
                        next.apiBase !== dialogScope.apiBase ||
                        next.endpointGeneration !== dialogScope.endpointGeneration ||
                        next.sessionGeneration !== dialogScope.sessionGeneration + 1
                      )
                        throw new Error(t("The session changed. Open account deletion again."));
                      setDialogScope(next);
                      setSsoReauthenticated(true);
                    })
                  }
                />
              ) : null}
              {security?.emailDeletion ? (
                <NativeActionButton
                  label={t("Send deletion code")}
                  disabled={pending}
                  onPress={() =>
                    void run(async () => {
                      if (!dialogScope || !isServerSessionScopeCurrent(dialogScope))
                        throw new Error(t("The session changed. Open account deletion again."));
                      await requestAccountDeletionCode();
                      if (!isServerSessionScopeCurrent(dialogScope))
                        throw new Error(t("The session changed. Open account deletion again."));
                      setCodeSent(true);
                    })
                  }
                />
              ) : null}
            </>
          ) : null}
          {security?.hasPassword || codeSent ? (
            <TextInput
              accessibilityLabel={
                security?.hasPassword ? t("Current password") : t("Deletion code")
              }
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              editable={!pending}
              onChangeText={(next) => {
                setPassword(next);
                setError(null);
              }}
              placeholder={security?.hasPassword ? t("Current password") : t("Deletion code")}
              placeholderTextColor={native.tertiaryLabel}
              secureTextEntry={security?.hasPassword}
              style={styles.dialogInput}
              textContentType={security?.hasPassword ? "password" : "oneTimeCode"}
              value={password}
            />
          ) : null}
          {error ? (
            <Text accessibilityRole="alert" style={styles.dialogError}>
              {error}
            </Text>
          ) : null}
          <View style={styles.dialogActions}>
            <Pressable accessibilityRole="button" onPress={close} style={styles.dialogAction}>
              <Text style={styles.dialogCancel}>{t("Cancel")}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => void submit(password)}
              style={styles.dialogAction}
            >
              <Text style={[styles.dialogDelete, disabled && styles.disabled]}>{t("Delete")}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  ) : null;

  return { request, run, pending, error: open ? null : error, dialog };
}

function createStyles() {
  const tokens = mobileTokens();
  return StyleSheet.create({
    dialogOverlay: {
      flex: 1,
      justifyContent: "center",
      padding: 24,
      backgroundColor: "rgba(0, 0, 0, 0.62)",
    },
    dialogScroll: {
      flexGrow: 0,
      flexShrink: 1,
      maxHeight: "100%",
      borderRadius: 14,
      backgroundColor: native.page,
    },
    dialog: {
      padding: 18,
      gap: 12,
    },
    dialogTitle: {
      color: native.label,
      fontSize: 17,
      fontWeight: "600",
    },
    dialogBody: {
      color: native.secondaryLabel,
      fontSize: 14,
      lineHeight: 20,
    },
    dialogInput: {
      height: 48,
      borderRadius: 12,
      backgroundColor: native.fill,
      color: native.label,
      paddingHorizontal: 14,
      fontSize: 16,
    },
    dialogError: {
      color: tokens.destructive,
      fontSize: 14,
    },
    dialogActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
      gap: 12,
    },
    dialogAction: {
      minHeight: 48,
      justifyContent: "center",
      paddingHorizontal: 8,
    },
    dialogCancel: {
      color: native.label,
      fontSize: 16,
      fontWeight: "600",
    },
    dialogDelete: {
      color: tokens.destructive,
      fontSize: 16,
      fontWeight: "600",
    },
    disabled: {
      opacity: 0.45,
    },
  });
}
