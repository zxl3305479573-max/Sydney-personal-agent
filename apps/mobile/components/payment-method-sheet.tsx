import type {
  PaymentCardAccent,
  PaymentMethodKind,
  PaymentMethodSensitivePayload,
  PaymentMethodSummary,
  UpsertPaymentMethodInput,
} from "@rakazo/contracts";
import {
  compactPaymentSensitivePayload,
  PAYMENT_CARD_ACCENTS,
  PAYMENT_METHOD_KINDS,
  parseAmountToCents,
} from "@rakazo/contracts";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "../lib/i18n";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";
import {
  paymentCardAccentPalette,
  paymentMethodKindLabel,
  paymentMethodSymbol,
} from "../lib/personal-finance-ui";
import { AppModalSheet } from "./app-modal-sheet";
import { MotionPressable } from "./motion-pressable";
import { NativeSwitch } from "./native-switch";
import { NativeSymbol } from "./native-symbol";

const CURRENCIES = ["CNY", "USD", "HKD", "EUR", "JPY"] as const;

function parseDayField(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const num = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(num) || num < 1 || num > 31) return null;
  return num;
}

export type PaymentMethodSheetProps = {
  visible: boolean;
  editing: PaymentMethodSummary | null;
  onClose: () => void;
  onSave: (input: UpsertPaymentMethodInput) => Promise<void>;
};

