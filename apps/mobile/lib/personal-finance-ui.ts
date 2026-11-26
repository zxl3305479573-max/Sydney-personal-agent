import type {
  FinanceBill,
  FinanceBillCategory,
  FinanceBillDirection,
  FinanceBillStatus,
  PaymentCardAccent,
  PaymentMethodKind,
  PaymentMethodSensitivePayload,
  PaymentMethodSummary,
} from "@rakazo/contracts";
import { daysUntilMonthlyDay, formatCardNumberGrouped } from "@rakazo/contracts";
import type Ionicons from "@react-native-vector-icons/ionicons";
import type { ComponentProps } from "react";

type IoniconsName = ComponentProps<typeof Ionicons>["name"];

export type FinanceSymbolSpec = {
  ios: string;
  android: IoniconsName;
  color: string;
};

export function paymentMethodKindLabel(kind: PaymentMethodKind, locale: string): string {
  const zh = locale.startsWith("zh");
  const tw = locale === "zh-TW";
  switch (kind) {
    case "debit_card":
      return zh ? (tw ? "金融儲蓄卡" : "银行储蓄卡") : "Debit Card";
    case "credit_card":
      return zh ? "信用卡" : "Credit Card";
    case "wechat_pay":
      return zh ? "微信支付" : "WeChat Pay";
    case "alipay":
      return zh ? (tw ? "支付寶" : "支付宝") : "Alipay";
    case "apple_pay":
      return "Apple Pay";
    case "bank_transfer":
      return zh ? (tw ? "銀行轉帳帳戶" : "银行转账账户") : "Bank Account";
    case "paypal":
      return "PayPal";
    case "crypto_wallet":
      return zh ? (tw ? "數位錢包" : "数字钱包") : "Crypto Wallet";
    default:
      return zh ? "其他方式" : "Other";
  }
}

export function paymentMethodSymbol(kind: PaymentMethodKind): FinanceSymbolSpec {
  switch (kind) {
    case "debit_card":
      return { ios: "creditcard", android: "card-outline", color: "#3B6EA5" };
    case "credit_card":
      return { ios: "creditcard.fill", android: "card", color: "#8C6D3F" };
    case "wechat_pay":
      return { ios: "message.fill", android: "chatbubble-ellipses-outline", color: "#2E7D54" };
    case "alipay":
      return { ios: "yensign.circle.fill", android: "wallet-outline", color: "#1E6FD9" };
    case "apple_pay":
      return { ios: "apple.logo", android: "phone-portrait-outline", color: "#2E2B27" };
    case "bank_transfer":
      return { ios: "building.columns.fill", android: "business-outline", color: "#4B5D73" };
    case "paypal":
      return { ios: "globe", android: "globe-outline", color: "#2858A8" };
    case "crypto_wallet":
      return { ios: "bitcoinsign.circle.fill", android: "logo-bitcoin", color: "#B87A1E" };
    default:
      return { ios: "wallet.bifold", android: "wallet-outline", color: "#6E675E" };
  }
}

export type WalletCardMotif = "guilloche" | "radial" | "metallic" | "orbital" | "horizon" | "prism";

export type WalletCardBadgeKind = "unionpay" | "mastercard" | "visa" | "wallet";

export type WalletCardVisualTheme = {
  bg: string;
  gradientStart: string;
  gradientMid: string;
  gradientEnd: string;
  ink: string;
  subtleInk: string;
  border: string;
  artColor: string;
  artAccent: string;
  artOpacity: number;
  motif: WalletCardMotif;
  badge: WalletCardBadgeKind;
  isLightCard: boolean;
};

