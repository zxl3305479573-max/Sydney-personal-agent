import type {
  FinanceBill,
  FinanceBillCategory,
  FinanceBillDirection,
  FinanceBillStatus,
  PaymentMethodSummary,
  UpsertFinanceBillInput,
} from "@rakazo/contracts";
import {
  FINANCE_BILL_DIRECTIONS,
  FINANCE_BILL_STATUSES,
  FINANCE_EXPENSE_CATEGORIES,
  FINANCE_INCOME_CATEGORIES,
  FINANCE_TRANSFER_CATEGORIES,
  parseAmountToCents,
} from "@rakazo/contracts";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "../lib/i18n";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";
import {
  billCategoryLabel,
  billCategorySymbol,
  billDirectionLabel,
  billStatusLabel,
} from "../lib/personal-finance-ui";
import { AppModalSheet } from "./app-modal-sheet";
import { MotionPressable } from "./motion-pressable";
import { NativeSymbol } from "./native-symbol";

const QUICK_CURRENCIES = ["CNY", "USD", "HKD", "EUR", "JPY"] as const;

function dateInputFromIso(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso.slice(0, 10);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function isoFromDateInput(dateText: string, fallbackIso?: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText.trim());
  if (!match) return fallbackIso ?? new Date().toISOString();
  const now = new Date();
  const year = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10) - 1;
  const day = Number.parseInt(match[3]!, 10);
  const local = new Date(year, month, day, now.getHours(), now.getMinutes(), now.getSeconds());
  return Number.isNaN(local.getTime()) ? new Date().toISOString() : local.toISOString();
}

function categoriesForDirection(direction: FinanceBillDirection): readonly FinanceBillCategory[] {
  if (direction === "income") return FINANCE_INCOME_CATEGORIES;
  if (direction === "transfer") return FINANCE_TRANSFER_CATEGORIES;
  return FINANCE_EXPENSE_CATEGORIES;
}

export type FinanceBillSheetProps = {
  visible: boolean;
  editing: FinanceBill | null;
  initialPaymentMethodId?: string | null;
  methods: readonly PaymentMethodSummary[];
  onClose: () => void;
  onSave: (input: UpsertFinanceBillInput) => Promise<void>;
  onDelete?: (billId: string) => Promise<void>;
};

