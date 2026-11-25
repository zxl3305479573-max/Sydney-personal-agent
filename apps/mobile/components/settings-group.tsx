import type { ColorTokens } from "@rakazo/ui-tokens";
import { typeScale } from "@rakazo/ui-tokens";
import type { ReactNode } from "react";
import { Children, Fragment, isValidElement } from "react";
import type { PressableProps, TextInputProps } from "react-native";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { mobileTokens } from "../lib/appearance";
import type { CardGradientTone } from "../lib/card-gradient";
import { native, useThemedStyles } from "../lib/native";
import { androidRipple } from "../lib/ripple";
import { useScopedTheme } from "../lib/scoped-theme-context";
import { stacksAtTextScale } from "../lib/text-scale";
import { GlassSurface } from "./glass-surface";
import { NativeSwitch } from "./native-switch";
import { Chevron } from "./row-accessories";

function isLightPalette(tokens?: Partial<ColorTokens> | null): boolean {
  const bg = tokens?.background;
  if (typeof bg === "string" && bg.startsWith("#") && bg.length >= 7) {
    const red = Number.parseInt(bg.slice(1, 3), 16);
    if (!Number.isNaN(red)) return red >= 128;
  }
  return true;
}

export function useStackedSettings(): boolean {
  return stacksAtTextScale(useWindowDimensions().fontScale);
}

export function SettingsLabel({ children }: { children: string }) {
  const styles = useThemedStyles(createSettingsStyles);
  const stacked = useStackedSettings();
  return (
    <Text accessibilityRole="header" style={[styles.groupLabel, stacked && styles.compactLabel]}>
      {children}
    </Text>
  );
}

export function SettingsFooter({ children }: { children: string }) {
  const styles = useThemedStyles(createSettingsStyles);
  const stacked = useStackedSettings();
  return <Text style={[styles.footer, stacked && styles.compactLabel]}>{children}</Text>;
}

export function SettingsGroup({
  label,
  accessibilityLabel,
  footer,
  gradient = "pearl",
  children,
}: {
  label?: string;
  accessibilityLabel?: string;
  footer?: string;
  gradient?: CardGradientTone | false;
  children: ReactNode;
}) {
  const styles = useThemedStyles(createSettingsStyles);
  const scope = useScopedTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  if (rows.length === 0) return null;
  const scopedCardFill = scope ? (scope.tokens?.card ?? native.groupedCell) : undefined;
  return (
    <View accessibilityLabel={accessibilityLabel} style={styles.group}>
      {label ? <SettingsLabel>{label}</SettingsLabel> : null}
      <GlassSurface
        shape="roundedRectangle"
        cornerRadius={20}
        gradient={scope ? false : gradient}
        style={[styles.card, scope ? { borderColor: scope.tokens?.border ?? native.separator } : null]}
        fallbackStyle={
          scopedCardFill
            ? { backgroundColor: scopedCardFill, borderRadius: 20 }
            : styles.cardFallback
        }
      >
        {rows.map((row, index) => (
          <Fragment key={row.key}>
            {index > 0 ? <View style={styles.separator} /> : null}
            {row}
          </Fragment>
        ))}
      </GlassSurface>
      {footer ? <SettingsFooter>{footer}</SettingsFooter> : null}
    </View>
  );
}

/** A native text field using the same insets and growing row height as settings actions. */
export function SettingsInputRow(props: Omit<TextInputProps, "style">) {
  const styles = useThemedStyles(createSettingsStyles);
  const stacked = useStackedSettings();
  return (
    <TextInput
      placeholderTextColor={native.tertiaryLabel}
      {...props}
      style={[styles.row, styles.title, styles.inputTitle, stacked && styles.compactRow]}
    />
  );
}

type SettingsRowProps = Omit<PressableProps, "children" | "style"> & {
  title: string;
  detail?: string;
  value?: string;
  chevron?: "right" | "down";
  prominent?: boolean;
  destructive?: boolean;
  tinted?: boolean;
  dimmed?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
};