export function resolveWalletCardVisual(input: {
  accent?: PaymentCardAccent | null;
  kind: PaymentMethodKind;
  label?: string | null;
  institution?: string | null;
}): WalletCardVisualTheme {
  const hint = `${input.institution ?? ""} ${input.label ?? ""}`.toLowerCase();
  const isSilverBrand =
    hint.includes("bybit") || hint.includes("白金") || hint.includes("apple card");
  const isCmb = hint.includes("招商") || hint.includes("cmb");
  const isIcbc = hint.includes("工商") || hint.includes("icbc");
  const isCrimsonBank =
    hint.includes("中国银行") ||
    hint.includes("中行") ||
    hint.includes("中信") ||
    hint.includes("交通卡") ||
    hint.includes("广发");
  const isMastercard = hint.includes("master") || hint.includes("万事达") || hint.includes("bybit");
  const isVisa = hint.includes("visa") || hint.includes("维萨");

  const inferredAccent: PaymentCardAccent =
    input.accent ??
    (isSilverBrand
      ? "silver"
      : isIcbc
        ? "cobalt"
        : isCmb
          ? "navy"
          : isCrimsonBank
            ? "crimson"
            : input.kind === "wechat_pay"
              ? "emerald"
              : input.kind === "alipay"
                ? "cobalt"
                : input.kind === "credit_card"
                  ? "obsidian"
                  : input.kind === "debit_card"
                    ? "navy"
                    : input.kind === "crypto_wallet"
                      ? "gold"
                      : "slate");

  const badge: WalletCardBadgeKind = isMastercard
    ? "mastercard"
    : isVisa
      ? "visa"
      : input.kind === "debit_card" ||
          input.kind === "credit_card" ||
          input.kind === "bank_transfer"
        ? "unionpay"
        : "wallet";

  const motif: WalletCardMotif = isSilverBrand
    ? "guilloche"
    : isCmb
      ? "radial"
      : isIcbc
        ? "metallic"
        : inferredAccent === "silver"
          ? "guilloche"
          : inferredAccent === "cobalt"
            ? "metallic"
            : inferredAccent === "navy"
              ? "radial"
              : inferredAccent === "crimson"
                ? "orbital"
                : inferredAccent === "obsidian"
                  ? "horizon"
                  : "prism";

  switch (inferredAccent) {
    case "silver":
      return {
        bg: "#E9ECEF",
        gradientStart: "#D8DCE1",
        gradientMid: "#F1F3F5",
        gradientEnd: "#FFFFFF",
        ink: "#1A1B1E",
        subtleInk: "#5C6069",
        border: "rgba(30, 34, 42, 0.14)",
        artColor: "#7C828E",
        artAccent: "#B8BFC9",
        artOpacity: 0.34,
        motif,
        badge,
        isLightCard: true,
      };
    case "cobalt":
      return {
        bg: "#165DA8",
        gradientStart: "#2A3E59",
        gradientMid: "#1B6AC0",
        gradientEnd: "#127BD0",
        ink: "#FFFFFF",
        subtleInk: "rgba(255, 255, 255, 0.78)",
        border: "rgba(255, 255, 255, 0.20)",
        artColor: "#B7DCFF",
        artAccent: "#63B0F5",
        artOpacity: 0.38,
        motif,
        badge,
        isLightCard: false,
      };
    case "navy":
      return {
        bg: "#233575",
        gradientStart: "#1F2B6C",
        gradientMid: "#2A3E8F",
        gradientEnd: "#223478",
        ink: "#F7F9FF",
        subtleInk: "rgba(247, 249, 255, 0.76)",
        border: "rgba(255, 255, 255, 0.18)",
        artColor: "#AFC4FF",
        artAccent: "#6D8EF2",
        artOpacity: 0.36,
        motif,
        badge,
        isLightCard: false,
      };
    case "crimson":
      return {
        bg: "#D9363E",
        gradientStart: "#E24449",
        gradientMid: "#CE2F38",
        gradientEnd: "#A92029",
        ink: "#FFF9F9",
        subtleInk: "rgba(255, 249, 249, 0.78)",
        border: "rgba(255, 255, 255, 0.20)",
        artColor: "#FFD4D6",
        artAccent: "#FFFFFF",
        artOpacity: 0.42,
        motif,
        badge,
        isLightCard: false,
      };
    case "obsidian":
      return {
        bg: "#131722",
        gradientStart: "#101420",
        gradientMid: "#1B2030",
        gradientEnd: "#0E111A",
        ink: "#FAF8F4",
        subtleInk: "rgba(250, 248, 244, 0.72)",
        border: "rgba(255, 255, 255, 0.14)",
        artColor: "#F2A528",
        artAccent: "#D84D5F",
        artOpacity: 0.88,
        motif,
        badge,
        isLightCard: false,
      };
    case "emerald":
      return {
        bg: "#1C5A43",
        gradientStart: "#19523D",
        gradientMid: "#237356",
        gradientEnd: "#174B38",
        ink: "#F4FBF8",
        subtleInk: "rgba(244, 251, 248, 0.78)",
        border: "rgba(255, 255, 255, 0.18)",
        artColor: "#9AE8C7",
        artAccent: "#56C296",
        artOpacity: 0.32,
        motif,
        badge,
        isLightCard: false,
      };
    case "gold":
      return {
        bg: "#6D5531",
        gradientStart: "#574223",
        gradientMid: "#7E6237",
        gradientEnd: "#4D3A1F",
        ink: "#FDFBF6",
        subtleInk: "rgba(253, 251, 246, 0.78)",
        border: "rgba(253, 251, 246, 0.20)",
        artColor: "#F7DFAA",
        artAccent: "#D4AE62",
        artOpacity: 0.34,
        motif,
        badge,
        isLightCard: false,
      };
    default:
      return {
        bg: "#343B46",
        gradientStart: "#2B313B",
        gradientMid: "#404957",
        gradientEnd: "#2A2F38",
        ink: "#F6F7F9",
        subtleInk: "rgba(246, 247, 249, 0.74)",
        border: "rgba(255, 255, 255, 0.16)",
        artColor: "#C5CDD9",
        artAccent: "#909CAE",
        artOpacity: 0.28,
        motif,
        badge,
        isLightCard: false,
      };
  }
}

