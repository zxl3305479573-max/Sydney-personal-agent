import type { PaymentMethodSummary } from "@rakazo/contracts";
import { formatCardNumberGrouped, formatCents } from "@rakazo/contracts";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { useI18n } from "../lib/i18n";
import type { WalletCardBadgeKind, WalletCardVisualTheme } from "../lib/personal-finance-ui";
import {
  paymentMethodKindLabel,
  paymentMethodSymbol,
  resolveWalletCardVisual,
} from "../lib/personal-finance-ui";
import { NativeSymbol } from "./native-symbol";

export const WALLET_CARD_HEIGHT = 210;
export const WALLET_COMPACT_CARD_HEIGHT = 128;

function CardArtworkSvg({ visual, gradId }: { visual: WalletCardVisualTheme; gradId: string }) {
  return (
    <Svg
      pointerEvents="none"
      width="100%"
      height="100%"
      viewBox="0 0 360 226"
      preserveAspectRatio="none"
      style={StyleSheet.absoluteFill}
    >
      <Defs>
        <LinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={visual.gradientStart} stopOpacity={1} />
          <Stop offset="52%" stopColor={visual.gradientMid} stopOpacity={1} />
          <Stop offset="100%" stopColor={visual.gradientEnd} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="360" height="226" fill={`url(#${gradId})`} />

      {/* Subtle top-edge sheen like physical laminated Apple Wallet cards */}
      <Rect
        x="0"
        y="0"
        width="360"
        height="1.5"
        fill={visual.isLightCard ? "#FFFFFF" : "#FFFFFF"}
        fillOpacity={visual.isLightCard ? 0.85 : 0.24}
      />

      {visual.motif === "guilloche" ? (
        <G stroke={visual.artColor} strokeWidth="1" fill="none" opacity={visual.artOpacity}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Path
              key={`w-${i}`}
              d={`M -10 ${106 + i * 7} C 74 ${54 + i * 6}, 148 ${168 - i * 4}, 230 ${98 + i * 6} C 282 ${52 + i * 5}, 322 ${78 + i * 6}, 372 ${134 + i * 5}`}
            />
          ))}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Path
              key={`v-${i}`}
              d={`M ${214 + i * 9} -10 C ${204 + i * 8} 76, ${192 + i * 9} 142, ${142 + i * 10} 236`}
              strokeOpacity={0.75}
            />
          ))}
        </G>
      ) : null}

      {visual.motif === "radial" ? (
        <G stroke={visual.artColor} fill="none" opacity={visual.artOpacity}>
          <Circle
            cx="262"
            cy="72"
            r="26"
            fill={visual.artAccent}
            fillOpacity={0.28}
            strokeWidth="1.2"
          />
          <Circle cx="262" cy="72" r="46" strokeWidth="1.2" strokeDasharray="5 4" />
          <Circle cx="262" cy="72" r="70" strokeWidth="1.3" strokeDasharray="8 5" />
          <Circle cx="262" cy="72" r="98" strokeWidth="1.1" />
          {[0, 24, 48, 72, 96, 120, 144, 168, 192, 216, 240, 264, 288, 312, 336].map((deg) => {
            const rad = (deg * Math.PI) / 180;
            const x1 = 262 + Math.cos(rad) * 28;
            const y1 = 72 + Math.sin(rad) * 28;
            const x2 = 262 + Math.cos(rad) * 116;
            const y2 = 72 + Math.sin(rad) * 116;
            return (
              <Path
                key={deg}
                d={`M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`}
                strokeWidth="1.1"
              />
            );
          })}
        </G>
      ) : null}

      {visual.motif === "metallic" ? (
        <G opacity={visual.artOpacity}>
          <Path
            d="M 118 232 C 122 122, 164 16, 244 26 C 296 32, 294 98, 224 120 C 176 135, 160 156, 168 188 C 176 218, 232 220, 296 184"
            fill="none"
            stroke={visual.artColor}
            strokeWidth="26"
            strokeLinecap="round"
            strokeOpacity={0.52}
          />
          <Path
            d="M 118 232 C 122 122, 164 16, 244 26 C 296 32, 294 98, 224 120 C 176 135, 160 156, 168 188 C 176 218, 232 220, 296 184"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="5"
            strokeLinecap="round"
            strokeOpacity={0.62}
          />
          <Circle cx="288" cy="48" r="68" fill={visual.artAccent} fillOpacity={0.18} />
        </G>
      ) : null}

      {visual.motif === "orbital" ? (
        <G fill="none" stroke={visual.artColor} opacity={visual.artOpacity}>
          <Circle cx="222" cy="96" r="54" strokeWidth="1.8" />
          <Circle cx="286" cy="54" r="34" strokeWidth="1.6" />
          <Circle cx="154" cy="148" r="78" strokeWidth="1.2" strokeOpacity={0.5} />
          <Path
            d="M 122 126 Q 214 78 320 44"
            stroke="#FFFFFF"
            strokeWidth="6"
            strokeLinecap="round"
            strokeOpacity={0.78}
          />
        </G>
      ) : null}

      {visual.motif === "horizon" ? (
        <G opacity={visual.artOpacity}>
          <Circle cx="212" cy="84" r="46" fill={visual.artColor} fillOpacity={0.94} />
          <Rect x="0" y="96" width="360" height="130" fill="#0B0E17" fillOpacity={0.82} />
          <Path
            d="M 0 96 L 360 96"
            stroke={visual.artAccent}
            strokeWidth="1.5"
            strokeOpacity={0.45}
          />
        </G>
      ) : null}

      {visual.motif === "prism" ? (
        <G opacity={visual.artOpacity}>
          <Path
            d="M 210 0 L 360 0 L 360 154 L 154 226 Z"
            fill={visual.artColor}
            fillOpacity={0.16}
          />
          <Path
            d="M 268 0 L 360 0 L 360 226 L 222 226 Z"
            fill={visual.artAccent}
            fillOpacity={0.14}
          />
          <Circle cx="304" cy="44" r="56" fill="#FFFFFF" fillOpacity={0.08} />
        </G>
      ) : null}
    </Svg>
  );
}

