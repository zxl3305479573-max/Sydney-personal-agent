import type {
  FinanceBill,
  PaymentMethodSensitivePayload,
  PaymentMethodSummary,
} from "@rakazo/contracts";
import {
  daysUntilMonthlyDay,
  formatCardNumberGrouped,
  formatCents,
  isIdentityConfirmationRequired,
} from "@rakazo/contracts";
import * as Clipboard from "expo-clipboard";
import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "../lib/i18n";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";
import { revealPaymentMethodSecrets } from "../lib/personal-finance";
import {
  billCategoryLabel,
  billCategorySymbol,
  buildBankTransferShareText,
  formatBillDayLabel,
  paymentMethodKindLabel,
  paymentMethodSymbol,
  resolveWalletCardVisual,
} from "../lib/personal-finance-ui";
import { errorText } from "../lib/user-error";
import { useIdentityConfirmation } from "./confirm-identity";
import { MotionPressable } from "./motion-pressable";
import { NativeSymbol } from "./native-symbol";
import { WALLET_CARD_HEIGHT, WalletCardFace } from "./wallet-card-face";

export type WalletCardFocusModalProps = {
  method: PaymentMethodSummary | null;
  otherMethods: readonly PaymentMethodSummary[];
  bills: readonly FinanceBill[];
  hideAmounts?: boolean;
  onClose: () => void;
  onEdit: (method: PaymentMethodSummary) => void;
  onSetDefault: (method: PaymentMethodSummary) => Promise<void>;
  onAddBillWithCard: (method: PaymentMethodSummary) => void;
  onFilterBills: (method: PaymentMethodSummary) => void;
  onSelectBill: (bill: FinanceBill) => void;
  onDelete: (method: PaymentMethodSummary) => Promise<void>;
};

/**
 * Apple Wallet single-tap expanded card stage:
 * - Top-left circular `×` close button
 * - Top-right unified pill capsule with `[123 | ···]` (reveal card number & secrets / actions menu)
 * - Selected card floats at top in full ISO-7810 ratio with soft drop shadow
 * - Info card, revealed encrypted details, and linked recent bills glide in below
 * - Remaining cards tuck cleanly at the bottom edge; tapping them returns to the stacked deck
 */