export function paymentCardAccentPalette(
  accent: PaymentCardAccent | null | undefined,
  kind: PaymentMethodKind,
): { bg: string; ink: string; subtleInk: string; border: string } {
  const visual = resolveWalletCardVisual({ accent, kind });
  return {
    bg: visual.bg,
    ink: visual.ink,
    subtleInk: visual.subtleInk,
    border: visual.border,
  };
}

export function billDirectionLabel(direction: FinanceBillDirection, locale: string): string {
  const zh = locale.startsWith("zh");
  const tw = locale === "zh-TW";
  switch (direction) {
    case "expense":
      return zh ? "支出" : "Expense";
    case "income":
      return zh ? "收入" : "Income";
    case "transfer":
      return zh ? (tw ? "轉帳 / 還款" : "转账 / 还款") : "Transfer";
  }
}

export function billStatusLabel(status: FinanceBillStatus, locale: string): string {
  const zh = locale.startsWith("zh");
  const tw = locale === "zh-TW";
  switch (status) {
    case "paid":
      return zh ? (tw ? "已入帳" : "已入账") : "Paid";
    case "pending":
      return zh ? (tw ? "待支付" : "待支付") : "Pending";
    case "recurring":
      return zh ? (tw ? "週期訂閱" : "周期账单") : "Recurring";
  }
}

export function billCategoryLabel(category: FinanceBillCategory, locale: string): string {
  const zh = locale.startsWith("zh");
  const tw = locale === "zh-TW";
  const map: Record<FinanceBillCategory, [string, string, string]> = {
    food: ["餐饮", "餐飲", "Food"],
    transport: ["交通", "交通", "Transit"],
    shopping: ["购物", "購物", "Shopping"],
    housing: ["居住", "居住", "Housing"],
    entertainment: ["娱乐", "娛樂", "Fun"],
    health: ["医疗", "醫療", "Health"],
    subscription: ["订阅", "訂閱", "Subs"],
    education: ["学习", "學習", "Study"],
    social: ["人情", "人情", "Social"],
    travel: ["旅行", "旅行", "Travel"],
    other_expense: ["其他", "其他", "Other"],
    salary: ["工资", "薪資", "Salary"],
    bonus: ["奖金", "獎金", "Bonus"],
    investment: ["理财", "理財", "Invest"],
    refund: ["退款", "退款", "Refund"],
    other_income: ["其他收入", "其他收入", "Income"],
    card_repayment: ["还信用卡", "還信用卡", "Card Pay"],
    transfer: ["账户互转", "帳戶互轉", "Transfer"],
  };
  const [cn, hant, en] = map[category];
  return zh ? (tw ? hant : cn) : en;
}