export function SettingsRow({
  title,
  detail,
  value,
  chevron,
  prominent,
  destructive,
  tinted,
  dimmed,
  leading,
  trailing,
  ...props
}: SettingsRowProps) {
  const styles = useThemedStyles(createSettingsStyles);
  const largeText = useStackedSettings();
  const stacked = largeText || Boolean(detail && value);
  const end = (
    <>
      {value ? (
        <Text
          numberOfLines={stacked ? undefined : 1}
          style={[styles.value, !stacked && styles.inlineValue]}
        >
          {value}
        </Text>
      ) : null}
      {trailing}
    </>
  );
  const content = (
    <>
      {leading}
      <View style={styles.titleColumn}>
        <Text
          style={[
            styles.title,
            prominent && styles.prominent,
            tinted && styles.tinted,
            destructive && styles.destructive,
          ]}
        >
          {title}
        </Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        {stacked ? end : null}
      </View>
      {stacked ? null : end}
      {chevron ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Chevron expanded={chevron === "down"} />
        </View>
      ) : null}
    </>
  );
  if (!props.onPress) {
    return (
      <View
        accessible={props.accessible}
        accessibilityActions={props.accessibilityActions}
        accessibilityHint={props.accessibilityHint}
        accessibilityLabel={props.accessibilityLabel}
        accessibilityRole={props.accessibilityRole}
        accessibilityState={props.accessibilityState}
        accessibilityValue={props.accessibilityValue}
        onAccessibilityAction={props.onAccessibilityAction}
        style={[styles.row, largeText && styles.compactRow, dimmed && styles.dimmed]}
      >
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, detail, value].filter(Boolean).join(". ")}
      accessibilityState={{ disabled: props.disabled === true }}
      {...props}
      android_ripple={androidRipple()}
      style={({ pressed }) => [
        styles.row,
        largeText && styles.compactRow,
        pressed && Platform.OS !== "android" && styles.pressed,
        dimmed && styles.dimmed,
      ]}
    >
      {content}
    </Pressable>
  );
}

export function SettingsSwitch({
  label,
  accessibilityLabel,
  detail,
  value,
  disabled,
  onChange,
}: {
  label: string;
  accessibilityLabel?: string;
  detail?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  const styles = useThemedStyles(createSettingsStyles);
  const stacked = useStackedSettings();
  const toggle = (
    <View style={stacked ? styles.stackedSwitch : undefined}>
      <NativeSwitch
        accessibilityHint={detail}
        accessibilityLabel={accessibilityLabel ?? label}
        disabled={disabled}
        onValueChange={onChange}
        value={value}
      />
    </View>
  );
  return (
    <View style={[styles.row, stacked && styles.compactRow]}>
      <View style={styles.titleColumn}>
        <Text style={styles.title}>{label}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        {stacked ? toggle : null}
      </View>
      {stacked ? null : toggle}
    </View>
  );
}

function createSettingsStyles(passedTokens?: ColorTokens) {
  const tokens = passedTokens ?? mobileTokens();
  const isLight = isLightPalette(tokens);
  const hairline = StyleSheet.hairlineWidth ?? 0.5;
  return StyleSheet.create({
    group: { gap: 10 },
    groupLabel: {
      color: native.label,
      ...typeScale.cardTitle,
      paddingStart: 4,
    },
    footer: {
      color: native.secondaryLabel,
      ...typeScale.caption,
      paddingHorizontal: 4,
    },
    card: {
      borderRadius: 20,
      borderCurve: "continuous",
      borderWidth: hairline,
      borderColor: isLight ? "rgba(38, 35, 31, 0.055)" : "rgba(245, 244, 240, 0.09)",
      shadowColor: "#26231F",
      shadowOpacity: isLight ? 0.028 : 0.16,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 5 },
      elevation: 1,
      overflow: "hidden",
    },
    cardFallback: {
      backgroundColor: isLight ? "#FFFEFC" : "#242933",
      borderRadius: 20,
    },
    separator: {
      // iOS draws sheets scaled down slightly, which makes a one-pixel line fall between
      // pixels and vanish at some offsets. Two pixels always leave at least one visible.
      height: hairline * 2,
      marginStart: 16,
      backgroundColor: native.separator,
    },
    row: {
      minHeight: 56,
      paddingHorizontal: 16,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    compactLabel: { paddingStart: 4 },
    compactRow: { paddingHorizontal: 12, gap: 8 },
    titleColumn: { flex: 1, minWidth: 0, gap: 4 },
    stackedSwitch: { alignSelf: "flex-start", marginTop: 6 },
    title: { color: native.label, ...typeScale.body },
    inputTitle: { fontSize: 17 },
    prominent: { fontSize: 20, fontWeight: "600" },
    detail: { color: native.secondaryLabel, ...typeScale.caption },
    destructive: { color: tokens.destructive },
    tinted: { color: tokens.link },
    value: { flexShrink: 1, color: native.secondaryLabel, ...typeScale.secondary },
    // A long value truncates instead of pushing the title out of the row.
    inlineValue: { maxWidth: "45%" },
    pressed: { backgroundColor: native.fillPressed },
    dimmed: { opacity: 0.45 },
  });
}
