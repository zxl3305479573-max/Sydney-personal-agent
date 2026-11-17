import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PASSWORD_RULES } from "@rakazo/core";
import { useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { currentApiBase, resetPasswordFromToken } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { passwordResetToken } from "../lib/password-reset-link";
import { NativeActionButton } from "./native-action-button";

export function NativePasswordReset({
  apiBase,
  resetUrl,
  onDone,
}: {
  apiBase: string;
  resetUrl: string;
  onDone: () => void;
}) {
  const { locale } = useI18n();
  const tokens = useMobileTokens();
  const text = (chinese: string, english: string) => (locale.startsWith("zh") ? chinese : english);
  const [link, setLink] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const submitting = useRef(false);

  async function submit() {
    if (submitting.current) return;
    if (currentApiBase() !== apiBase) {
      setError(
        text(
          "服务器已改变，请重新申请重置邮件。",
          "The server changed. Request a new reset email.",
        ),
      );
      return;
    }
    const token = passwordResetToken(link, apiBase, resetUrl);
    if (!token) {
      setError(
        text("链接无效或不属于当前服务器。", "The link is invalid or belongs to another server."),
      );
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      setError(
        text(
          `密码需要 ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} 个字符。`,
          `Use ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters.`,
        ),
      );
      return;
    }
    if (password !== confirmation) {
      setError(text("两次输入的密码不一致。", "Passwords do not match."));
      return;
    }
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      await resetPasswordFromToken(token, password, apiBase);
      setLink("");
      setPassword("");
      setConfirmation("");
      if (currentApiBase() !== apiBase) {
        setError(
          text(
            "请求已发送到原服务器，请切回后尝试登录。",
            "The request went to the original server. Switch back and try signing in.",
          ),
        );
      } else {
        setComplete(true);
      }
    } catch {
      setError(
        text(
          "重置结果不确定。请先尝试用新密码登录；如不成功，请重新申请链接。",
          "The result is uncertain. Try signing in with the new password; if that fails, request a new link.",
        ),
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  const fieldStyle = {
    marginTop: 10,
    minHeight: 48,
    color: tokens.foreground,
    backgroundColor: tokens.background,
    borderColor: tokens.input,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
  };
  return (
    <View style={{ gap: 8 }}>
      {complete ? (
        <Text accessibilityRole="alert" style={{ color: tokens.foreground }}>
          {text("密码已更新，请返回登录。", "Password updated. Return to sign in.")}
        </Text>
      ) : (
        <>
          <Text style={{ color: tokens.mutedForeground }}>
            {text(
              "复制邮件中的原始重置链接并粘贴到这里，即可在 App 内设置新密码。",
              "Copy the original reset link from your email and paste it here to set a new password in the app.",
            )}
          </Text>
          <TextInput
            accessibilityLabel={text("重置链接", "Reset link")}
            value={link}
            onChangeText={setLink}
            editable={!pending}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={4096}
            placeholder={text("粘贴邮件中的链接", "Paste the link from your email")}
            placeholderTextColor={tokens.mutedForeground}
            style={fieldStyle}
          />
          <TextInput
            accessibilityLabel={text("新密码", "New password")}
            value={password}
            onChangeText={setPassword}
            editable={!pending}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            passwordRules={PASSWORD_RULES}
            maxLength={MAX_PASSWORD_LENGTH}
            placeholder={text("新密码", "New password")}
            placeholderTextColor={tokens.mutedForeground}
            style={fieldStyle}
          />
          <TextInput
            accessibilityLabel={text("确认新密码", "Confirm new password")}
            value={confirmation}
            onChangeText={setConfirmation}
            editable={!pending}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={MAX_PASSWORD_LENGTH}
            placeholder={text("确认新密码", "Confirm new password")}
            placeholderTextColor={tokens.mutedForeground}
            style={fieldStyle}
          />
          {error ? (
            <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>
              {error}
            </Text>
          ) : null}
          <NativeActionButton
            label={text("重置密码", "Reset password")}
            busy={pending}
            disabled={!link || !password || !confirmation}
            onPress={() => void submit()}
          />
        </>
      )}
      <NativeActionButton
        label={text("返回登录", "Back to sign in")}
        prominence="quiet"
        disabled={pending}
        onPress={onDone}
      />
    </View>
  );
}
