import { formatCents } from "@rakazo/contracts";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import type { ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";
import { useI18n } from "../lib/i18n";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";
import type { PersonalFinanceState } from "../lib/personal-finance";
import {
  refreshPersonalFinance,
  setFinanceHideAmounts,
  usePersonalFinance,
} from "../lib/personal-finance";
import { soonestCreditCardRepayment } from "../lib/personal-finance-ui";
import { MotionPressable } from "./motion-pressable";
import { NativeSymbol } from "./native-symbol";
import { WalletCardStack } from "./wallet-card-stack";

export type HomeFinanceCardProps = {
  cardStyle: ViewStyle;
  /** Optional state override for deterministic previews and unit tests. */
  financeState?: PersonalFinanceState;
};

export function HomeFinanceCard({ cardStyle, financeState }: HomeFinanceCardProps) {
  const router = useRouter();
  const tokens = useMobileTokens();
  const appearance = useResolvedAppearance();
  const { locale } = useI18n();
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  const copy = (zhHans: string, zhHant: string, en: string) =>
    chinese ? (traditional ? zhHant : zhHans) : en;

  const liveState = usePersonalFinance();
  const state = financeState ?? liveState;

  useEffect(() => {
    if (financeState !== undefined) return;
    void refreshPersonalFinance();
  }, [financeState]);

  const isLight = appearance === "light";
  const chipBg = isLight ? "#F8F6F2" : "#2A303B";
  const chipBorder = isLight ? "rgba(38, 35, 31, 0.08)" : "rgba(245, 244, 240, 0.12)";
  const primaryBg = isLight ? "#2E2B27" : "#E7E4DD";
  const primaryInk = isLight ? "#FAF8F4" : "#15171C";
  const softAccentInk = isLight ? "#6E675E" : "#B8B3AA";
  const dividerColor = isLight ? "rgba(38, 35, 31, 0.08)" : "rgba(245, 244, 240, 0.10)";
  const warnBg = isLight ? "rgba(194, 120, 3, 0.10)" : "rgba(245, 179, 66, 0.16)";
  const warnInk = isLight ? "#9A5B02" : "#F5C469";

  const { summary, methods, hideAmounts } = state;
  const currency = summary.currency || "CNY";
  const expenseDisplay = hideAmounts ? "••••" : formatCents(summary.totalExpenseCents, currency);
  const incomeDisplay = hideAmounts ? "••••" : formatCents(summary.totalIncomeCents, currency);
  const repaymentHint = soonestCreditCardRepayment(methods, 7);

  const togglePrivacy = () => {
    void setFinanceHideAmounts(!hideAmounts);
  };

  return (
    <View testID="home-hub-finance-section" style={[cardStyle, { padding: 18, gap: 14 }]}>
      {/* Header Row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <MotionPressable
          preset="inline"
          testID="home-hub-finance-header"
          accessibilityRole="button"
          accessibilityLabel={copy("账单与支付", "帳單與支付", "Bills & Wallet")}
          onPress={() => router.push("/finance")}
          style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}
        >
          <NativeSymbol
            ios="creditcard.fill"
            android="wallet-outline"
            size={16}
            color={softAccentInk}
          />
          <Text
            style={{ color: tokens.foreground, fontSize: 15.5, lineHeight: 20, fontWeight: "600" }}
          >
            {copy("账单与支付", "帳單與支付", "Bills & Wallet")}
          </Text>
          <NativeSymbol
            ios="chevron.right"
            android="chevron-forward"
            size={12}
            color={tokens.mutedForeground}
          />
        </MotionPressable>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <MotionPressable
            preset="icon"
            testID="home-hub-finance-privacy"
            accessibilityRole="button"
            accessibilityLabel={
              hideAmounts
                ? copy("显示金额", "顯示金額", "Show amounts")
                : copy("隐藏金额", "隱藏金額", "Hide amounts")
            }
            onPress={togglePrivacy}
            hitSlop={6}
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: chipBg,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: chipBorder,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <NativeSymbol
              ios={hideAmounts ? "eye.slash" : "eye"}
              android={hideAmounts ? "eye-off-outline" : "eye-outline"}
              size={14}
              color={tokens.mutedForeground}
            />
          </MotionPressable>
        </View>
      </View>

      {/* Main Summary Body */}
      <MotionPressable
        preset="card"
        testID="home-hub-finance-card"
        accessibilityRole="button"
        accessibilityLabel={copy(
          `账单与支付，本月支出 ${expenseDisplay}，${methods.length} 个支付方式`,
          `帳單與支付，本月支出 ${expenseDisplay}，${methods.length} 個支付方式`,
          `Bills & Wallet, monthly spend ${expenseDisplay}, ${methods.length} payment methods`,
        )}
        onPress={() => router.push("/finance")}
        style={{ gap: 12 }}
      >
        <View style={{ flexDirection: "row", alignItems: "stretch", gap: 14 }}>
          {/* Monthly Expense Column */}
          <View style={{ flex: 1.25, minWidth: 0, gap: 4 }}>
            <Text style={{ color: tokens.mutedForeground, fontSize: 12.5, lineHeight: 16 }}>
              {copy("本月支出", "本月支出", "Spent this month")}
            </Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{
                color: tokens.foreground,
                fontSize: 26,
                lineHeight: 32,
                fontWeight: "700",
                fontVariant: ["tabular-nums"],
              }}
            >
              {expenseDisplay}
            </Text>
            <Text
              numberOfLines={1}
              style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 16 }}
            >
              {summary.billCount > 0
                ? copy(
                    `${summary.billCount} 笔账单 · 收入 ${incomeDisplay}`,
                    `${summary.billCount} 筆帳單 · 收入 ${incomeDisplay}`,
                    `${summary.billCount} bills · In ${incomeDisplay}`,
                  )
                : copy(
                    "随时记账或让 Bot 帮你记",
                    "隨時記帳或讓 Bot 幫你記",
                    "Log bills manually or via bot",
                  )}
            </Text>
          </View>

          <View
            style={{
              width: StyleSheet.hairlineWidth,
              backgroundColor: dividerColor,
              marginVertical: 2,
            }}
          />

          {/* Saved Payment Methods Column */}
          <View style={{ flex: 0.9, minWidth: 0, gap: 4 }}>
            <Text style={{ color: tokens.mutedForeground, fontSize: 12.5, lineHeight: 16 }}>
              {copy("支付方式", "支付方式", "Methods")}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
              <Text
                style={{
                  color: tokens.foreground,
                  fontSize: 26,
                  lineHeight: 32,
                  fontWeight: "700",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {methods.length}
              </Text>
              <Text style={{ color: tokens.mutedForeground, fontSize: 12.5 }}>
                {copy("项已存", "項已存", "saved")}
              </Text>
            </View>
            <Text
              numberOfLines={1}
              style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 16 }}
            >
              {methods.length > 0
                ? copy("银行卡加密隔离", "銀行卡加密隔離", "Encrypted vault")
                : copy("存银行卡 / 支付账号", "存銀行卡 / 支付帳號", "Cards & wallets")}
            </Text>
          </View>
        </View>

        {/* Upcoming Credit Card Repayment Hint */}
        {repaymentHint ? (
          <View
            testID="home-hub-finance-repayment-hint"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 12,
              backgroundColor: warnBg,
            }}
          >
            <NativeSymbol
              ios="calendar.badge.clock"
              android="time-outline"
              size={13}
              color={warnInk}
            />
            <Text
              numberOfLines={1}
              style={{ color: warnInk, fontSize: 12, fontWeight: "600", flex: 1 }}
            >
              {repaymentHint.daysLeft === 0
                ? copy(
                    `${repaymentHint.label} 今日还款日（每月 ${repaymentHint.repaymentDay} 日）`,
                    `${repaymentHint.label} 今日還款日（每月 ${repaymentHint.repaymentDay} 日）`,
                    `${repaymentHint.label} repayment due today`,
                  )
                : copy(
                    `${repaymentHint.label} 距还款日还有 ${repaymentHint.daysLeft} 天（${repaymentHint.repaymentDay} 日）`,
                    `${repaymentHint.label} 距還款日還有 ${repaymentHint.daysLeft} 天（${repaymentHint.repaymentDay} 日）`,
                    `${repaymentHint.label} due in ${repaymentHint.daysLeft}d (day ${repaymentHint.repaymentDay})`,
                  )}
            </Text>
          </View>
        ) : null}
      </MotionPressable>

      {/* Compact Apple Wallet Stacked Card Preview — single tap opens focused card */}
      {methods.length > 0 ? (
        <WalletCardStack
          compact
          maxCompactCards={4}
          methods={methods}
          hideAmounts={hideAmounts}
          onSelectCard={(method) =>
            router.push({
              pathname: "/finance",
              params: { tab: "methods", cardId: method.id },
            })
          }
        />
      ) : null}

      {/* Quick Action Buttons */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <MotionPressable
          preset="control"
          testID="home-hub-finance-add-bill"
          accessibilityRole="button"
          accessibilityLabel={copy("记一笔账单", "記一筆帳單", "Add a bill")}
          onPress={() =>
            router.push({ pathname: "/finance", params: { tab: "bills", action: "add-bill" } })
          }
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: primaryBg,
          }}
        >
          <NativeSymbol ios="plus" android="add" size={13} color={primaryInk} />
          <Text style={{ color: primaryInk, fontSize: 13, lineHeight: 17, fontWeight: "600" }}>
            {copy("记一笔", "記一筆", "Add bill")}
          </Text>
        </MotionPressable>

        <MotionPressable
          preset="control"
          testID="home-hub-finance-methods"
          accessibilityRole="button"
          accessibilityLabel={copy(
            "支付方式与银行卡",
            "支付方式與銀行卡",
            "Payment methods & cards",
          )}
          onPress={() => router.push({ pathname: "/finance", params: { tab: "methods" } })}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: chipBg,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: chipBorder,
          }}
        >
          <NativeSymbol
            ios="creditcard"
            android="card-outline"
            size={13}
            color={tokens.foreground}
          />
          <Text
            style={{ color: tokens.foreground, fontSize: 13, lineHeight: 17, fontWeight: "500" }}
          >
            {copy("支付方式 / 卡包", "支付方式 / 卡包", "Cards & Wallet")}
          </Text>
        </MotionPressable>
      </View>
    </View>
  );
}