export function billCategorySymbol(category: FinanceBillCategory): FinanceSymbolSpec {
  const map: Record<FinanceBillCategory, FinanceSymbolSpec> = {
    food: { ios: "fork.knife", android: "restaurant-outline", color: "#C66B3D" },
    transport: { ios: "tram.fill", android: "car-outline", color: "#3B6EA5" },
    shopping: { ios: "bag.fill", android: "bag-handle-outline", color: "#B85D78" },
    housing: { ios: "house.fill", android: "home-outline", color: "#7A6A58" },
    entertainment: {
      ios: "gamecontroller.fill",
      android: "game-controller-outline",
      color: "#7358A6",
    },
    health: { ios: "cross.case.fill", android: "medkit-outline", color: "#B84A4A" },
    subscription: { ios: "repeat.circle.fill", android: "repeat-outline", color: "#4D6D8C" },
    education: { ios: "book.fill", android: "book-outline", color: "#4B7A63" },
    social: { ios: "gift.fill", android: "gift-outline", color: "#B87A2B" },
    travel: { ios: "airplane", android: "airplane-outline", color: "#2D7A8A" },
    other_expense: {
      ios: "ellipsis.circle.fill",
      android: "ellipsis-horizontal-circle-outline",
      color: "#6E675E",
    },
    salary: { ios: "banknote.fill", android: "cash-outline", color: "#2E7D54" },
    bonus: { ios: "star.fill", android: "sparkles-outline", color: "#A67C2E" },
    investment: {
      ios: "chart.line.uptrend.xyaxis",
      android: "trending-up-outline",
      color: "#2E6F68",
    },
    refund: {
      ios: "arrow.uturn.backward.circle.fill",
      android: "return-up-back-outline",
      color: "#3B6EA5",
    },
    other_income: { ios: "plus.circle.fill", android: "add-circle-outline", color: "#2E7D54" },
    card_repayment: { ios: "creditcard.and.123", android: "card-outline", color: "#5D576B" },
    transfer: {
      ios: "arrow.left.arrow.right",
      android: "swap-horizontal-outline",
      color: "#5D576B",
    },
  };
  return map[category];
}

export function formatMonthHeading(month: string, locale: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const year = Number.parseInt(match[1]!, 10);
  const monthNum = Number.parseInt(match[2]!, 10);
  if (locale.startsWith("zh")) {
    return `${year}年${monthNum}月`;
  }
  try {
    return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short" }).format(
      new Date(year, monthNum - 1, 1),
    );
  } catch {
    return month;
  }
}

export function formatBillDayLabel(iso: string, locale: string, now = new Date()): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso.slice(0, 10);
  const zh = locale.startsWith("zh");
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(parsed, now)) return zh ? "今天" : "Today";
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(parsed, yesterday)) return zh ? "昨天" : "Yesterday";
  if (zh) {
    return `${parsed.getMonth() + 1}月${parsed.getDate()}日`;
  }
  return `${parsed.getMonth() + 1}/${parsed.getDate()}`;
}

export function groupBillsByDate(
  bills: readonly FinanceBill[],
  locale: string,
  now = new Date(),
): Array<{ dateKey: string; label: string; items: FinanceBill[] }> {
  const map = new Map<string, { dateKey: string; label: string; items: FinanceBill[] }>();
  for (const bill of bills) {
    const d = new Date(bill.occurredAt);
    const dateKey = Number.isNaN(d.getTime())
      ? bill.occurredAt.slice(0, 10)
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const group = map.get(dateKey) ?? {
      dateKey,
      label: formatBillDayLabel(bill.occurredAt, locale, now),
      items: [],
    };
    group.items.push(bill);
    map.set(dateKey, group);
  }
  return [...map.values()];
}

export type UpcomingRepaymentHint = {
  methodId: string;
  label: string;
  repaymentDay: number;
  daysLeft: number;
};

/** Returns the soonest credit card repayment within `withinDays` (default 7 days). */
export function soonestCreditCardRepayment(
  methods: readonly PaymentMethodSummary[],
  withinDays = 7,
  now = new Date(),
): UpcomingRepaymentHint | null {
  let best: UpcomingRepaymentHint | null = null;
  for (const method of methods) {
    if (method.kind !== "credit_card" || !method.repaymentDay) continue;
    const daysLeft = daysUntilMonthlyDay(method.repaymentDay, now);
    if (daysLeft > withinDays) continue;
    if (!best || daysLeft < best.daysLeft) {
      best = {
        methodId: method.id,
        label: method.label,
        repaymentDay: method.repaymentDay,
        daysLeft,
      };
    }
  }
  return best;
}

/** Builds a clean bank-transfer copy block for sharing account details with someone paying you. */
export function buildBankTransferShareText(
  method: PaymentMethodSummary,
  secrets: PaymentMethodSensitivePayload,
): string {
  const lines: string[] = [];
  if (method.holderName) lines.push(`户名：${method.holderName}`);
  if (secrets.accountNumber) lines.push(`账号：${formatCardNumberGrouped(secrets.accountNumber)}`);
  if (method.institution) lines.push(`银行：${method.institution}`);
  if (secrets.branchName) lines.push(`开户行：${secrets.branchName}`);
  if (lines.length === 0) lines.push(method.label);
  return lines.join("\n");
}
