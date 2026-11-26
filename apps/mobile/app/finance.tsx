import type {
  FinanceBill,
  FinanceBillDirection,
  PaymentMethodKind,
  PaymentMethodSummary,
} from "@rakazo/contracts";
import {
  currentMonthKey,
  formatCents,
  monthKeyFromIso,
  shiftMonthKey,
  summarizeFinanceMonth,
} from "@rakazo/contracts";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FinanceBillSheet } from "../components/finance-bill-sheet";
import { glassHeaderOptions } from "../components/glass-title";
import { MotionPressable } from "../components/motion-pressable";
import { NativeSymbol } from "../components/native-symbol";
import { PaymentMethodSheet } from "../components/payment-method-sheet";
import { WalletCardFocusModal } from "../components/wallet-card-focus-modal";
import { WalletCardStack } from "../components/wallet-card-stack";
import { readableGutters } from "../lib/adaptive-layout";
import { cardGradient } from "../lib/card-gradient";
import { useI18n } from "../lib/i18n";
import { native, useMobileTokens, useResolvedAppearance } from "../lib/native";
import {
  deleteFinanceBill,
  deletePaymentMethod,
  refreshPersonalFinance,
  saveFinanceBill,
  savePaymentMethod,
  setFinanceHideAmounts,
  usePersonalFinance,
} from "../lib/personal-finance";
import {
  billCategoryLabel,
  billCategorySymbol,
  billDirectionLabel,
  billStatusLabel,
  formatMonthHeading,
  groupBillsByDate,
  soonestCreditCardRepayment,
} from "../lib/personal-finance-ui";
import { useScreenBackground } from "../lib/scoped-theme-context";

type FinanceTab = "bills" | "methods";
type MethodFilter = "all" | "bank" | "credit" | "ewallet" | "other";

function matchesMethodFilter(kind: PaymentMethodKind, filter: MethodFilter): boolean {
  if (filter === "all") return true;
  if (filter === "bank") return kind === "debit_card" || kind === "bank_transfer";
  if (filter === "credit") return kind === "credit_card";
  if (filter === "ewallet")
    return kind === "wechat_pay" || kind === "alipay" || kind === "apple_pay" || kind === "paypal";
  return kind === "crypto_wallet" || kind === "other";
}