function NetworkBadge({
  badge,
  visual,
  kindLabel,
  compact,
}: {
  badge: WalletCardBadgeKind;
  visual: WalletCardVisualTheme;
  kindLabel: string;
  compact?: boolean;
}) {
  if (badge === "mastercard") {
    const r = compact ? 10 : 14;
    return (
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View
          style={{
            width: r * 2,
            height: r * 2,
            borderRadius: r,
            backgroundColor: "#EB001B",
            opacity: 0.94,
          }}
        />
        <View
          style={{
            width: r * 2,
            height: r * 2,
            borderRadius: r,
            backgroundColor: "#F79E1B",
            marginLeft: -r * 0.72,
            opacity: 0.88,
          }}
        />
      </View>
    );
  }

  if (badge === "unionpay") {
    return (
      <View
        style={{
          flexDirection: "row",
          borderRadius: compact ? 6 : 8,
          overflow: "hidden",
          borderWidth: 1.5,
          borderColor: "rgba(255,255,255,0.88)",
          backgroundColor: "#FFFFFF",
          height: compact ? 22 : 30,
          minWidth: compact ? 42 : 56,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: "36%",
            backgroundColor: "#D9272E",
          }}
        />
        <View
          style={{
            position: "absolute",
            left: "34%",
            top: 0,
            bottom: 0,
            width: "34%",
            backgroundColor: "#00447C",
          }}
        />
        <View
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: "34%",
            backgroundColor: "#007B84",
          }}
        />
        <Text
          style={{
            color: "#FFFFFF",
            fontSize: compact ? 8.5 : 10,
            fontWeight: "800",
            letterSpacing: 0.2,
            paddingHorizontal: 5,
          }}
        >
          银联
        </Text>
      </View>
    );
  }

  if (badge === "visa") {
    return (
      <Text
        style={{
          color: visual.ink,
          fontSize: compact ? 14 : 18,
          fontWeight: "800",
          fontStyle: "italic",
          letterSpacing: 0.8,
        }}
      >
        VISA
      </Text>
    );
  }

  return (
    <View
      style={{
        paddingHorizontal: compact ? 7 : 9,
        paddingVertical: compact ? 3 : 4,
        borderRadius: 999,
        backgroundColor: visual.isLightCard
          ? "rgba(26, 27, 30, 0.08)"
          : "rgba(255, 255, 255, 0.16)",
      }}
    >
      <Text style={{ color: visual.ink, fontSize: compact ? 10 : 11, fontWeight: "700" }}>
        {kindLabel}
      </Text>
    </View>
  );
}

export type WalletCardFaceProps = {
  method: PaymentMethodSummary;
  /** Full decrypted number shown only while owner actively revealed it. */
  revealedNumber?: string | null;
  /** Compact variant for the Home Hub mini stacked wallet preview. */
  compact?: boolean;
  /** Hide balance figures when privacy mask is on. */
  hideAmounts?: boolean;
  height?: number;
};

