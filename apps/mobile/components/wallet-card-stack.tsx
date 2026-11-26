import type { PaymentMethodSummary } from "@rakazo/contracts";
import { View } from "react-native";
import { MotionPressable } from "./motion-pressable";
import { WALLET_CARD_HEIGHT, WALLET_COMPACT_CARD_HEIGHT, WalletCardFace } from "./wallet-card-face";

const FULL_PEEK_STEP = 56;
const COMPACT_PEEK_STEP = 30;

/**
 * Orders methods Apple-Wallet style: back cards peek from the top, and the primary/default card
 * sits at the front (bottom) so its full face is always visible first.
 */
export function orderWalletDeck(methods: readonly PaymentMethodSummary[]): PaymentMethodSummary[] {
  if (methods.length <= 1) return [...methods];
  const defaultIndex = methods.findIndex((m) => m.isDefault);
  const frontIndex = defaultIndex >= 0 ? defaultIndex : 0;
  const front = methods[frontIndex]!;
  const others = methods.filter((_, idx) => idx !== frontIndex);
  return [...others, front];
}

export type WalletCardStackProps = {
  methods: readonly PaymentMethodSummary[];
  onSelectCard: (method: PaymentMethodSummary) => void;
  compact?: boolean;
  hideAmounts?: boolean;
  maxCompactCards?: number;
};

/**
 * Overlapping Apple Wallet card deck. Each background card exposes its branded top strip while
 * the frontmost card shows its full ISO-7810 face; single-tapping any card opens the focused view.
 */
export function WalletCardStack({
  methods,
  onSelectCard,
  compact = false,
  hideAmounts = false,
  maxCompactCards = 4,
}: WalletCardStackProps) {
  if (methods.length === 0) return null;
  const ordered = orderWalletDeck(methods);
  const visible = compact ? ordered.slice(-maxCompactCards) : ordered;
  const cardHeight = compact ? WALLET_COMPACT_CARD_HEIGHT : WALLET_CARD_HEIGHT;
  const peekStep = compact ? COMPACT_PEEK_STEP : FULL_PEEK_STEP;
  const stackHeight = cardHeight + (visible.length - 1) * peekStep;

  return (
    <View
      testID={compact ? "wallet-card-stack-compact" : "wallet-card-stack"}
      style={{
        height: stackHeight,
        position: "relative",
        width: "100%",
      }}
    >
      {visible.map((method, index) => {
        const isFront = index === visible.length - 1;
        return (
          <View
            key={method.id}
            style={{
              position: "absolute",
              top: index * peekStep,
              left: 0,
              right: 0,
              zIndex: index + 1,
              borderRadius: compact ? 14 : 18,
              shadowColor: "#000000",
              shadowOpacity: index === 0 ? 0.12 : 0.22,
              shadowRadius: isFront ? 14 : 10,
              shadowOffset: { width: 0, height: index === 0 ? 4 : -3 },
              elevation: index + 2,
            }}
          >
            <MotionPressable
              preset="card"
              activeOpacity={0.96}
              testID={
                compact ? `home-wallet-card-${method.id}` : `finance-method-card-${method.id}`
              }
              accessibilityRole="button"
              accessibilityLabel={`${method.label}${method.last4 ? ` ${method.last4}` : ""}`}
              onPress={() => onSelectCard(method)}
            >
              <WalletCardFace
                method={method}
                compact={compact}
                hideAmounts={hideAmounts}
                height={cardHeight}
              />
            </MotionPressable>
          </View>
        );
      })}
    </View>
  );
}