export default function PersonalFinanceScreen() {
  const params = useLocalSearchParams<{ tab?: string; action?: string; cardId?: string }>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const gutters = readableGutters(windowWidth, { left: insets.left, right: insets.right });
  const tokens = useMobileTokens();
  const appearance = useResolvedAppearance();
  const screenBackground = useScreenBackground(tokens.background);
  const { locale } = useI18n();
  const zh = locale.startsWith("zh");
  const tw = locale === "zh-TW";
  const copy = (cn: string, hant: string, en: string) => (zh ? (tw ? hant : cn) : en);

  const finance = usePersonalFinance();
  const [activeTab, setActiveTab] = useState<FinanceTab>(
    params.tab === "methods" || params.cardId ? "methods" : "bills",
  );
  const [selectedMonth, setSelectedMonth] = useState<string>(() => currentMonthKey());
  const [directionFilter, setDirectionFilter] = useState<FinanceBillDirection | "all">("all");
  const [methodBillFilter, setMethodBillFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState<MethodFilter>("all");
  const [refreshing, setRefreshing] = useState(false);

  // Modal sheets & focused card
  const [billSheetOpen, setBillSheetOpen] = useState(params.action === "add-bill");
  const [editingBill, setEditingBill] = useState<FinanceBill | null>(null);
  const [billPresetMethodId, setBillPresetMethodId] = useState<string | null>(null);
  const [methodSheetOpen, setMethodSheetOpen] = useState(params.action === "add-method");
  const [editingMethod, setEditingMethod] = useState<PaymentMethodSummary | null>(null);
  const [focusedCardId, setFocusedCardId] = useState<string | null>(params.cardId ?? null);

  useEffect(() => {
    if (params.tab === "methods") setActiveTab("methods");
    else if (params.tab === "bills") setActiveTab("bills");
    if (params.cardId) {
      setActiveTab("methods");
      setFocusedCardId(params.cardId);
    }
    if (params.action === "add-bill") {
      setActiveTab("bills");
      setEditingBill(null);
      setBillPresetMethodId(null);
      setBillSheetOpen(true);
    } else if (params.action === "add-method") {
      setActiveTab("methods");
      setEditingMethod(null);
      setMethodSheetOpen(true);
    }
  }, [params.tab, params.action, params.cardId]);

  const focusedMethod = useMemo(
    () => (focusedCardId ? (finance.methods.find((m) => m.id === focusedCardId) ?? null) : null),
    [finance.methods, focusedCardId],
  );
  const otherMethodsForFocus = useMemo(
    () => (focusedCardId ? finance.methods.filter((m) => m.id !== focusedCardId) : []),
    [finance.methods, focusedCardId],
  );

  useFocusEffect(
    useCallback(() => {
      void refreshPersonalFinance({ month: selectedMonth });
    }, [selectedMonth]),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshPersonalFinance({ month: selectedMonth });
    } finally {
      setRefreshing(false);
    }
  };

  const monthSummary = useMemo(
    () => summarizeFinanceMonth(finance.bills, selectedMonth, { methods: finance.methods }),
    [finance.bills, finance.methods, selectedMonth],
  );

  const filteredBills = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return finance.bills.filter((bill) => {
      if (monthKeyFromIso(bill.occurredAt) !== selectedMonth) return false;
      if (directionFilter !== "all" && bill.direction !== directionFilter) return false;
      if (methodBillFilter && bill.paymentMethodId !== methodBillFilter) return false;
      if (q) {
        const hay = [
          bill.title,
          bill.note ?? "",
          bill.paymentMethodLabel ?? "",
          billCategoryLabel(bill.category, locale),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [finance.bills, selectedMonth, directionFilter, methodBillFilter, searchQuery, locale]);

  const groupedBills = useMemo(
    () => groupBillsByDate(filteredBills, locale),
    [filteredBills, locale],
  );

  const filteredMethods = useMemo(
    () => finance.methods.filter((m) => matchesMethodFilter(m.kind, methodFilter)),
    [finance.methods, methodFilter],
  );

  const repaymentHint = useMemo(
    () => soonestCreditCardRepayment(finance.methods, 7),
    [finance.methods],
  );

  const isLight = appearance === "light";
  const cardSurface = {
    backgroundColor: isLight ? "#FFFEFC" : "#242933",
    experimental_backgroundImage: cardGradient(isLight, "pearl"),
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isLight ? "rgba(38, 35, 31, 0.06)" : "rgba(245, 244, 240, 0.10)",
    shadowColor: "#26231F",
    shadowOpacity: isLight ? 0.03 : 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  } as const;
  const chipBg = isLight ? "#F8F6F2" : "#2A303B";
  const chipBorder = isLight ? "rgba(38, 35, 31, 0.08)" : "rgba(245, 244, 240, 0.12)";
  const activeBg = isLight ? "#2E2B27" : "#E7E4DD";
  const activeInk = isLight ? "#FAF8F4" : "#15171C";
  const expenseInk = isLight ? "#1B1916" : "#F6F4EF";
  const incomeInk = isLight ? "#2E6F4E" : "#8ADBA9";
  const warnBg = isLight ? "rgba(194, 120, 3, 0.10)" : "rgba(245, 179, 66, 0.16)";
  const warnInk = isLight ? "#9A5B02" : "#F5C469";
  const safeBg = isLight ? "rgba(46, 111, 78, 0.09)" : "rgba(138, 219, 169, 0.14)";
  const safeInk = isLight ? "#2E6F4E" : "#8ADBA9";
  const botBadgeBg = isLight ? "rgba(44, 110, 173, 0.11)" : "rgba(116, 176, 238, 0.18)";
  const botBadgeInk = isLight ? "#245A8D" : "#8EC5FC";

  const hideAmounts = finance.hideAmounts;
  const maskAmount = (cents: number, currency: string, signed?: boolean) =>
    hideAmounts ? "••••" : formatCents(cents, currency, { signed });

  const thisMonth = currentMonthKey();
  const isCurrentMonth = selectedMonth === thisMonth;

  return (
    <View style={{ flex: 1, backgroundColor: screenBackground }}>
      <Stack.Screen
        options={glassHeaderOptions(copy("账单与支付", "帳單與支付", "Bills & Wallet"))}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        testID="finance-screen-scroll"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 20) + 28,
          paddingLeft: 18 + gutters.left,
          paddingRight: 18 + gutters.right,
          gap: 14,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={native.secondaryLabel}
          />
        }
      >
        {/* Top Segmented Control + Sync Badge + Privacy Toggle */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              backgroundColor: chipBg,
              borderRadius: 999,
              padding: 3,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: chipBorder,
            }}
          >
            {(
              [
                { key: "bills", label: copy("账单明细", "帳單明細", "Bills") },
                {
                  key: "methods",
                  label: copy(
                    `支付方式 (${finance.methods.length})`,
                    `支付方式 (${finance.methods.length})`,
                    `Wallet (${finance.methods.length})`,
                  ),
                },
              ] as const
            ).map((tab) => {
              const selected = activeTab === tab.key;
              return (
                <MotionPressable
                  key={tab.key}
                  preset="control"
                  testID={`finance-tab-${tab.key}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => setActiveTab(tab.key)}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: selected ? activeBg : "transparent",
                  }}
                >
                  <Text
                    style={{
                      color: selected ? activeInk : tokens.mutedForeground,
                      fontSize: 13.5,
                      fontWeight: "600",
                    }}
                  >
                    {tab.label}
                  </Text>
                </MotionPressable>
              );
            })}
          </View>

          <MotionPressable
            preset="icon"
            testID="finance-privacy-toggle"
            accessibilityRole="button"
            accessibilityLabel={
              hideAmounts
                ? copy("显示金额", "顯示金額", "Show amounts")
                : copy("隐藏金额", "隱藏金額", "Hide amounts")
            }
            onPress={() => void setFinanceHideAmounts(!hideAmounts)}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
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
              size={16}
              color={tokens.foreground}
            />
          </MotionPressable>
        </View>

        {/* Sync Status Subtle Line */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 4,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 3.5,
                backgroundColor: finance.syncMode === "cloud" ? safeInk : warnInk,
              }}
            />
            <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
              {finance.syncMode === "cloud"
                ? copy("服务端 AES-256 加密同步", "伺服器 AES-256 加密同步", "Encrypted cloud sync")
                : copy(
                    "本地安全区保存 · 后端就绪后自动同步",
                    "本機安全區儲存 · 後端就緒後自動同步",
                    "Local Keychain mode · Auto-syncs when online",
                  )}
            </Text>
          </View>
          <MotionPressable
            preset="control"
            testID={activeTab === "bills" ? "finance-add-bill-btn" : "finance-add-method-btn"}
            onPress={() => {
              if (activeTab === "bills") {
                setEditingBill(null);
                setBillPresetMethodId(null);
                setBillSheetOpen(true);
              } else {
                setEditingMethod(null);
                setMethodSheetOpen(true);
              }
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: activeBg,
            }}
          >
            <NativeSymbol ios="plus" android="add" size={12} color={activeInk} />
            <Text style={{ color: activeInk, fontSize: 12.5, fontWeight: "600" }}>
              {activeTab === "bills"
                ? copy("记一笔", "記一筆", "Add bill")
                : copy("添加方式", "新增方式", "Add card")}
            </Text>
          </MotionPressable>
        </View>

        {activeTab === "bills" ? (
          <>
            {/* Month Switcher + Hero Summary Card */}
            <View style={[cardSurface, { padding: 18, gap: 14 }]}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <MotionPressable
                  preset="icon"
                  testID="finance-prev-month"
                  accessibilityLabel={copy("上个月", "上個月", "Previous month")}
                  onPress={() => setSelectedMonth((m) => shiftMonthKey(m, -1))}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: chipBg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <NativeSymbol
                    ios="chevron.left"
                    android="chevron-back"
                    size={14}
                    color={tokens.foreground}
                  />
                </MotionPressable>

                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text
                    testID="finance-month-heading"
                    style={{ color: tokens.foreground, fontSize: 16, fontWeight: "700" }}
                  >
                    {formatMonthHeading(selectedMonth, locale)}
                  </Text>
                  {!isCurrentMonth ? (
                    <MotionPressable
                      preset="control"
                      onPress={() => setSelectedMonth(thisMonth)}
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 999,
                        backgroundColor: chipBg,
                      }}
                    >
                      <Text
                        style={{ color: tokens.mutedForeground, fontSize: 11.5, fontWeight: "600" }}
                      >
                        {copy("本月", "本月", "Now")}
                      </Text>
                    </MotionPressable>
                  ) : null}
                </View>

                <MotionPressable
                  preset="icon"
                  testID="finance-next-month"
                  accessibilityLabel={copy("下个月", "下個月", "Next month")}
                  onPress={() => setSelectedMonth((m) => shiftMonthKey(m, 1))}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: chipBg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <NativeSymbol
                    ios="chevron.right"
                    android="chevron-forward"
                    size={14}
                    color={tokens.foreground}
                  />
                </MotionPressable>
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1.2, gap: 3 }}>
                  <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
                    {copy("总支出", "總支出", "Expenses")}
                  </Text>
                  <Text
                    testID="finance-month-expense"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={{
                      color: expenseInk,
                      fontSize: 26,
                      fontWeight: "700",
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {maskAmount(monthSummary.totalExpenseCents, monthSummary.currency)}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
                    {copy("总收入", "總收入", "Income")}
                  </Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={{
                      color: incomeInk,
                      fontSize: 18,
                      fontWeight: "700",
                      fontVariant: ["tabular-nums"],
                      marginTop: 5,
                    }}
                  >
                    {maskAmount(monthSummary.totalIncomeCents, monthSummary.currency)}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
                    {copy("月结余", "月結餘", "Net")}
                  </Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={{
                      color: tokens.foreground,
                      fontSize: 18,
                      fontWeight: "600",
                      fontVariant: ["tabular-nums"],
                      marginTop: 5,
                    }}
                  >
                    {maskAmount(monthSummary.netCents, monthSummary.currency, true)}
                  </Text>
                </View>
              </View>

              {/* Category Breakdown Bars */}
              {monthSummary.byCategory.length > 0 && monthSummary.totalExpenseCents > 0 ? (
                <View style={{ gap: 8, paddingTop: 4 }}>
                  <Text style={{ color: tokens.mutedForeground, fontSize: 12, fontWeight: "600" }}>
                    {copy("支出分类占比", "支出分類佔比", "Spending by category")}
                  </Text>
                  {monthSummary.byCategory.slice(0, 5).map((item) => {
                    const pct = Math.max(
                      4,
                      Math.round((item.totalCents / monthSummary.totalExpenseCents) * 100),
                    );
                    const sym = billCategorySymbol(item.category);
                    return (
                      <View key={item.category} style={{ gap: 4 }}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <NativeSymbol
                              ios={sym.ios}
                              android={sym.android}
                              size={13}
                              color={sym.color}
                            />
                            <Text
                              style={{ color: tokens.foreground, fontSize: 13, fontWeight: "500" }}
                            >
                              {billCategoryLabel(item.category, locale)}
                            </Text>
                            <Text style={{ color: tokens.mutedForeground, fontSize: 11.5 }}>
                              {`${pct}% · ${item.count}${zh ? "笔" : ""}`}
                            </Text>
                          </View>
                          <Text
                            style={{
                              color: tokens.foreground,
                              fontSize: 13,
                              fontWeight: "600",
                              fontVariant: ["tabular-nums"],
                            }}
                          >
                            {maskAmount(item.totalCents, monthSummary.currency)}
                          </Text>
                        </View>
                        <View
                          style={{
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: chipBg,
                            overflow: "hidden",
                          }}
                        >
                          <View
                            style={{
                              width: `${Math.min(100, pct)}%`,
                              height: "100%",
                              borderRadius: 3,
                              backgroundColor: sym.color,
                              opacity: 0.82,
                            }}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>

            {/* Credit Card Repayment Reminder */}
            {repaymentHint ? (
              <MotionPressable
                preset="card"
                onPress={() => setActiveTab("methods")}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 16,
                  backgroundColor: warnBg,
                }}
              >
                <NativeSymbol
                  ios="calendar.badge.clock"
                  android="time-outline"
                  size={15}
                  color={warnInk}
                />
                <Text style={{ color: warnInk, fontSize: 13, fontWeight: "600", flex: 1 }}>
                  {repaymentHint.daysLeft === 0
                    ? copy(
                        `提醒：${repaymentHint.label} 今日还款日（${repaymentHint.repaymentDay} 日）`,
                        `提醒：${repaymentHint.label} 今日還款日`,
                        `Due today: ${repaymentHint.label}`,
                      )
                    : copy(
                        `提醒：${repaymentHint.label} 距还款日还有 ${repaymentHint.daysLeft} 天（每月 ${repaymentHint.repaymentDay} 日）`,
                        `提醒：${repaymentHint.label} 距還款日還有 ${repaymentHint.daysLeft} 天`,
                        `Upcoming: ${repaymentHint.label} due in ${repaymentHint.daysLeft} days`,
                      )}
                </Text>
              </MotionPressable>
            ) : null}

            {/* Search & Filters */}
            <View style={{ gap: 8 }}>
              <TextInput
                testID="finance-bill-search"
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={copy(
                  "搜索账单商户、分类、备注或支付方式…",
                  "搜尋帳單商戶、分類、備註…",
                  "Search bills, notes, methods…",
                )}
                placeholderTextColor={tokens.mutedForeground}
                style={{
                  backgroundColor: isLight ? "#FFFEFC" : "#242933",
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  color: tokens.foreground,
                  fontSize: 14,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: chipBorder,
                }}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6 }}
              >
                {(["all", "expense", "income", "transfer"] as const).map((dir) => {
                  const active = directionFilter === dir;
                  return (
                    <MotionPressable
                      key={dir}
                      preset="control"
                      onPress={() => setDirectionFilter(dir)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: active ? activeBg : chipBg,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: active ? "transparent" : chipBorder,
                      }}
                    >
                      <Text
                        style={{
                          color: active ? activeInk : tokens.mutedForeground,
                          fontSize: 12.5,
                          fontWeight: "600",
                        }}
                      >
                        {dir === "all"
                          ? copy("全部", "全部", "All")
                          : billDirectionLabel(dir, locale)}
                      </Text>
                    </MotionPressable>
                  );
                })}
                {finance.methods.map((method) => {
                  const active = methodBillFilter === method.id;
                  return (
                    <MotionPressable
                      key={method.id}
                      preset="control"
                      onPress={() =>
                        setMethodBillFilter((prev) => (prev === method.id ? null : method.id))
                      }
                      style={{
                        paddingHorizontal: 11,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: active ? activeBg : chipBg,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: active ? "transparent" : chipBorder,
                      }}
                    >
                      <Text
                        style={{
                          color: active ? activeInk : tokens.foreground,
                          fontSize: 12.5,
                          fontWeight: "500",
                        }}
                      >
                        {method.last4 ? `${method.label} · ${method.last4}` : method.label}
                      </Text>
                    </MotionPressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Grouped Bill Timeline */}
            {groupedBills.length === 0 ? (
              <View style={[cardSurface, { padding: 28, alignItems: "center", gap: 10 }]}>
                <NativeSymbol
                  ios="doc.text.magnifyingglass"
                  android="receipt-outline"
                  size={28}
                  color={tokens.mutedForeground}
                />
                <Text style={{ color: tokens.foreground, fontSize: 15, fontWeight: "600" }}>
                  {copy("该月暂无账单记录", "該月暫無帳單記錄", "No bills for this month")}
                </Text>
                <Text
                  style={{
                    color: tokens.mutedForeground,
                    fontSize: 13,
                    textAlign: "center",
                    lineHeight: 19,
                  }}
                >
                  {copy(
                    "点右上角「+ 记一笔」手动记录，或直接在聊天里对 Sydney 说「帮我记一笔午饭 35 元」。",
                    "點右上角「+ 記一筆」手動記錄，或直接在聊天裡對 Sydney 說「幫我記一筆午飯 35 元」。",
                    "Tap + Add bill above, or ask Sydney in chat to log a bill for you.",
                  )}
                </Text>
              </View>
            ) : (
              groupedBills.map((group) => (
                <View key={group.dateKey} style={{ gap: 8 }}>
                  <Text
                    style={{
                      color: tokens.mutedForeground,
                      fontSize: 12.5,
                      fontWeight: "600",
                      paddingLeft: 6,
                    }}
                  >
                    {group.label}
                  </Text>
                  <View style={[cardSurface, { overflow: "hidden" }]}>
                    {group.items.map((bill, index) => {
                      const sym = billCategorySymbol(bill.category);
                      const prefix =
                        bill.direction === "expense" ? "-" : bill.direction === "income" ? "+" : "";
                      const amountColor =
                        bill.direction === "income" ? incomeInk : tokens.foreground;
                      return (
                        <MotionPressable
                          key={bill.id}
                          preset="card"
                          testID={`finance-bill-row-${bill.id}`}
                          onPress={() => {
                            setEditingBill(bill);
                            setBillSheetOpen(true);
                          }}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 12,
                            paddingHorizontal: 16,
                            paddingVertical: 13,
                            borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                            borderTopColor: chipBorder,
                          }}
                        >
                          <View
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 18,
                              backgroundColor: chipBg,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <NativeSymbol
                              ios={sym.ios}
                              android={sym.android}
                              size={17}
                              color={sym.color}
                            />
                          </View>

                          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <Text
                                numberOfLines={1}
                                style={{
                                  color: tokens.foreground,
                                  fontSize: 15,
                                  fontWeight: "600",
                                  flexShrink: 1,
                                }}
                              >
                                {bill.title}
                              </Text>
                              {bill.source === "bot" ? (
                                <View
                                  style={{
                                    paddingHorizontal: 6,
                                    paddingVertical: 2,
                                    borderRadius: 6,
                                    backgroundColor: botBadgeBg,
                                  }}
                                >
                                  <Text
                                    style={{
                                      color: botBadgeInk,
                                      fontSize: 10.5,
                                      fontWeight: "600",
                                    }}
                                  >
                                    Bot
                                  </Text>
                                </View>
                              ) : null}
                              {bill.status !== "paid" ? (
                                <View
                                  style={{
                                    paddingHorizontal: 6,
                                    paddingVertical: 2,
                                    borderRadius: 6,
                                    backgroundColor: warnBg,
                                  }}
                                >
                                  <Text
                                    style={{ color: warnInk, fontSize: 10.5, fontWeight: "600" }}
                                  >
                                    {billStatusLabel(bill.status, locale)}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                            <Text
                              numberOfLines={1}
                              style={{ color: tokens.mutedForeground, fontSize: 12 }}
                            >
                              {[
                                billCategoryLabel(bill.category, locale),
                                bill.paymentMethodLabel,
                                bill.note,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </Text>
                          </View>

                          <Text
                            style={{
                              color: amountColor,
                              fontSize: 15.5,
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
                    })}
                  </View>
                </View>
              ))
            )}
          </>
        ) : (
          <>
            {/* Method Filter Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6 }}
            >
              {(
                [
                  { key: "all", label: copy("全部", "全部", "All") },
                  { key: "bank", label: copy("储蓄卡 / 银行账户", "儲蓄卡 / 銀行帳戶", "Bank") },
                  { key: "credit", label: copy("信用卡", "信用卡", "Credit") },
                  {
                    key: "ewallet",
                    label: copy("微信 / 支付宝 / 钱包", "微信 / 支付寶 / 錢包", "Wallets"),
                  },
                  { key: "other", label: copy("数字钱包 / 其他", "數位錢包 / 其他", "Other") },
                ] as const
              ).map((tab) => {
                const active = methodFilter === tab.key;
                return (
                  <MotionPressable
                    key={tab.key}
                    preset="control"
                    onPress={() => setMethodFilter(tab.key)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 999,
                      backgroundColor: active ? activeBg : chipBg,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: active ? "transparent" : chipBorder,
                    }}
                  >
                    <Text
                      style={{
                        color: active ? activeInk : tokens.mutedForeground,
                        fontSize: 12.5,
                        fontWeight: "600",
                      }}
                    >
                      {tab.label}
                    </Text>
                  </MotionPressable>
                );
              })}
            </ScrollView>

            {/* Apple Wallet Stacked Card Deck */}
            {filteredMethods.length === 0 ? (
              <View style={[cardSurface, { padding: 28, alignItems: "center", gap: 10 }]}>
                <NativeSymbol
                  ios="creditcard"
                  android="card-outline"
                  size={28}
                  color={tokens.mutedForeground}
                />
                <Text style={{ color: tokens.foreground, fontSize: 15, fontWeight: "600" }}>
                  {copy("还没有保存支付方式", "還沒有儲存支付方式", "No payment methods saved")}
                </Text>
                <Text
                  style={{
                    color: tokens.mutedForeground,
                    fontSize: 13,
                    textAlign: "center",
                    lineHeight: 19,
                  }}
                >
                  {copy(
                    "可保存你的银行储蓄卡、信用卡、微信支付、支付宝、Apple Pay、银行转账账户或数字钱包，单点卡片即可展开查看。",
                    "可儲存你的銀行儲蓄卡、信用卡、微信支付、支付寶、Apple Pay、銀行轉帳帳戶或數位錢包，單點卡片即可展開查看。",
                    "Save your debit/credit cards, WeChat Pay, Alipay, Apple Pay, bank transfer accounts, or wallets. Tap any card to expand.",
                  )}
                </Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                <WalletCardStack
                  methods={filteredMethods}
                  hideAmounts={hideAmounts}
                  onSelectCard={(method) => setFocusedCardId(method.id)}
                />
                <Text
                  style={{
                    color: tokens.mutedForeground,
                    fontSize: 12,
                    textAlign: "center",
                    paddingTop: 2,
                  }}
                >
                  {copy(
                    "轻点任意卡片展开查看完整卡号、安全码与关联账单",
                    "輕點任意卡片展開查看完整卡號、安全碼與關聯帳單",
                    "Tap any card to expand full card number, CVV, and recent bills",
                  )}
                </Text>
              </View>
            )}

            {/* Security Boundary Notice */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 16,
                backgroundColor: safeBg,
              }}
            >
              <NativeSymbol
                ios="lock.shield.fill"
                android="shield-checkmark-outline"
                size={16}
                color={safeInk}
              />
              <Text style={{ color: safeInk, fontSize: 12.5, lineHeight: 18, flex: 1 }}>
                {copy(
                  "银行卡号、有效期、CVV 安全码与私密备注使用 AES-256 加密存储，列表默认脱敏；查看明文需身份确认，且永远不会暴露给任何 Bot 或 AI 模型。",
                  "銀行卡號、有效期、CVV 安全碼與私密備註使用 AES-256 加密儲存，列表預設脫敏；查看明文需身分確認，且永遠不會暴露給任何 Bot 或 AI 模型。",
                  "Card numbers, expiry, CVV, and private notes are AES-256 encrypted, masked in lists, require identity verification to reveal, and are never exposed to bots or AI models.",
                )}
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Modals */}
      <FinanceBillSheet
        visible={billSheetOpen}
        editing={editingBill}
        initialPaymentMethodId={billPresetMethodId}
        methods={finance.methods}
        onClose={() => {
          setBillSheetOpen(false);
          setEditingBill(null);
          setBillPresetMethodId(null);
        }}
        onSave={async (input) => {
          await saveFinanceBill(input);
        }}
        onDelete={async (billId) => {
          await deleteFinanceBill(billId);
        }}
      />

      <PaymentMethodSheet
        visible={methodSheetOpen}
        editing={editingMethod}
        onClose={() => {
          setMethodSheetOpen(false);
          setEditingMethod(null);
        }}
        onSave={async (input) => {
          await savePaymentMethod(input);
        }}
      />

      <WalletCardFocusModal
        method={focusedMethod}
        otherMethods={otherMethodsForFocus}
        bills={finance.bills}
        hideAmounts={hideAmounts}
        onClose={() => setFocusedCardId(null)}
        onEdit={(method) => {
          setFocusedCardId(null);
          setEditingMethod(method);
          setMethodSheetOpen(true);
        }}
        onSetDefault={async (method) => {
          await savePaymentMethod({
            id: method.id,
            kind: method.kind,
            label: method.label,
            isDefault: true,
          });
        }}
        onAddBillWithCard={(method) => {
          setFocusedCardId(null);
          setEditingBill(null);
          setBillPresetMethodId(method.id);
          setBillSheetOpen(true);
        }}
        onFilterBills={(method) => {
          setFocusedCardId(null);
          setMethodBillFilter(method.id);
          setActiveTab("bills");
        }}
        onSelectBill={(bill) => {
          setFocusedCardId(null);
          setEditingBill(bill);
          setBillPresetMethodId(null);
          setBillSheetOpen(true);
        }}
        onDelete={async (method) => {
          await deletePaymentMethod(method.id);
        }}
      />
    </View>
  );
}