export function WalletCardFace({
  method,
  revealedNumber = null,
  compact = false,
  hideAmounts = false,
  height,
}: WalletCardFaceProps) {
  const { locale } = useI18n();
  const zh = locale.startsWith("zh");
  const visual = resolveWalletCardVisual({
    accent: method.accentColor,
    kind: method.kind,
    label: method.label,
    institution: method.institution,
  });
  const sym = paymentMethodSymbol(method.kind);
  const kindLabel = paymentMethodKindLabel(method.kind, locale);
  const cardHeight = height ?? (compact ? WALLET_COMPACT_CARD_HEIGHT : WALLET_CARD_HEIGHT);
  const gradId = `wgrad_${method.id.replace(/[^a-zA-Z0-9]/g, "_")}_${compact ? "c" : "f"}`;

  const displayNumber = revealedNumber
    ? formatCardNumberGrouped(revealedNumber)
    : (method.accountMask ?? (method.last4 ? `•••• ${method.last4}` : null));
  const subtitle =
    method.institution && method.institution.trim() !== method.label.trim()
      ? method.institution.trim()
      : kindLabel;

  return (
    <View
      style={{
        height: cardHeight,
        borderRadius: compact ? 14 : 18,
        backgroundColor: visual.bg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: visual.border,
        overflow: "hidden",
        paddingHorizontal: compact ? 14 : 18,
        paddingVertical: compact ? 11 : 15,
        justifyContent: "space-between",
      }}
    >
      <CardArtworkSvg visual={visual} gradId={gradId} />

      {/* Top Strip (50-56pt): Always visible even when stacked behind another card! */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: compact ? 7 : 9,
            flex: 1,
            minWidth: 0,
          }}
        >
          <View
            style={{
              width: compact ? 24 : 30,
              height: compact ? 24 : 30,
              borderRadius: compact ? 12 : 15,
              backgroundColor: visual.isLightCard
                ? "rgba(26, 27, 30, 0.08)"
                : "rgba(255, 255, 255, 0.16)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <NativeSymbol
              ios={sym.ios}
              android={sym.android}
              size={compact ? 12 : 15}
              color={visual.ink}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{
                color: visual.ink,
                fontSize: compact ? 14 : 17.5,
                lineHeight: compact ? 18 : 22,
                fontWeight: "700",
                letterSpacing: -0.2,
              }}
            >
              {method.label}
            </Text>
            {!compact ? (
              <Text
                numberOfLines={1}
                style={{
                  color: visual.subtleInk,
                  fontSize: 11.5,
                  lineHeight: 15,
                  fontWeight: "500",
                }}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {method.isDefault ? (
            <View
              style={{
                paddingHorizontal: 7,
                paddingVertical: 2.5,
                borderRadius: 999,
                backgroundColor: visual.isLightCard
                  ? "rgba(26, 27, 30, 0.10)"
                  : "rgba(255, 255, 255, 0.20)",
              }}
            >
              <Text style={{ color: visual.ink, fontSize: 10.5, fontWeight: "700" }}>
                {zh ? "默认" : "Default"}
              </Text>
            </View>
          ) : null}
          {!compact && method.hasSensitiveDetails ? (
            <NativeSymbol
              ios="lock.fill"
              android="lock-closed-outline"
              size={12}
              color={visual.subtleInk}
            />
          ) : null}
        </View>
      </View>

      {/* Bottom Row: Masked / Revealed Number + Optional Balance + Network Badge */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {!compact && method.balanceCents != null ? (
            <Text
              numberOfLines={1}
              style={{
                color: visual.subtleInk,
                fontSize: 12,
                fontWeight: "600",
                fontVariant: ["tabular-nums"],
              }}
            >
              {hideAmounts ? "••••" : formatCents(method.balanceCents, method.currency)}
            </Text>
          ) : null}
          <Text
            numberOfLines={1}
            selectable={Boolean(revealedNumber)}
            style={{
              color: visual.ink,
              fontSize: compact ? 13 : revealedNumber ? 16.5 : 15.5,
              lineHeight: compact ? 17 : 21,
              fontWeight: "600",
              letterSpacing: revealedNumber ? 1.1 : 0.8,
              fontVariant: ["tabular-nums"],
            }}
          >
            {displayNumber ?? (zh ? method.currency : method.currency)}
          </Text>
        </View>

        <NetworkBadge
          badge={visual.badge}
          visual={visual}
          kindLabel={kindLabel}
          compact={compact}
        />
      </View>
    </View>
  );
}