export function WalletCardFocusModal({
  method,
  otherMethods,
  bills,
  hideAmounts = false,
  onClose,
  onEdit,
  onSetDefault,
  onAddBillWithCard,
  onFilterBills,
  onSelectBill,
  onDelete,
}: WalletCardFocusModalProps) {
  const insets = useSafeAreaInsets();
  const tokens = useMobileTokens();
  const appearance = useResolvedAppearance();
  const { locale, t } = useI18n();
  const zh = locale.startsWith("zh");
  const tw = locale === "zh-TW";
  const copy = (cn: string, hant: string, en: string) => (zh ? (tw ? hant : cn) : en);

  const [revealed, setRevealed] = useState<PaymentMethodSensitivePayload | null>(null);
  const [loadingReveal, setLoadingReveal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);
  const [infoDismissed, setInfoDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { withIdentityConfirmation, identityDialog } = useIdentityConfirmation();

  // Smooth Apple-Wallet spring entrance for the focused card and info cards below
  const cardLift = useSharedValue(28);
  const cardScale = useSharedValue(0.95);
  const detailsOpacity = useSharedValue(0);
  const detailsShift = useSharedValue(18);
  const methodId = method?.id ?? null;

  useEffect(() => {
    setRevealed(null);
    setMenuOpen(false);
    setError(null);
    setCopiedNotice(null);
    setLoadingReveal(false);
    if (methodId === null) {
      setInfoDismissed(false);
      return;
    }
    setInfoDismissed(false);
  }, [methodId]);

  useEffect(() => {
    if (!methodId) return;
    cardLift.value = 34;
    cardScale.value = 0.94;
    detailsOpacity.value = 0;
    detailsShift.value = 20;

    cardLift.value = withSpring(0, { damping: 20, stiffness: 220, mass: 0.9 });
    cardScale.value = withSpring(1, { damping: 20, stiffness: 220, mass: 0.9 });
    detailsOpacity.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
    detailsShift.value = withSpring(0, { damping: 22, stiffness: 210 });
  }, [methodId, cardLift, cardScale, detailsOpacity, detailsShift]);

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cardLift.value }, { scale: cardScale.value }],
  }));

  const detailsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: detailsOpacity.value,
    transform: [{ translateY: detailsShift.value }],
  }));

  const cardBills = useMemo(() => {
    if (!method) return [];
    return bills.filter((bill) => bill.paymentMethodId === method.id).slice(0, 8);
  }, [bills, method]);

  if (!method) return null;

  const isLight = appearance === "light";
  const stageBg = isLight ? "#F2F2F7" : "#12141A";
  const pillBg = isLight ? "rgba(255, 255, 255, 0.92)" : "rgba(38, 42, 52, 0.92)";
  const pillBorder = isLight ? "rgba(20, 22, 28, 0.08)" : "rgba(245, 244, 240, 0.14)";
  const panelBg = isLight ? "#FFFFFF" : "#1E222B";
  const chipBg = isLight ? "#F4F3F0" : "#2A303B";
  const dangerInk = isLight ? "#D92D20" : "#F97066";
  const incomeInk = isLight ? "#2E6F4E" : "#8ADBA9";
  const visual = resolveWalletCardVisual({
    accent: method.accentColor,
    kind: method.kind,
    label: method.label,
    institution: method.institution,
  });
  const sym = paymentMethodSymbol(method.kind);
  const daysUntilDue =
    method.kind === "credit_card" && method.repaymentDay
      ? daysUntilMonthlyDay(method.repaymentDay)
      : null;

  const closeSafely = () => {
    setRevealed(null);
    setMenuOpen(false);
    onClose();
  };

  const copyValue = async (label: string, value: string) => {
    try {
      await Clipboard.setStringAsync(value);
      setCopiedNotice(copy(`已复制 ${label}`, `已複製 ${label}`, `Copied ${label}`));
    } catch {
      setCopiedNotice(copy("复制失败", "複製失敗", "Copy failed"));
    }
  };

  const handleToggleReveal = async () => {
    if (loadingReveal) return;
    if (revealed) {
      setRevealed(null);
      return;
    }
    if (!method.hasSensitiveDetails) {
      setError(
        copy(
          "该卡片尚未填写完整卡号或私密信息，点击右上角「··· → 编辑」即可补充。",
          "該卡片尚未填寫完整卡號或私密資訊，點擊右上角「··· → 編輯」即可補充。",
          "No encrypted details saved for this card yet. Tap ··· → Edit to add them.",
        ),
      );
      return;
    }
    setLoadingReveal(true);
    setError(null);
    try {
      const secrets = await withIdentityConfirmation(() => revealPaymentMethodSecrets(method.id));
      setRevealed(secrets);
    } catch (err) {
      if (!isIdentityConfirmationRequired(err)) {
        setError(
          errorText(err, copy("无法解密卡片信息", "無法解密卡片資訊", "Could not decrypt details")),
        );
      }
    } finally {
      setLoadingReveal(false);
    }
  };

  const confirmDelete = () => {
    if (busy) return;
    setMenuOpen(false);
    Alert.alert(
      copy(`删除「${method.label}」？`, `刪除「${method.label}」？`, `Delete ${method.label}?`),
      copy(
        "已关联的历史账单仍会保留，仅清除此支付方式及加密卡片信息。",
        "已關聯的歷史帳單仍會保留，僅清除此支付方式及加密卡片資訊。",
        "Linked historical bills stay intact; only this card and its encrypted details will be deleted.",
      ),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: copy("删除", "刪除", "Delete"),
          style: "destructive",
          onPress: () => {
            setBusy(true);
            void onDelete(method)
              .then(() => closeSafely())
              .catch((err) =>
                setError(errorText(err, copy("删除失败", "刪除失敗", "Delete failed"))),
              )
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  };

  const infoTitle = method.institution
    ? copy(
        `来自：${method.institution}`,
        `來自：${method.institution}`,
        `From ${method.institution}`,
      )
    : paymentMethodKindLabel(method.kind, locale);

  const infoLines: string[] = [];
  if (method.holderName) {
    infoLines.push(
      copy(`持卡人 ${method.holderName}`, `持卡人 ${method.holderName}`, method.holderName),
    );
  }
  if (method.billingDay || method.repaymentDay) {
    infoLines.push(
      copy(
        `账单日 ${method.billingDay ?? "—"}日 · 还款日 ${method.repaymentDay ?? "—"}日${daysUntilDue !== null ? `（距还款 ${daysUntilDue} 天）` : ""}`,
        `帳單日 ${method.billingDay ?? "—"}日 · 還款日 ${method.repaymentDay ?? "—"}日`,
        `Bill day ${method.billingDay ?? "—"} · Due day ${method.repaymentDay ?? "—"}`,
      ),
    );
  }
  if (method.creditLimitCents != null) {
    infoLines.push(
      `${copy("信用额度", "信用額度", "Limit")} ${hideAmounts ? "••••" : formatCents(method.creditLimitCents, method.currency)}`,
    );
  }
  if (method.balanceCents != null) {
    infoLines.push(
      `${copy("当前余额", "目前餘額", "Balance")} ${hideAmounts ? "••••" : formatCents(method.balanceCents, method.currency)}`,
    );
  }
  const infoSubtitle =
    infoLines.length > 0
      ? infoLines.join(" · ")
      : copy(
          `「${method.label}」已加密保存，仅你自己可见，绝不向任何 Bot 暴露。`,
          `「${method.label}」已加密儲存，僅你自己可見，絕不向任何 Bot 暴露。`,
          `${method.label} is encrypted at rest and never exposed to bots.`,
        );

  return (
    <>
      <Modal
        visible={Boolean(method)}
        animationType="fade"
        transparent={false}
        onRequestClose={closeSafely}
      >
        <View
          testID="wallet-card-focus-stage"
          style={{
            flex: 1,
            backgroundColor: stageBg,
            paddingTop: Math.max(insets.top, 16) + 6,
          }}
        >
          {/* Apple Wallet Top Floating Action Bar: Left (×) and Right ([123 | ···]) */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 18,
              paddingBottom: 14,
            }}
          >
            <MotionPressable
              preset="icon"
              testID="wallet-focus-close"
              accessibilityRole="button"
              accessibilityLabel={copy("返回卡包", "返回卡包", "Close card")}
              onPress={closeSafely}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: pillBg,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: pillBorder,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: "#000000",
                shadowOpacity: isLight ? 0.08 : 0.25,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 3 },
              }}
            >
              <NativeSymbol ios="xmark" android="close" size={18} color={tokens.foreground} />
            </MotionPressable>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                height: 42,
                borderRadius: 21,
                backgroundColor: pillBg,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: pillBorder,
                paddingHorizontal: 6,
                shadowColor: "#000000",
                shadowOpacity: isLight ? 0.08 : 0.25,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 3 },
              }}
            >
              <MotionPressable
                preset="icon"
                testID="wallet-focus-reveal-123"
                accessibilityRole="button"
                accessibilityLabel={
                  revealed
                    ? copy("隐藏完整卡号", "隱藏完整卡號", "Hide card number")
                    : copy("查看完整卡号与安全码", "查看完整卡號與安全碼", "Show card number")
                }
                disabled={loadingReveal}
                onPress={() => void handleToggleReveal()}
                style={{
                  paddingHorizontal: 14,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: revealed ? chipBg : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <NativeSymbol
                  ios={revealed ? "eye.slash" : "creditcard.and.123"}
                  android={revealed ? "eye-off-outline" : "card-outline"}
                  size={20}
                  color={tokens.foreground}
                />
              </MotionPressable>

              <View
                style={{
                  width: StyleSheet.hairlineWidth,
                  height: 18,
                  backgroundColor: pillBorder,
                }}
              />

              <MotionPressable
                preset="icon"
                testID="wallet-focus-more"
                accessibilityRole="button"
                accessibilityLabel={copy("更多卡片操作", "更多卡片操作", "More card actions")}
                onPress={() => setMenuOpen((prev) => !prev)}
                style={{
                  paddingHorizontal: 14,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: menuOpen ? chipBg : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <NativeSymbol
                  ios="ellipsis"
                  android="ellipsis-horizontal"
                  size={19}
                  color={tokens.foreground}
                />
              </MotionPressable>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 18,
              paddingBottom: otherMethods.length > 0 ? 84 : Math.max(insets.bottom, 24) + 20,
              gap: 14,
            }}
          >
            {/* Floating More Menu Drawer */}
            {menuOpen ? (
              <View
                testID="wallet-focus-more-menu"
                style={{
                  backgroundColor: panelBg,
                  borderRadius: 18,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: pillBorder,
                  overflow: "hidden",
                }}
              >
                <MotionPressable
                  preset="card"
                  onPress={() => {
                    setMenuOpen(false);
                    setRevealed(null);
                    onEdit(method);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 16,
                    paddingVertical: 13,
                  }}
                >
                  <Text style={{ color: tokens.foreground, fontSize: 15, fontWeight: "500" }}>
                    {copy("编辑卡片信息", "編輯卡片資訊", "Edit card details")}
                  </Text>
                  <NativeSymbol
                    ios="pencil"
                    android="create-outline"
                    size={16}
                    color={tokens.mutedForeground}
                  />
                </MotionPressable>

                {!method.isDefault ? (
                  <MotionPressable
                    preset="card"
                    disabled={busy}
                    onPress={() => {
                      setMenuOpen(false);
                      setBusy(true);
                      void onSetDefault(method).finally(() => setBusy(false));
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingHorizontal: 16,
                      paddingVertical: 13,
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: pillBorder,
                    }}
                  >
                    <Text style={{ color: tokens.foreground, fontSize: 15, fontWeight: "500" }}>
                      {copy("设为默认卡片（置于最前）", "設為預設卡片", "Set as primary card")}
                    </Text>
                    <NativeSymbol
                      ios="star"
                      android="star-outline"
                      size={16}
                      color={tokens.mutedForeground}
                    />
                  </MotionPressable>
                ) : null}

                <MotionPressable
                  preset="card"
                  onPress={() => {
                    closeSafely();
                    onFilterBills(method);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 16,
                    paddingVertical: 13,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: pillBorder,
                  }}
                >
                  <Text style={{ color: tokens.foreground, fontSize: 15, fontWeight: "500" }}>
                    {copy(
                      "在账单页筛选此卡全部消费",
                      "在帳單頁篩選此卡全部消費",
                      "Filter all bills by this card",
                    )}
                  </Text>
                  <NativeSymbol
                    ios="list.bullet"
                    android="receipt-outline"
                    size={16}
                    color={tokens.mutedForeground}
                  />
                </MotionPressable>

                <MotionPressable
                  preset="card"
                  disabled={busy}
                  onPress={confirmDelete}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 16,
                    paddingVertical: 13,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: pillBorder,
                  }}
                >
                  <Text style={{ color: dangerInk, fontSize: 15, fontWeight: "600" }}>
                    {copy("删除此卡片", "刪除此卡片", "Remove card")}
                  </Text>
                  <NativeSymbol ios="trash" android="trash-outline" size={16} color={dangerInk} />
                </MotionPressable>
              </View>
            ) : null}

            {/* Hero Expanded Card with soft Apple Wallet drop shadow */}
            <Animated.View
              style={[
                cardAnimatedStyle,
                {
                  borderRadius: 18,
                  shadowColor: "#000000",
                  shadowOpacity: isLight ? 0.16 : 0.42,
                  shadowRadius: 20,
                  shadowOffset: { width: 0, height: 10 },
                  elevation: 8,
                },
              ]}
            >
              <WalletCardFace
                method={method}
                revealedNumber={revealed?.accountNumber ?? null}
                hideAmounts={hideAmounts}
                height={WALLET_CARD_HEIGHT}
              />
            </Animated.View>

            {/* Below-card Apple Wallet Info & Activity Stack */}
            <Animated.View style={[detailsAnimatedStyle, { gap: 12 }]}>
              {/* Apple Wallet style Info Banner Card (matches Screenshot 2 "来自：Bybit" card) */}
              {!infoDismissed ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    backgroundColor: panelBg,
                    borderRadius: 20,
                    padding: 15,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: pillBorder,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 11,
                      backgroundColor: visual.isLightCard ? "#1A1B1E" : visual.bg,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <NativeSymbol ios={sym.ios} android={sym.android} size={20} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <Text
                      numberOfLines={1}
                      style={{ color: tokens.foreground, fontSize: 15, fontWeight: "700" }}
                    >
                      {infoTitle}
                    </Text>
                    <Text style={{ color: tokens.mutedForeground, fontSize: 13, lineHeight: 18 }}>
                      {infoSubtitle}
                    </Text>
                  </View>
                  <MotionPressable
                    preset="icon"
                    accessibilityLabel={copy("隐藏卡片提示", "隱藏卡片提示", "Dismiss card notice")}
                    onPress={() => setInfoDismissed(true)}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      backgroundColor: chipBg,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <NativeSymbol
                      ios="xmark"
                      android="close"
                      size={12}
                      color={tokens.mutedForeground}
                    />
                  </MotionPressable>
                </View>
              ) : null}

              {error ? (
                <Text
                  accessibilityRole="alert"
                  style={{ color: dangerInk, fontSize: 13, paddingHorizontal: 4 }}
                >
                  {error}
                </Text>
              ) : null}

              {/* Revealed Encrypted Details Panel (appears when tapping top-right 123 button) */}
              {revealed ? (
                <View
                  testID="wallet-focus-revealed-box"
                  style={{
                    backgroundColor: panelBg,
                    borderRadius: 20,
                    padding: 16,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: pillBorder,
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text style={{ color: tokens.foreground, fontSize: 14.5, fontWeight: "700" }}>
                      {copy(
                        "卡片私密信息（已解密）",
                        "卡片私密資訊（已解密）",
                        "Card Numbers & Details",
                      )}
                    </Text>
                    <MotionPressable preset="inline" onPress={() => setRevealed(null)}>
                      <Text
                        style={{ color: tokens.mutedForeground, fontSize: 12.5, fontWeight: "600" }}
                      >
                        {copy("隐藏", "隱藏", "Hide")}
                      </Text>
                    </MotionPressable>
                  </View>

                  {revealed.accountNumber ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: tokens.mutedForeground, fontSize: 11.5 }}>
                          {copy("完整卡号 / 账号", "完整卡號 / 帳號", "Card / Account number")}
                        </Text>
                        <Text
                          selectable
                          style={{
                            color: tokens.foreground,
                            fontSize: 15,
                            fontWeight: "600",
                            fontVariant: ["tabular-nums"],
                          }}
                        >
                          {formatCardNumberGrouped(revealed.accountNumber)}
                        </Text>
                      </View>
                      <MotionPressable
                        preset="control"
                        onPress={() =>
                          void copyValue(copy("卡号", "卡號", "number"), revealed.accountNumber!)
                        }
                        style={{
                          paddingHorizontal: 11,
                          paddingVertical: 6,
                          borderRadius: 999,
                          backgroundColor: chipBg,
                        }}
                      >
                        <Text style={{ color: tokens.foreground, fontSize: 12, fontWeight: "600" }}>
                          {copy("复制", "複製", "Copy")}
                        </Text>
                      </MotionPressable>
                    </View>
                  ) : null}

                  {revealed.expiryMonth || revealed.expiryYear || revealed.cvv ? (
                    <View style={{ flexDirection: "row", gap: 16 }}>
                      {revealed.expiryMonth || revealed.expiryYear ? (
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: tokens.mutedForeground, fontSize: 11.5 }}>
                            {copy("有效期", "有效期", "Expiry")}
                          </Text>
                          <Text
                            selectable
                            style={{
                              color: tokens.foreground,
                              fontSize: 15,
                              fontWeight: "600",
                              fontVariant: ["tabular-nums"],
                            }}
                          >
                            {`${revealed.expiryMonth ?? "--"}/${revealed.expiryYear ?? "--"}`}
                          </Text>
                        </View>
                      ) : null}
                      {revealed.cvv ? (
                        <View
                          style={{
                            flex: 1,
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <View>
                            <Text style={{ color: tokens.mutedForeground, fontSize: 11.5 }}>
                              CVV
                            </Text>
                            <Text
                              selectable
                              style={{
                                color: tokens.foreground,
                                fontSize: 15,
                                fontWeight: "600",
                                fontVariant: ["tabular-nums"],
                              }}
                            >
                              {revealed.cvv}
                            </Text>
                          </View>
                          <MotionPressable
                            preset="control"
                            onPress={() => void copyValue("CVV", revealed.cvv!)}
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: 999,
                              backgroundColor: chipBg,
                            }}
                          >
                            <Text
                              style={{
                                color: tokens.foreground,
                                fontSize: 11.5,
                                fontWeight: "600",
                              }}
                            >
                              {copy("复制", "複製", "Copy")}
                            </Text>
                          </MotionPressable>
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  {revealed.branchName ? (
                    <View style={{ gap: 2 }}>
                      <Text style={{ color: tokens.mutedForeground, fontSize: 11.5 }}>
                        {copy("开户行 / 支行", "開戶行 / 支行", "Branch")}
                      </Text>
                      <Text selectable style={{ color: tokens.foreground, fontSize: 14 }}>
                        {revealed.branchName}
                      </Text>
                    </View>
                  ) : null}

                  {revealed.phoneNumber ? (
                    <View style={{ gap: 2 }}>
                      <Text style={{ color: tokens.mutedForeground, fontSize: 11.5 }}>
                        {copy("预留手机号", "預留手機號", "Phone")}
                      </Text>
                      <Text selectable style={{ color: tokens.foreground, fontSize: 14 }}>
                        {revealed.phoneNumber}
                      </Text>
                    </View>
                  ) : null}

                  {revealed.note ? (
                    <View style={{ gap: 2 }}>
                      <Text style={{ color: tokens.mutedForeground, fontSize: 11.5 }}>
                        {copy("私密备注", "私密備註", "Private note")}
                      </Text>
                      <Text
                        selectable
                        style={{ color: tokens.foreground, fontSize: 14, lineHeight: 20 }}
                      >
                        {revealed.note}
                      </Text>
                    </View>
                  ) : null}

                  {revealed.accountNumber ? (
                    <MotionPressable
                      preset="control"
                      onPress={() =>
                        void copyValue(
                          copy("完整转账信息", "完整轉帳資訊", "transfer details"),
                          buildBankTransferShareText(method, revealed),
                        )
                      }
                      style={{
                        alignItems: "center",
                        paddingVertical: 10,
                        borderRadius: 12,
                        backgroundColor: chipBg,
                      }}
                    >
                      <Text style={{ color: tokens.foreground, fontSize: 13, fontWeight: "600" }}>
                        {copy(
                          "一键复制完整转账信息（户名+卡号+开户行）",
                          "一鍵複製完整轉帳資訊",
                          "Copy full bank transfer info",
                        )}
                      </Text>
                    </MotionPressable>
                  ) : null}

                  {copiedNotice ? (
                    <Text
                      style={{ color: tokens.mutedForeground, fontSize: 12, textAlign: "center" }}
                    >
                      {copiedNotice}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {/* Latest Transactions / Bills for this Card (Apple Wallet style) */}
              <View style={{ gap: 8, marginTop: 4 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 4,
                  }}
                >
                  <Text style={{ color: tokens.foreground, fontSize: 15, fontWeight: "700" }}>
                    {copy("最新交易", "最新交易", "Latest Transactions")}
                  </Text>
                  <MotionPressable
                    preset="control"
                    testID="wallet-focus-add-bill"
                    onPress={() => {
                      closeSafely();
                      onAddBillWithCard(method);
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 999,
                      backgroundColor: panelBg,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: pillBorder,
                    }}
                  >
                    <NativeSymbol ios="plus" android="add" size={11} color={tokens.foreground} />
                    <Text style={{ color: tokens.foreground, fontSize: 12, fontWeight: "600" }}>
                      {copy("用此卡记一笔", "用此卡記一筆", "Add bill")}
                    </Text>
                  </MotionPressable>
                </View>

                <View
                  style={{
                    backgroundColor: panelBg,
                    borderRadius: 20,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: pillBorder,
                    overflow: "hidden",
                  }}
                >
                  {cardBills.length === 0 ? (
                    <View style={{ padding: 20, alignItems: "center", gap: 6 }}>
                      <Text style={{ color: tokens.mutedForeground, fontSize: 13.5 }}>
                        {copy(
                          "该支付方式暂无关联账单",
                          "該支付方式暫無關聯帳單",
                          "No transactions recorded on this card yet",
                        )}
                      </Text>
                    </View>
                  ) : (
                    cardBills.map((bill, idx) => {
                      const catSym = billCategorySymbol(bill.category);
                      const prefix =
                        bill.direction === "expense" ? "-" : bill.direction === "income" ? "+" : "";
                      return (
                        <MotionPressable
                          key={bill.id}
                          preset="card"
                          onPress={() => {
                            closeSafely();
                            onSelectBill(bill);
                          }}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 12,
                            paddingHorizontal: 16,
                            paddingVertical: 13,
                            borderTopWidth: idx === 0 ? 0 : StyleSheet.hairlineWidth,
                            borderTopColor: pillBorder,
                          }}
                        >
                          <View
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 17,
                              backgroundColor: chipBg,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <NativeSymbol
                              ios={catSym.ios}
                              android={catSym.android}
                              size={15}
                              color={catSym.color}
                            />
                          </View>
                          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                            <Text
                              numberOfLines={1}
                              style={{
                                color: tokens.foreground,
                                fontSize: 14.5,
                                fontWeight: "600",
                              }}
                            >
                              {bill.title}
                            </Text>
                            <Text
                              numberOfLines={1}
                              style={{ color: tokens.mutedForeground, fontSize: 12 }}
                            >
                              {`${billCategoryLabel(bill.category, locale)} · ${formatBillDayLabel(bill.occurredAt, locale)}`}
                            </Text>
                          </View>
                          <Text
                            style={{
                              color: bill.direction === "income" ? incomeInk : tokens.foreground,
                              fontSize: 14.5,
                              fontWeight: "700",
                              fontVariant: ["tabular-nums"],
                            }}
                          >
                            {hideAmounts
                              ? "••••"
                              : `${prefix}${formatCents(bill.amountCents, bill.currency)}`}
                          </Text>
                        </MotionPressable>
                      );
                    })
                  )}
                </View>
              </View>
            </Animated.View>
          </ScrollView>

          {/* Bottom Collapsed Other-Cards Peek Dock (Apple Wallet signature — tap to return to deck) */}
          {otherMethods.length > 0 ? (
            <MotionPressable
              preset="card"
              testID="wallet-focus-bottom-stack"
              accessibilityRole="button"
              accessibilityLabel={copy("返回其他卡片", "返回其他卡片", "Return to all cards")}
              onPress={closeSafely}
              style={{
                position: "absolute",
                left: 18,
                right: 18,
                bottom: 0,
                height: Math.max(insets.bottom, 12) + 34,
                overflow: "hidden",
              }}
            >
              {otherMethods.slice(0, 3).map((other, idx) => {
                const otherVisual = resolveWalletCardVisual({
                  accent: other.accentColor,
                  kind: other.kind,
                  label: other.label,
                  institution: other.institution,
                });
                return (
                  <View
                    key={other.id}
                    style={{
                      position: "absolute",
                      top: idx * 8,
                      left: 0,
                      right: 0,
                      height: 48,
                      borderTopLeftRadius: 14,
                      borderTopRightRadius: 14,
                      backgroundColor: otherVisual.bg,
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderLeftWidth: StyleSheet.hairlineWidth,
                      borderRightWidth: StyleSheet.hairlineWidth,
                      borderColor: otherVisual.border,
                      shadowColor: "#000000",
                      shadowOpacity: 0.16,
                      shadowRadius: 6,
                      shadowOffset: { width: 0, height: -2 },
                    }}
                  />
                );
              })}
            </MotionPressable>
          ) : null}
        </View>
      </Modal>
      {identityDialog}
    </>
  );
}