export function PaymentMethodSheet({ visible, editing, onClose, onSave }: PaymentMethodSheetProps) {
  const insets = useSafeAreaInsets();
  const tokens = useMobileTokens();
  const appearance = useResolvedAppearance();
  const { locale } = useI18n();
  const zh = locale.startsWith("zh");
  const tw = locale === "zh-TW";
  const copy = (cn: string, hant: string, en: string) => (zh ? (tw ? hant : cn) : en);

  const [kind, setKind] = useState<PaymentMethodKind>("debit_card");
  const [label, setLabel] = useState("");
  const [institution, setInstitution] = useState("");
  const [holderName, setHolderName] = useState("");
  const [currency, setCurrency] = useState("CNY");
  const [billingDay, setBillingDay] = useState("");
  const [repaymentDay, setRepaymentDay] = useState("");
  const [creditLimitText, setCreditLimitText] = useState("");
  const [balanceText, setBalanceText] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [accentColor, setAccentColor] = useState<PaymentCardAccent | null>(null);

  // Sensitive fields — cleared right after save and on close.
  const [accountNumber, setAccountNumber] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [expiryYear, setExpiryYear] = useState("");
  const [cvv, setCvv] = useState("");
  const [branchName, setBranchName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [privateNote, setPrivateNote] = useState("");
  const [showSensitiveInput, setShowSensitiveInput] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearSensitiveFields = () => {
    setAccountNumber("");
    setExpiryMonth("");
    setExpiryYear("");
    setCvv("");
    setBranchName("");
    setPhoneNumber("");
    setPrivateNote("");
    setShowSensitiveInput(false);
  };

  useEffect(() => {
    if (!visible) {
      clearSensitiveFields();
      return;
    }
    setError(null);
    setSaving(false);
    clearSensitiveFields();
    if (editing) {
      setKind(editing.kind);
      setLabel(editing.label);
      setInstitution(editing.institution ?? "");
      setHolderName(editing.holderName ?? "");
      setCurrency(editing.currency || "CNY");
      setBillingDay(editing.billingDay ? String(editing.billingDay) : "");
      setRepaymentDay(editing.repaymentDay ? String(editing.repaymentDay) : "");
      setCreditLimitText(
        editing.creditLimitCents != null
          ? (editing.creditLimitCents / 100).toFixed(2).replace(/\.00$/, "")
          : "",
      );
      setBalanceText(
        editing.balanceCents != null
          ? (editing.balanceCents / 100).toFixed(2).replace(/\.00$/, "")
          : "",
      );
      setIsDefault(editing.isDefault);
      setAccentColor(editing.accentColor ?? null);
    } else {
      setKind("debit_card");
      setLabel("");
      setInstitution("");
      setHolderName("");
      setCurrency("CNY");
      setBillingDay("");
      setRepaymentDay("");
      setCreditLimitText("");
      setBalanceText("");
      setIsDefault(false);
      setAccentColor(null);
    }
  }, [visible, editing]);

  const isLight = appearance === "light";
  const cardBg = isLight ? "#FFFEFC" : "#242933";
  const chipBg = isLight ? "#F8F6F2" : "#2A303B";
  const borderColor = isLight ? "rgba(38, 35, 31, 0.08)" : "rgba(245, 244, 240, 0.12)";
  const activeBg = isLight ? "#2E2B27" : "#E7E4DD";
  const activeInk = isLight ? "#FAF8F4" : "#15171C";
  const dangerInk = isLight ? "#B42318" : "#F97066";
  const safeBg = isLight ? "rgba(46, 111, 78, 0.09)" : "rgba(138, 219, 169, 0.14)";
  const safeInk = isLight ? "#2E6F4E" : "#8ADBA9";

  const isCreditCard = kind === "credit_card";
  const isBankLike = kind === "debit_card" || kind === "credit_card" || kind === "bank_transfer";

  const handleClose = () => {
    clearSensitiveFields();
    onClose();
  };

  const handleSubmit = async () => {
    if (saving) return;
    if (!label.trim()) {
      setError(
        copy(
          "请填写支付方式名称（例如：招行储蓄卡、微信支付）",
          "請填寫支付方式名稱",
          "Enter a name for this payment method",
        ),
      );
      return;
    }
    const cleanMonth = expiryMonth.trim();
    if (cleanMonth && !/^(0[1-9]|1[0-2])$/.test(cleanMonth.padStart(2, "0"))) {
      setError(copy("有效期月份请填 01-12", "有效期月份請填 01-12", "Expiry month must be 01-12"));
      return;
    }
    const cleanYear = expiryYear.trim();
    if (cleanYear && !/^(\d{2}|\d{4})$/.test(cleanYear)) {
      setError(
        copy(
          "有效期年份请填 2 位或 4 位数字",
          "有效期年份請填 2 位或 4 位數字",
          "Expiry year must be YY or YYYY",
        ),
      );
      return;
    }
    const parsedLimit = creditLimitText.trim() ? parseAmountToCents(creditLimitText) : null;
    if (creditLimitText.trim() && parsedLimit === null) {
      setError(copy("信用额度格式不正确", "信用額度格式不正確", "Invalid credit limit"));
      return;
    }
    const parsedBalance = balanceText.trim() ? parseAmountToCents(balanceText) : null;
    if (balanceText.trim() && parsedBalance === null) {
      setError(copy("余额格式不正确", "餘額格式不正確", "Invalid balance amount"));
      return;
    }

    const rawSensitive: PaymentMethodSensitivePayload = {
      ...(accountNumber.trim() ? { accountNumber: accountNumber.trim() } : {}),
      ...(cleanMonth ? { expiryMonth: cleanMonth.padStart(2, "0") } : {}),
      ...(cleanYear ? { expiryYear: cleanYear } : {}),
      ...(cvv.trim() ? { cvv: cvv.trim() } : {}),
      ...(branchName.trim() ? { branchName: branchName.trim() } : {}),
      ...(phoneNumber.trim() ? { phoneNumber: phoneNumber.trim() } : {}),
      ...(privateNote.trim() ? { note: privateNote.trim() } : {}),
    };
    const compacted = compactPaymentSensitivePayload(rawSensitive);

    setSaving(true);
    setError(null);
    try {
      await onSave({
        ...(editing ? { id: editing.id } : {}),
        kind,
        label: label.trim(),
        institution: institution.trim() || null,
        holderName: holderName.trim() || null,
        currency,
        billingDay: isCreditCard ? parseDayField(billingDay) : null,
        repaymentDay: isCreditCard ? parseDayField(repaymentDay) : null,
        creditLimitCents: isCreditCard ? parsedLimit : null,
        balanceCents: parsedBalance,
        isDefault,
        accentColor,
        // On edit: omit `sensitive` if the user left all sensitive inputs blank so existing ciphertext stays intact.
        ...(compacted ? { sensitive: compacted } : {}),
      });
      clearSensitiveFields();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : copy(
              "保存支付方式失败，请重试",
              "儲存支付方式失敗，請重試",
              "Could not save payment method",
            ),
      );
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    backgroundColor: cardBg,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: tokens.foreground,
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor,
  } as const;

  return (
    <AppModalSheet
      visible={visible}
      onClose={handleClose}
      preventDismiss={saving}
      bottomInset={insets.bottom}
      accessibilityLabel={
        editing
          ? copy("编辑支付方式", "編輯支付方式", "Edit payment method")
          : copy("添加支付方式", "新增支付方式", "Add payment method")
      }
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 20,
          paddingBottom: 12,
        }}
      >
        <MotionPressable preset="inline" disabled={saving} onPress={handleClose}>
          <Text style={{ color: tokens.mutedForeground, fontSize: 15 }}>
            {copy("取消", "取消", "Cancel")}
          </Text>
        </MotionPressable>
        <Text style={{ color: tokens.foreground, fontSize: 16, fontWeight: "700" }}>
          {editing
            ? copy("编辑支付方式", "編輯支付方式", "Edit method")
            : copy("添加支付方式", "新增支付方式", "Add method")}
        </Text>
        <MotionPressable
          preset="inline"
          testID="payment-method-save"
          disabled={saving}
          onPress={() => void handleSubmit()}
        >
          <Text
            style={{
              color: tokens.foreground,
              fontSize: 15,
              fontWeight: "700",
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? copy("保存中…", "儲存中…", "Saving…") : copy("保存", "儲存", "Save")}
          </Text>
        </MotionPressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 15 }}
      >
        {/* Type Picker */}
        <View style={{ gap: 8 }}>
          <Text style={{ color: tokens.mutedForeground, fontSize: 12.5, paddingLeft: 4 }}>
            {copy("支付类型", "支付類型", "Type")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {PAYMENT_METHOD_KINDS.map((itemKind) => {
              const selected = kind === itemKind;
              const sym = paymentMethodSymbol(itemKind);
              return (
                <MotionPressable
                  key={itemKind}
                  preset="control"
                  testID={`method-kind-${itemKind}`}
                  onPress={() => setKind(itemKind)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    paddingHorizontal: 11,
                    paddingVertical: 7,
                    borderRadius: 999,
                    backgroundColor: selected ? activeBg : cardBg,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: selected ? "transparent" : borderColor,
                  }}
                >
                  <NativeSymbol
                    ios={sym.ios}
                    android={sym.android}
                    size={13}
                    color={selected ? activeInk : sym.color}
                  />
                  <Text
                    style={{
                      color: selected ? activeInk : tokens.foreground,
                      fontSize: 13,
                      fontWeight: selected ? "600" : "500",
                    }}
                  >
                    {paymentMethodKindLabel(itemKind, locale)}
                  </Text>
                </MotionPressable>
              );
            })}
          </View>
        </View>

        {/* Basic Info */}
        <View style={{ gap: 10 }}>
          <View style={{ gap: 5 }}>
            <Text style={{ color: tokens.mutedForeground, fontSize: 12.5, paddingLeft: 4 }}>
              {copy("名称 / 别名（必填）", "名稱 / 別名（必填）", "Label (required)")}
            </Text>
            <TextInput
              testID="payment-method-label-input"
              value={label}
              onChangeText={setLabel}
              placeholder={copy(
                "例如：招商银行储蓄卡、日常支付宝、招行经典白",
                "例如：招商銀行儲蓄卡、日常支付寶",
                "e.g. Chase Checking, Alipay",
              )}
              placeholderTextColor={tokens.mutedForeground}
              style={inputStyle}
            />
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={{ color: tokens.mutedForeground, fontSize: 12.5, paddingLeft: 4 }}>
                {copy("发卡行 / 平台", "發卡行 / 平台", "Bank / Platform")}
              </Text>
              <TextInput
                value={institution}
                onChangeText={setInstitution}
                placeholder={copy("例如：招商银行", "例如：招商銀行", "e.g. CMB")}
                placeholderTextColor={tokens.mutedForeground}
                style={inputStyle}
              />
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={{ color: tokens.mutedForeground, fontSize: 12.5, paddingLeft: 4 }}>
                {copy("持卡人 / 户名", "持卡人 / 戶名", "Holder name")}
              </Text>
              <TextInput
                value={holderName}
                onChangeText={setHolderName}
                placeholder={copy("姓名（选填）", "姓名（選填）", "Name")}
                placeholderTextColor={tokens.mutedForeground}
                style={inputStyle}
              />
            </View>
          </View>
        </View>

        {/* Sensitive Encrypted Vault Section */}
        <View
          style={{
            backgroundColor: cardBg,
            borderRadius: 18,
            padding: 14,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor,
            gap: 12,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 9,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: safeBg,
              }}
            >
              <NativeSymbol
                ios="lock.shield.fill"
                android="shield-checkmark-outline"
                size={12}
                color={safeInk}
              />
              <Text style={{ color: safeInk, fontSize: 11.5, fontWeight: "600" }}>
                {copy(
                  "AES-256 加密区 · 绝不暴露给 Bot",
                  "AES-256 加密區 · 絕不暴露給 Bot",
                  "Encrypted · Hidden from bots",
                )}
              </Text>
            </View>
            <MotionPressable preset="inline" onPress={() => setShowSensitiveInput((prev) => !prev)}>
              <Text style={{ color: tokens.mutedForeground, fontSize: 12.5, fontWeight: "600" }}>
                {showSensitiveInput
                  ? copy("隐藏输入", "隱藏輸入", "Mask")
                  : copy("显示输入", "顯示輸入", "Show")}
              </Text>
            </MotionPressable>
          </View>

          {editing?.hasSensitiveDetails ? (
            <Text style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 17 }}>
              {copy(
                "已存有加密卡号/敏感信息。以下留空将保留原加密数据，填写新内容则会覆盖更新。",
                "已存有加密卡號/敏感資訊。以下留空將保留原加密資料，填寫新內容則會覆蓋更新。",
                "Encrypted details already saved. Leave blank to keep them unchanged, or enter new values to replace.",
              )}
            </Text>
          ) : null}

          <View style={{ gap: 5 }}>
            <Text style={{ color: tokens.mutedForeground, fontSize: 12.5 }}>
              {isBankLike
                ? copy("完整银行卡号 / 账号", "完整銀行卡號 / 帳號", "Card / Account number")
                : copy(
                    "账号 / 绑定手机号 / 邮箱 / 地址",
                    "帳號 / 綁定手機號 / 郵箱 / 地址",
                    "Account ID / Phone / Email / Address",
                  )}
            </Text>
            <TextInput
              testID="payment-method-account-input"
              value={accountNumber}
              onChangeText={setAccountNumber}
              secureTextEntry={!showSensitiveInput && isBankLike}
              autoCorrect={false}
              autoCapitalize="none"
              autoComplete="off"
              textContentType="none"
              placeholder={
                editing?.accountMask
                  ? `${copy("当前", "目前", "Current")}: ${editing.accountMask}`
                  : isBankLike
                    ? "6225 8801 ...."
                    : copy("选填", "選填", "Optional")
              }
              placeholderTextColor={tokens.mutedForeground}
              style={{
                backgroundColor: chipBg,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: tokens.foreground,
                fontSize: 15,
                fontVariant: ["tabular-nums"],
                borderWidth: StyleSheet.hairlineWidth,
                borderColor,
              }}
            />
          </View>

          {isCreditCard ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
                  {copy("有效月 MM", "有效月 MM", "Exp MM")}
                </Text>
                <TextInput
                  value={expiryMonth}
                  onChangeText={setExpiryMonth}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="08"
                  placeholderTextColor={tokens.mutedForeground}
                  style={{
                    backgroundColor: chipBg,
                    borderRadius: 12,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    color: tokens.foreground,
                    fontSize: 14,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor,
                  }}
                />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
                  {copy("有效年 YY", "有效年 YY", "Exp YY")}
                </Text>
                <TextInput
                  value={expiryYear}
                  onChangeText={setExpiryYear}
                  keyboardType="number-pad"
                  maxLength={4}
                  placeholder="29"
                  placeholderTextColor={tokens.mutedForeground}
                  style={{
                    backgroundColor: chipBg,
                    borderRadius: 12,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    color: tokens.foreground,
                    fontSize: 14,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor,
                  }}
                />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
                  {copy("安全码 CVV", "安全碼 CVV", "CVV")}
                </Text>
                <TextInput
                  value={cvv}
                  onChangeText={setCvv}
                  secureTextEntry={!showSensitiveInput}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoComplete="off"
                  textContentType="none"
                  placeholder="•••"
                  placeholderTextColor={tokens.mutedForeground}
                  style={{
                    backgroundColor: chipBg,
                    borderRadius: 12,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    color: tokens.foreground,
                    fontSize: 14,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor,
                  }}
                />
              </View>
            </View>
          ) : null}

          {isBankLike ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1.2, gap: 4 }}>
                <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
                  {copy("开户行 / 支行", "開戶行 / 支行", "Branch")}
                </Text>
                <TextInput
                  value={branchName}
                  onChangeText={setBranchName}
                  placeholder={copy("选填（转账常用）", "選填（轉帳常用）", "Optional")}
                  placeholderTextColor={tokens.mutedForeground}
                  style={{
                    backgroundColor: chipBg,
                    borderRadius: 12,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    color: tokens.foreground,
                    fontSize: 14,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor,
                  }}
                />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
                  {copy("预留手机号", "預留手機號", "Phone")}
                </Text>
                <TextInput
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  placeholder={copy("选填", "選填", "Optional")}
                  placeholderTextColor={tokens.mutedForeground}
                  style={{
                    backgroundColor: chipBg,
                    borderRadius: 12,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    color: tokens.foreground,
                    fontSize: 14,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor,
                  }}
                />
              </View>
            </View>
          ) : null}

          <View style={{ gap: 4 }}>
            <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
              {copy("私密备注（加密存储）", "私密備註（加密儲存）", "Private note (encrypted)")}
            </Text>
            <TextInput
              value={privateNote}
              onChangeText={setPrivateNote}
              placeholder={copy(
                "例如：免年费规则、限额说明等",
                "例如：免年費規則、限額說明等",
                "Annual fee rules, notes...",
              )}
              placeholderTextColor={tokens.mutedForeground}
              style={{
                backgroundColor: chipBg,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 9,
                color: tokens.foreground,
                fontSize: 14,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor,
              }}
            />
          </View>
        </View>

        {/* Credit Card Days & Limits / Balance */}
        {isCreditCard ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: tokens.mutedForeground, fontSize: 12.5, paddingLeft: 4 }}>
                {copy("账单日 (1-31)", "帳單日 (1-31)", "Billing day")}
              </Text>
              <TextInput
                value={billingDay}
                onChangeText={setBillingDay}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="5"
                placeholderTextColor={tokens.mutedForeground}
                style={inputStyle}
              />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: tokens.mutedForeground, fontSize: 12.5, paddingLeft: 4 }}>
                {copy("还款日 (1-31)", "還款日 (1-31)", "Due day")}
              </Text>
              <TextInput
                value={repaymentDay}
                onChangeText={setRepaymentDay}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="23"
                placeholderTextColor={tokens.mutedForeground}
                style={inputStyle}
              />
            </View>
            <View style={{ flex: 1.2, gap: 4 }}>
              <Text style={{ color: tokens.mutedForeground, fontSize: 12.5, paddingLeft: 4 }}>
                {copy("信用额度", "信用額度", "Limit")}
              </Text>
              <TextInput
                value={creditLimitText}
                onChangeText={setCreditLimitText}
                keyboardType="decimal-pad"
                placeholder="50000"
                placeholderTextColor={tokens.mutedForeground}
                style={inputStyle}
              />
            </View>
          </View>
        ) : (
          <View style={{ gap: 5 }}>
            <Text style={{ color: tokens.mutedForeground, fontSize: 12.5, paddingLeft: 4 }}>
              {copy("参考余额（选填）", "參考餘額（選填）", "Balance (optional)")}
            </Text>
            <TextInput
              value={balanceText}
              onChangeText={setBalanceText}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={tokens.mutedForeground}
              style={inputStyle}
            />
          </View>
        )}

        {/* Currency & Card Accent */}
        <View style={{ gap: 8 }}>
          <Text style={{ color: tokens.mutedForeground, fontSize: 12.5, paddingLeft: 4 }}>
            {copy("默认币种与卡片配色", "預設幣種與卡片配色", "Currency & Card tone")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {CURRENCIES.map((code) => {
              const selected = currency === code;
              return (
                <MotionPressable
                  key={code}
                  preset="control"
                  onPress={() => setCurrency(code)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 999,
                    backgroundColor: selected ? activeBg : chipBg,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: selected ? "transparent" : borderColor,
                  }}
                >
                  <Text
                    style={{
                      color: selected ? activeInk : tokens.mutedForeground,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    {code}
                  </Text>
                </MotionPressable>
              );
            })}
          </View>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 9,
              marginTop: 4,
            }}
          >
            <MotionPressable
              preset="control"
              accessibilityLabel={copy("自动匹配银行配色", "自動匹配銀行配色", "Auto card finish")}
              onPress={() => setAccentColor(null)}
              style={{
                paddingHorizontal: 10,
                height: 30,
                borderRadius: 15,
                backgroundColor: accentColor === null ? activeBg : chipBg,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: accentColor === null ? "transparent" : borderColor,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: accentColor === null ? activeInk : tokens.mutedForeground,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {copy("自动", "自動", "Auto")}
              </Text>
            </MotionPressable>
            {PAYMENT_CARD_ACCENTS.map((tone) => {
              const palette = paymentCardAccentPalette(tone, kind);
              const selected = accentColor === tone;
              return (
                <MotionPressable
                  key={tone}
                  preset="icon"
                  accessibilityLabel={tone}
                  onPress={() => setAccentColor(tone)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: palette.bg,
                    borderWidth: selected ? 2.5 : 1,
                    borderColor: selected ? tokens.foreground : borderColor,
                  }}
                />
              );
            })}
          </View>
        </View>

        {/* Default Toggle */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: cardBg,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor,
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ color: tokens.foreground, fontSize: 14.5, fontWeight: "600" }}>
              {copy("设为常用默认支付方式", "設為常用預設支付方式", "Set as default method")}
            </Text>
            <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
              {copy(
                "记账时自动预选此方式",
                "記帳時自動預選此方式",
                "Pre-selected when logging bills",
              )}
            </Text>
          </View>
          <NativeSwitch
            accessibilityLabel={copy(
              "设为常用默认支付方式",
              "設為常用預設支付方式",
              "Set as default method",
            )}
            value={isDefault}
            onValueChange={setIsDefault}
          />
        </View>

        {error ? (
          <Text accessibilityRole="alert" style={{ color: dangerInk, fontSize: 13 }}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </AppModalSheet>
  );
}
