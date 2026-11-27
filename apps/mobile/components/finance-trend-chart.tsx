import type { FinanceBill } from "@rakazo/contracts";
import { formatCents } from "@rakazo/contracts";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { buildFinanceTrend, financeTrendCurrencies } from "../lib/finance-trend";
import { useI18n } from "../lib/i18n";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";
import { MotionPressable } from "./motion-pressable";
import { NativeSymbol } from "./native-symbol";

const PLOT_WIDTH = 300;
const PLOT_HEIGHT = 144;
const INSET = 10;

export function FinanceTrendChart({
  bills,
  month,
  hideAmounts,
}: {
  bills: readonly FinanceBill[];
  month: string;
  hideAmounts: boolean;
}) {
  const tokens = useMobileTokens();
  const light = useResolvedAppearance() === "light";
  const { locale } = useI18n();
  const copy = (cn: string, tw: string, en: string) =>
    locale.startsWith("zh") ? (locale === "zh-TW" ? tw : cn) : en;
  const currencies = useMemo(() => financeTrendCurrencies(bills, month), [bills, month]);
  const [chosenCurrency, setChosenCurrency] = useState<string | null>(null);
  const currency =
    chosenCurrency && currencies.includes(chosenCurrency)
      ? chosenCurrency
      : (currencies[0] ?? "CNY");
  const days = useMemo(() => buildFinanceTrend(bills, month, currency), [bills, month, currency]);
  const [selection, setSelection] = useState<{ month: string; day: number } | null>(null);
  const [plotWidth, setPlotWidth] = useState(PLOT_WIDTH);
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const dayIndex =
    selection?.month === month
      ? Math.min(selection.day - 1, days.length - 1)
      : month === currentMonth
        ? today.getDate() - 1
        : days.length - 1;
  const selected = days[dayIndex]!;
  const maxCents = Math.max(1, ...days.flatMap((day) => [day.incomeCents, day.expenseCents]));
  const totalIncome = days.reduce((sum, day) => sum + day.incomeCents, 0);
  const totalExpense = days.reduce((sum, day) => sum + day.expenseCents, 0);
  const incomeInk = light ? "#2E6F4E" : "#8ADBA9";
  const expenseInk = light ? "#A64E33" : "#F0AF96";
  const plotX = (index: number) => INSET + (index * (PLOT_WIDTH - INSET * 2)) / (days.length - 1);
  const plotY = (cents: number) =>
    PLOT_HEIGHT - INSET - (cents / maxCents) * (PLOT_HEIGHT - INSET * 2);
  const points = (key: "incomeCents" | "expenseCents") =>
    days.map((day, index) => `${plotX(index)},${plotY(day[key])}`).join(" ");
  const amount = (cents: number) => (hideAmounts ? "••••" : formatCents(cents, currency));
  const selectDay = (index: number) =>
    setSelection({ month, day: Math.max(0, Math.min(days.length - 1, index)) + 1 });
  const expenseLabel = copy("支出", "支出", "Expenses");
  const incomeLabel = copy("收入", "收入", "Income");
  const selectedDate = `${month}-${String(selected.day).padStart(2, "0")}`;

  return (
    <View testID="finance-trend" style={{ gap: 12, paddingTop: 8 }}>
      <Text style={{ color: tokens.foreground, fontSize: 16, fontWeight: "700" }}>
        {copy("收支趋势", "收支趨勢", "Income & expense trend")}
      </Text>
      <Text style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 18 }}>
        {copy(
          "按日统计 · 随账单更新 · 转账不计入",
          "按日統計 · 隨帳單更新 · 轉帳不計入",
          "Daily totals · Updates with your bills · Transfers excluded",
        )}
      </Text>
      {currencies.length > 1 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {currencies.map((code) => (
            <MotionPressable
              key={code}
              preset="control"
              accessibilityRole="button"
              accessibilityState={{ selected: code === currency }}
              onPress={() => setChosenCurrency(code)}
              style={{
                minWidth: 52,
                minHeight: 44,
                paddingHorizontal: 12,
                justifyContent: "center",
                borderRadius: 12,
                backgroundColor: code === currency ? tokens.foreground : tokens.muted,
              }}
            >
              <Text style={{ color: code === currency ? tokens.background : tokens.foreground }}>
                {code}
              </Text>
            </MotionPressable>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 16, borderTopWidth: 2, borderColor: expenseInk }} />
          <Text style={{ color: expenseInk, fontSize: 13 }}>
            {expenseLabel} {amount(totalExpense)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View
            style={{ width: 16, borderTopWidth: 2, borderColor: incomeInk, borderStyle: "dashed" }}
          />
          <Text style={{ color: incomeInk, fontSize: 13 }}>
            {incomeLabel} {amount(totalIncome)}
          </Text>
        </View>
      </View>
      {hideAmounts ? (
        <Text
          testID="finance-trend-hidden"
          style={{ color: tokens.mutedForeground, paddingVertical: 24 }}
        >
          {copy(
            "金额已隐藏，趋势图已收起",
            "金額已隱藏，趨勢圖已收起",
            "Amounts hidden. Chart concealed.",
          )}
        </Text>
      ) : totalIncome === 0 && totalExpense === 0 ? (
        <Text
          testID="finance-trend-empty"
          style={{ color: tokens.mutedForeground, paddingVertical: 24 }}
        >
          {copy(
            "本月暂无收支，记一笔后即可查看趋势",
            "本月暫無收支，記一筆後即可查看趨勢",
            "No income or expenses this month. Add a bill to see the trend.",
          )}
        </Text>
      ) : (
        <>
          <MotionPressable
            preset="inline"
            testID="finance-trend-plot"
            accessibilityRole="button"
            accessibilityLabel={`${month} ${currency} ${expenseLabel} ${amount(totalExpense)}, ${incomeLabel} ${amount(totalIncome)}`}
            accessibilityHint={copy(
              "轻点曲线查看某天，或使用前后一天按钮",
              "輕點曲線查看某天，或使用前後一天按鈕",
              "Tap a day or use the previous and next day buttons",
            )}
            onLayout={(event) => setPlotWidth(event.nativeEvent.layout.width)}
            onPress={(event) =>
              selectDay(
                Math.round(
                  (((event.nativeEvent.locationX / plotWidth) * PLOT_WIDTH - INSET) /
                    (PLOT_WIDTH - INSET * 2)) *
                    (days.length - 1),
                ),
              )
            }
          >
            <Svg
              width="100%"
              height={PLOT_HEIGHT}
              viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
              preserveAspectRatio="none"
              accessible={false}
              pointerEvents="none"
            >
              {[0, 0.5, 1].map((ratio) => (
                <Line
                  key={ratio}
                  x1={INSET}
                  x2={PLOT_WIDTH - INSET}
                  y1={plotY(maxCents * ratio)}
                  y2={plotY(maxCents * ratio)}
                  stroke={tokens.border}
                  strokeWidth={1}
                />
              ))}
              <Line
                x1={plotX(dayIndex)}
                x2={plotX(dayIndex)}
                y1={INSET}
                y2={PLOT_HEIGHT - INSET}
                stroke={tokens.mutedForeground}
                strokeDasharray="2 4"
              />
              <Polyline
                points={points("expenseCents")}
                fill="none"
                stroke={expenseInk}
                strokeWidth={2.5}
              />
              <Polyline
                points={points("incomeCents")}
                fill="none"
                stroke={incomeInk}
                strokeWidth={2.5}
                strokeDasharray="5 4"
              />
              <Circle
                cx={plotX(dayIndex)}
                cy={plotY(selected.expenseCents)}
                r={4}
                fill={expenseInk}
              />
              <Circle
                cx={plotX(dayIndex)}
                cy={plotY(selected.incomeCents)}
                r={4}
                fill={incomeInk}
              />
            </Svg>
          </MotionPressable>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            {[1, Math.ceil(days.length / 2), days.length].map((day) => (
              <Text key={day} style={{ color: tokens.mutedForeground, fontSize: 11 }}>
                {month.slice(5)}/{day}
              </Text>
            ))}
          </View>
          <Text style={{ color: tokens.mutedForeground, fontSize: 11 }}>
            {copy("纵轴最高值", "縱軸最高值", "Y-axis maximum")} {amount(maxCents)} · {currency}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <MotionPressable
              preset="icon"
              testID="finance-trend-prev-day"
              accessibilityRole="button"
              accessibilityLabel={copy("前一天", "前一天", "Previous day")}
              disabled={dayIndex === 0}
              onPress={() => selectDay(dayIndex - 1)}
              style={{
                minWidth: 44,
                minHeight: 44,
                alignItems: "center",
                justifyContent: "center",
                opacity: dayIndex === 0 ? 0.4 : 1,
              }}
            >
              <NativeSymbol
                ios="chevron.left"
                android="chevron-back"
                size={14}
                color={tokens.foreground}
              />
            </MotionPressable>
            <View
              testID="finance-trend-day"
              style={{ flex: 1, gap: 4 }}
              accessibilityLiveRegion="polite"
            >
              <Text style={{ color: tokens.foreground, fontSize: 13 }}>{selectedDate}</Text>
              <Text style={{ color: expenseInk, fontSize: 12 }}>
                {expenseLabel} {amount(selected.expenseCents)}
              </Text>
              <Text style={{ color: incomeInk, fontSize: 12 }}>
                {incomeLabel} {amount(selected.incomeCents)}
              </Text>
            </View>
            <MotionPressable
              preset="icon"
              testID="finance-trend-next-day"
              accessibilityRole="button"
              accessibilityLabel={copy("后一天", "後一天", "Next day")}
              disabled={dayIndex === days.length - 1}
              onPress={() => selectDay(dayIndex + 1)}
              style={{
                minWidth: 44,
                minHeight: 44,
                alignItems: "center",
                justifyContent: "center",
                opacity: dayIndex === days.length - 1 ? 0.4 : 1,
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
        </>
      )}
    </View>
  );
}