export function FinanceBillSheet({
  visible,
  editing,
  initialPaymentMethodId = null,
  methods,
  onClose,
  onSave,
  onDelete,
}: FinanceBillSheetProps) {
  const insets = useSafeAreaInsets();
  const tokens = useMobileTokens();
  const appearance = useResolvedAppearance();
  const { locale } = useI18n();
  const zh = locale.startsWith("zh");
  const tw = locale === "zh-TW";
  const copy = (cn: string, hant: string, en: string) => (zh ? (tw ? hant : cn) : en);

  const defaultMethod = methods.find((m) => m.isDefault) ?? methods[0] ?? null;
  const [direction, setDirection] = useState<FinanceBillDirection>("expense");
  const [amountText, setAmountText] = useState("");
  const [currency, setCurrency] = useState("CNY");
  const [category, setCategory] = useState<FinanceBillCategory>("food");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [dateText, setDateText] = useState(() => dateInputFromIso(new Date().toISOString()));
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(defaultMethod?.id ?? null);
  const [status, setStatus] = useState<FinanceBillStatus>("paid");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setSaving(false);
    if (editing) {
      setDirection(editing.direction);
      setAmountText((editing.amountCents / 100).toFixed(2).replace(/\.00$/, ""));
      setCurrency(editing.currency || "CNY");
      setCategory(editing.category);
      setTitle(editing.title);
      setNote(editing.note ?? "");
      setDateText(dateInputFromIso(editing.occurredAt));
      setPaymentMethodId(editing.paymentMethodId);
      setStatus(editing.status);
    } else {
      const preselected =
        (initialPaymentMethodId ? methods.find((m) => m.id === initialPaymentMethodId) : null) ??
        defaultMethod;
      setDirection("expense");
      setAmountText("");
      setCurrency(preselected?.currency ?? "CNY");
      setCategory("food");
      setTitle("");
      setNote("");
      setDateText(dateInputFromIso(new Date().toISOString()));
      setPaymentMethodId(preselected?.id ?? null);
      setStatus("paid");
    }
  }, [
    visible,
    editing,
    initialPaymentMethodId,
    methods,
    defaultMethod?.id,
    defaultMethod?.currency,
  ]);

  const isLight = appearance === "light";
  const cardBg = isLight ? "#FFFEFC" : "#242933";
  const chipBg = isLight ? "#F8F6F2" : "#2A303B";
  const borderColor = isLight ? "rgba(38, 35, 31, 0.08)" : "rgba(245, 244, 240, 0.12)";
  const activeBg = isLight ? "#2E2B27" : "#E7E4DD";
  const activeInk = isLight ? "#FAF8F4" : "#15171C";
  const dangerInk = isLight ? "#B42318" : "#F97066";

  const categories = categoriesForDirection(direction);

  const handleDirectionChange = (next: FinanceBillDirection) => {
    setDirection(next);
    const allowed = categoriesForDirection(next);
    if (!allowed.includes(category)) {
      setCategory(allowed[0]!);
    }
  };

  const setRelativeDate = (daysOffset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    setDateText(dateInputFromIso(d.toISOString()));
  };

  const handleSubmit = async () => {
    if (saving) return;
    const amountCents = parseAmountToCents(amountText);
    if (!amountCents) {
      setError(
        copy(
          "请输入有效的正数金额（最多两位小数）",
          "請輸入有效的正數金額（最多兩位小數）",
          "Enter a valid positive amount",
        ),
      );
      return;
    }
    const cleanTitle = title.trim() || billCategoryLabel(category, locale);
    const matchedMethod = paymentMethodId ? methods.find((m) => m.id === paymentMethodId) : null;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        ...(editing ? { id: editing.id } : {}),
        direction,
        amountCents,
        currency,
        category,
        title: cleanTitle,
        note: note.trim() || null,
        occurredAt: isoFromDateInput(dateText, editing?.occurredAt),
        paymentMethodId: paymentMethodId ?? null,
        paymentMethodLabel: matchedMethod?.label ?? editing?.paymentMethodLabel ?? null,
        status,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : copy("保存账单失败，请重试", "儲存帳單失敗，請重試", "Could not save bill"),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!editing || !onDelete || saving) return;
    Alert.alert(copy("删除这笔账单？", "刪除此筆帳單？", "Delete this bill?"), editing.title, [
      { text: copy("取消", "取消", "Cancel"), style: "cancel" },
      {
        text: copy("删除", "刪除", "Delete"),
        style: "destructive",
        onPress: () => {
          setSaving(true);
          void onDelete(editing.id)
            .then(() => onClose())
            .catch((err) =>
              setError(
                err instanceof Error ? err.message : copy("删除失败", "刪除失敗", "Delete failed"),
              ),
            )
            .finally(() => setSaving(false));
        },
      },
    ]);
  };

  return (
    <AppModalSheet
      visible={visible}
      onClose={onClose}
      preventDismiss={saving}
      bottomInset={insets.bottom}
      accessibilityLabel={
        editing ? copy("编辑账单", "編輯帳單", "Edit bill") : copy("记一笔", "記一筆", "Add bill")
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
        <MotionPressable preset="inline" disabled={saving} onPress={onClose}>
          <Text style={{ color: tokens.mutedForeground, fontSize: 15 }}>
            {copy("取消", "取消", "Cancel")}
          </Text>
        </MotionPressable>
        <Text style={{ color: tokens.foreground, fontSize: 16, fontWeight: "700" }}>
          {editing
            ? copy("编辑账单", "編輯帳單", "Edit bill")
            : copy("记一笔", "記一筆", "New bill")}
        </Text>
        <MotionPressable
          preset="inline"
          testID="finance-bill-save"
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
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, gap: 16 }}
      >
        {/* Direction Tabs */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {FINANCE_BILL_DIRECTIONS.map((dir) => {
            const active = direction === dir;
            return (
              <MotionPressable
                key={dir}
                preset="control"
                testID={`bill-direction-${dir}`}
                onPress={() => handleDirectionChange(dir)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 9,
                  borderRadius: 14,
                  backgroundColor: active ? activeBg : chipBg,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: active ? "transparent" : borderColor,
                }}
              >
                <Text
                  style={{
                    color: active ? activeInk : tokens.foreground,
                    fontSize: 13.5,
                    fontWeight: "600",
                  }}
                >
                  {billDirectionLabel(dir, locale)}
                </Text>
              </MotionPressable>
            );
          })}
        </View>

        {/* Amount + Currency */}
        <View
          style={{
            backgroundColor: cardBg,
            borderRadius: 18,
            padding: 16,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor,
            gap: 10,
          }}
        >
          <Text style={{ color: tokens.mutedForeground, fontSize: 12.5 }}>
            {copy("金额", "金額", "Amount")}
          </Text>
          <TextInput
            testID="finance-bill-amount-input"
            accessibilityLabel={copy("金额", "金額", "Amount")}
            value={amountText}
            onChangeText={setAmountText}
            placeholder="0.00"
            placeholderTextColor={tokens.mutedForeground}
            keyboardType="decimal-pad"
            style={{
              color: tokens.foreground,
              fontSize: 32,
              fontWeight: "700",
              fontVariant: ["tabular-nums"],
              paddingVertical: 2,
            }}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {QUICK_CURRENCIES.map((code) => {
              const selected = currency === code;
              return (
                <MotionPressable
                  key={code}
                  preset="control"
                  onPress={() => setCurrency(code)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
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
        </View>

        {/* Title / Merchant */}
        <View style={{ gap: 6 }}>
          <Text style={{ color: tokens.mutedForeground, fontSize: 12.5, paddingLeft: 4 }}>
            {copy("事项 / 商户名称", "事項 / 商戶名稱", "Title / Merchant")}
          </Text>
          <TextInput
            testID="finance-bill-title-input"
            accessibilityLabel={copy("事项或商户名称", "事項或商戶名稱", "Title or merchant")}
            value={title}
            onChangeText={setTitle}
            placeholder={copy(
              "例如：午饭外卖、地铁、星巴克、工资",
              "例如：午飯外賣、地鐵、星巴克、薪資",
              "e.g. Lunch, Coffee, Rent",
            )}
            placeholderTextColor={tokens.mutedForeground}
            style={{
              backgroundColor: cardBg,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              color: tokens.foreground,
              fontSize: 15,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor,
            }}
          />
        </View>

        {/* Category Grid */}
        <View style={{ gap: 8 }}>
          <Text style={{ color: tokens.mutedForeground, fontSize: 12.5, paddingLeft: 4 }}>
            {copy("分类", "分類", "Category")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {categories.map((cat) => {
              const selected = category === cat;
              const sym = billCategorySymbol(cat);
              return (
                <MotionPressable
                  key={cat}
                  preset="control"
                  onPress={() => setCategory(cat)}
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
                    {billCategoryLabel(cat, locale)}
                  </Text>
                </MotionPressable>
              );
            })}
          </View>
        </View>

        {/* Payment Method Picker */}
        <View style={{ gap: 8 }}>
          <Text style={{ color: tokens.mutedForeground, fontSize: 12.5, paddingLeft: 4 }}>
            {copy("支付方式", "支付方式", "Payment method")}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            <MotionPressable
              preset="control"
              onPress={() => setPaymentMethodId(null)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: paymentMethodId === null ? activeBg : cardBg,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: paymentMethodId === null ? "transparent" : borderColor,
              }}
            >
              <Text
                style={{
                  color: paymentMethodId === null ? activeInk : tokens.foreground,
                  fontSize: 13,
                  fontWeight: "500",
                }}
              >
                {copy("不关联", "不關聯", "None")}
              </Text>
            </MotionPressable>
            {methods.map((method) => {
              const selected = paymentMethodId === method.id;
              return (
                <MotionPressable
                  key={method.id}
                  preset="control"
                  onPress={() => setPaymentMethodId(method.id)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: selected ? activeBg : cardBg,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: selected ? "transparent" : borderColor,
                  }}
                >
                  <Text
                    style={{
                      color: selected ? activeInk : tokens.foreground,
                      fontSize: 13,
                      fontWeight: selected ? "600" : "500",
                    }}
                  >
                    {method.last4 ? `${method.label} · ${method.last4}` : method.label}
                  </Text>
                </MotionPressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Date & Status */}
        <View style={{ gap: 8 }}>
          <Text style={{ color: tokens.mutedForeground, fontSize: 12.5, paddingLeft: 4 }}>
            {copy("日期与状态", "日期與狀態", "Date & Status")}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextInput
              value={dateText}
              onChangeText={setDateText}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={tokens.mutedForeground}
              style={{
                flex: 1,
                backgroundColor: cardBg,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 9,
                color: tokens.foreground,
                fontSize: 14,
                fontVariant: ["tabular-nums"],
                borderWidth: StyleSheet.hairlineWidth,
                borderColor,
              }}
            />
            {[
              { label: copy("今天", "今天", "Today"), offset: 0 },
              { label: copy("昨天", "昨天", "Yesterday"), offset: -1 },
            ].map((item) => (
              <MotionPressable
                key={item.offset}
                preset="control"
                onPress={() => setRelativeDate(item.offset)}
                style={{
                  paddingHorizontal: 11,
                  paddingVertical: 9,
                  borderRadius: 12,
                  backgroundColor: chipBg,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor,
                }}
              >
                <Text style={{ color: tokens.foreground, fontSize: 13, fontWeight: "500" }}>
                  {item.label}
                </Text>
              </MotionPressable>
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {FINANCE_BILL_STATUSES.map((st) => {
              const selected = status === st;
              return (
                <MotionPressable
                  key={st}
                  preset="control"
                  onPress={() => setStatus(st)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: selected ? activeBg : chipBg,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: selected ? "transparent" : borderColor,
                  }}
                >
                  <Text
                    style={{
                      color: selected ? activeInk : tokens.mutedForeground,
                      fontSize: 12.5,
                      fontWeight: "500",
                    }}
                  >
                    {billStatusLabel(st, locale)}
                  </Text>
                </MotionPressable>
              );
            })}
          </View>
        </View>

        {/* Note */}
        <View style={{ gap: 6 }}>
          <Text style={{ color: tokens.mutedForeground, fontSize: 12.5, paddingLeft: 4 }}>
            {copy("备注（可选）", "備註（選填）", "Note (optional)")}
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={copy("补充消费说明或报销备注", "補充消費說明或報銷備註", "Extra details")}
            placeholderTextColor={tokens.mutedForeground}
            multiline
            style={{
              backgroundColor: cardBg,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 10,
              minHeight: 68,
              textAlignVertical: "top",
              color: tokens.foreground,
              fontSize: 14,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor,
            }}
          />
        </View>

        {error ? (
          <Text accessibilityRole="alert" style={{ color: dangerInk, fontSize: 13 }}>
            {error}
          </Text>
        ) : null}

        {editing && onDelete ? (
          <MotionPressable
            preset="control"
            disabled={saving}
            onPress={handleDelete}
            style={{
              alignItems: "center",
              paddingVertical: 12,
              borderRadius: 14,
              backgroundColor: isLight ? "rgba(180, 35, 24, 0.08)" : "rgba(249, 112, 102, 0.14)",
            }}
          >
            <Text style={{ color: dangerInk, fontSize: 14, fontWeight: "600" }}>
              {copy("删除这笔账单", "刪除此筆帳單", "Delete bill")}
            </Text>
          </MotionPressable>
        ) : null}
      </ScrollView>
    </AppModalSheet>
  );
}
