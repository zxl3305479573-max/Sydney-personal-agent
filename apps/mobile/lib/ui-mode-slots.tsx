import { darkTokens } from "@rakazo/ui-tokens";
import type { ReactNode } from "react";
import { Component, createContext, useContext } from "react";
import type { ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";
import { MotionPressable } from "../components/motion-pressable";
import { classicUiMode } from "../ui-modes/classic";
import type {
  ModeApprovalContainerSlotProps,
  ModeCardSlotProps,
  ModeCodeContainerSlotProps,
  ModeTelemetryBannerSlotProps,
  ModeTriggerSlotProps,
  ResolvedUiModeTheme,
  UiModeDefinition,
  UiModeGeometryTokens,
  UiModeGlassPolicy,
  UiModePrimitiveSlots,
  UiModeScreenSlotKey,
  UiModeScreenSlots,
  UiModeSnapshot,
  UiModeTypographyTokens,
} from "../ui-modes/types";
import { CLASSIC_UI_MODE_ID } from "../ui-modes/types";

const DEFAULT_CLASSIC_GEOMETRY: UiModeGeometryTokens = classicUiMode.geometry;

const DEFAULT_CLASSIC_TYPOGRAPHY: UiModeTypographyTokens = {
  uppercaseLabels: false,
  letterSpacingScale: 1,
};

const DEFAULT_CLASSIC_GLASS_POLICY: UiModeGlassPolicy = classicUiMode.glassPolicy;

const DEFAULT_CLASSIC_MODE_DEFINITION: UiModeDefinition = classicUiMode;

export const DEFAULT_CLASSIC_RESOLVED_THEME: ResolvedUiModeTheme = {
  mode: DEFAULT_CLASSIC_MODE_DEFINITION,
  appearance: "dark",
  tokens: darkTokens,
  geometry: DEFAULT_CLASSIC_GEOMETRY,
  typography: DEFAULT_CLASSIC_TYPOGRAPHY,
  glassPolicy: DEFAULT_CLASSIC_GLASS_POLICY,
  systemColorPolicy: "platform",
  chatAppearancePolicy: "preserve",
  hapticProfile: "subtle",
};

export const DEFAULT_CLASSIC_SNAPSHOT: UiModeSnapshot = {
  activeModeId: CLASSIC_UI_MODE_ID,
  savedModeId: CLASSIC_UI_MODE_ID,
  previewModeId: null,
  lastAlternateModeId: null,
  isClassic: true,
  hydrated: false,
};

export type UiModeRuntimeContextValue = {
  snapshot: UiModeSnapshot;
  theme: ResolvedUiModeTheme;
  onModeRenderError?: (error: Error, modeId: string) => void;
};

const DEFAULT_RUNTIME_CONTEXT_VALUE: UiModeRuntimeContextValue = {
  snapshot: DEFAULT_CLASSIC_SNAPSHOT,
  theme: DEFAULT_CLASSIC_RESOLVED_THEME,
};

export const UiModeThemeContext = createContext<ResolvedUiModeTheme>(
  DEFAULT_CLASSIC_RESOLVED_THEME,
);

export const UiModeRuntimeContext = createContext<UiModeRuntimeContextValue>(
  DEFAULT_RUNTIME_CONTEXT_VALUE,
);

export type UiModeRuntimeProviderProps = {
  value: UiModeRuntimeContextValue;
  children: ReactNode;
};

export function UiModeRuntimeProvider({ value, children }: UiModeRuntimeProviderProps) {
  return (
    <UiModeRuntimeContext.Provider value={value}>
      <UiModeThemeContext.Provider value={value.theme}>{children}</UiModeThemeContext.Provider>
    </UiModeRuntimeContext.Provider>
  );
}

export function useUiModeRuntime(): UiModeRuntimeContextValue {
  return useContext(UiModeRuntimeContext);
}

export const useUiMode = useUiModeRuntime;

export function useUiModeTheme(): ResolvedUiModeTheme {
  const themeContext = useContext(UiModeThemeContext);
  const runtimeContext = useContext(UiModeRuntimeContext);
  if (
    themeContext === DEFAULT_CLASSIC_RESOLVED_THEME &&
    runtimeContext !== DEFAULT_RUNTIME_CONTEXT_VALUE
  ) {
    return runtimeContext.theme;
  }
  return themeContext;
}

function resolveCornerRadius(geometry: UiModeGeometryTokens, radius: number): number {
  return geometry.cornerShape === "sharp" ? 0 : radius;
}

function resolveLabelTracking(typography: UiModeTypographyTokens, base = 0): number | undefined {
  if (typography.letterSpacingScale === 1 && base === 0) {
    return undefined;
  }
  const baseTracking = base === 0 ? 0.4 : base;
  return Number((baseTracking * typography.letterSpacingScale).toFixed(2));
}

function ClassicCard({
  variant = "default",
  style,
  children,
  testID,
  accessibilityLabel,
  accessibilityRole,
  accessibilityLiveRegion,
}: ModeCardSlotProps) {
  const { tokens, geometry } = useUiModeTheme();

  let backgroundColor = tokens.card;
  let borderColor = tokens.border;
  if (variant === "elevated") {
    backgroundColor = tokens.popover;
    borderColor = tokens.glassStroke;
  } else if (variant === "accent") {
    backgroundColor = tokens.accent;
    borderColor = tokens.ring;
  } else if (variant === "telemetry") {
    backgroundColor = tokens.muted;
    borderColor = tokens.border;
  }

  const cardSurfaceStyle: ViewStyle = {
    backgroundColor,
    borderColor,
    borderTopColor: geometry.topSpecularHighlight ?? borderColor,
    borderRadius: resolveCornerRadius(geometry, geometry.cardRadius),
    borderWidth: geometry.borderWidth,
  };

  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityLiveRegion={accessibilityLiveRegion}
      style={[styles.card, cardSurfaceStyle, style]}
    >
      {children}
    </View>
  );
}

function ClassicTrigger({
  label,
  onPress,
  disabled = false,
  tone = "primary",
  icon,
  style,
  textStyle,
  testID,
  accessibilityLabel,
}: ModeTriggerSlotProps) {
  const { tokens, geometry, typography } = useUiModeTheme();

  let backgroundColor = tokens.primary;
  let foregroundColor = tokens.primaryForeground;
  let borderColor = "transparent";
  let borderWidth = 0;

  if (tone === "secondary") {
    backgroundColor = tokens.secondary;
    foregroundColor = tokens.secondaryForeground;
    borderColor = tokens.border;
    borderWidth = geometry.borderWidth;
  } else if (tone === "destructive") {
    backgroundColor = tokens.destructiveFill;
    foregroundColor = tokens.destructiveForeground;
    borderColor = tokens.destructive;
    borderWidth = geometry.borderWidth;
  }

  const isDisabled = Boolean(disabled);
  const letterSpacing = resolveLabelTracking(typography);

  return (
    <MotionPressable
      preset="control"
      testID={testID}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled }}
      onPress={isDisabled ? undefined : onPress}
      style={[
        styles.trigger,
        {
          backgroundColor,
          borderColor,
          borderWidth,
          borderRadius: resolveCornerRadius(geometry, geometry.controlRadius),
        },
        isDisabled ? styles.disabled : null,
        style,
      ]}
    >
      {icon}
      <Text
        style={[
          styles.triggerLabel,
          {
            color: foregroundColor,
            fontFamily: typography.bodyFamily,
            textTransform: typography.uppercaseLabels ? "uppercase" : "none",
            ...(letterSpacing !== undefined ? { letterSpacing } : null),
          },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </MotionPressable>
  );
}

function ClassicCodeContainer({
  title,
  language,
  meta,
  style,
  testID,
  children,
}: ModeCodeContainerSlotProps) {
  const { tokens, geometry, typography } = useUiModeTheme();
  const hasHeader = Boolean(title || language || meta);

  return (
    <View
      testID={testID}
      accessibilityLabel={title ?? language}
      style={[
        styles.codeContainer,
        {
          backgroundColor: tokens.muted,
          borderColor: tokens.border,
          borderTopColor: geometry.topSpecularHighlight ?? tokens.border,
          borderRadius: resolveCornerRadius(geometry, geometry.cardRadius),
          borderWidth: geometry.borderWidth,
        },
        style,
      ]}
    >
      {hasHeader ? (
        <View
          style={[
            styles.codeHeader,
            {
              borderBottomColor: tokens.border,
              borderBottomWidth: StyleSheet.hairlineWidth || 1,
            },
          ]}
        >
          <View style={styles.codeHeaderMain}>
            {title ? (
              <Text
                style={[
                  styles.codeTitle,
                  { color: tokens.foreground, fontFamily: typography.bodyFamily },
                ]}
              >
                {title}
              </Text>
            ) : null}
            {language ? (
              <Text
                style={[
                  styles.codeLanguage,
                  {
                    color: tokens.mutedForeground,
                    fontFamily: typography.monoFamily,
                    textTransform: typography.uppercaseLabels ? "uppercase" : "none",
                  },
                ]}
              >
                {language}
              </Text>
            ) : null}
          </View>
          {meta ? (
            <Text
              style={[
                styles.codeMeta,
                { color: tokens.faintForeground, fontFamily: typography.monoFamily },
              ]}
            >
              {meta}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.codeBody}>{children}</View>
    </View>
  );
}

function ClassicApprovalContainer({
  title,
  subtitle,
  badge,
  approveLabel = "Approve",
  rejectLabel = "Reject",
  busy = false,
  onApprove,
  onReject,
  style,
  testID,
  children,
}: ModeApprovalContainerSlotProps) {
  const { tokens, geometry, typography } = useUiModeTheme();
  const isBusy = Boolean(busy);

  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLabel={title}
      accessibilityLiveRegion="polite"
      style={[
        styles.approvalContainer,
        {
          backgroundColor: tokens.card,
          borderColor: tokens.warning,
          borderTopColor: geometry.topSpecularHighlight ?? tokens.warning,
          borderRadius: resolveCornerRadius(geometry, geometry.cardRadius),
          borderWidth: geometry.borderWidth,
        },
        style,
      ]}
    >
      <View style={styles.approvalHeader}>
        <View style={styles.approvalHeaderRow}>
          <Text
            accessibilityRole="header"
            style={[
              styles.approvalTitle,
              {
                color: tokens.cardForeground,
                fontFamily: typography.displayFamily ?? typography.bodyFamily,
              },
            ]}
          >
            {title}
          </Text>
          {badge ? (
            <View
              style={[
                styles.approvalBadge,
                {
                  borderColor: tokens.warning,
                  borderRadius: resolveCornerRadius(geometry, geometry.pillRadius),
                  borderWidth: geometry.borderWidth,
                },
              ]}
            >
              <Text
                style={[
                  styles.approvalBadgeText,
                  {
                    color: tokens.warning,
                    fontFamily: typography.monoFamily ?? typography.bodyFamily,
                    textTransform: typography.uppercaseLabels ? "uppercase" : "none",
                  },
                ]}
              >
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        {subtitle ? (
          <Text
            style={[
              styles.approvalSubtitle,
              { color: tokens.mutedForeground, fontFamily: typography.bodyFamily },
            ]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children ? <View style={styles.approvalBody}>{children}</View> : null}
      <View style={styles.approvalActions}>
        <ClassicTrigger
          testID={testID ? `${testID}-reject` : undefined}
          label={rejectLabel}
          tone="secondary"
          disabled={isBusy || !onReject}
          onPress={onReject}
          style={styles.approvalButton}
        />
        <ClassicTrigger
          testID={testID ? `${testID}-approve` : undefined}
          label={approveLabel}
          tone="primary"
          disabled={isBusy || !onApprove}
          onPress={onApprove}
          style={styles.approvalButton}
        />
      </View>
    </View>
  );
}

function ClassicTelemetryBanner({
  title,
  statusLabel,
  active = false,
  metrics,
  action,
  style,
  testID,
}: ModeTelemetryBannerSlotProps) {
  const { tokens, geometry, typography } = useUiModeTheme();
  const statusDotColor = active ? tokens.workingDot : tokens.faintForeground;
  const borderColor = active ? tokens.statusWorking : tokens.border;

  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      accessibilityLabel={statusLabel ? `${title}: ${statusLabel}` : title}
      accessibilityLiveRegion="polite"
      style={[
        styles.telemetryBanner,
        {
          backgroundColor: tokens.card,
          borderColor,
          borderTopColor: geometry.topSpecularHighlight ?? borderColor,
          borderRadius: resolveCornerRadius(geometry, geometry.cardRadius),
          borderWidth: geometry.borderWidth,
        },
        style,
      ]}
    >
      <View style={styles.telemetryHeader}>
        <View style={styles.telemetryTitleRow}>
          <View
            style={[
              styles.telemetryDot,
              {
                backgroundColor: statusDotColor,
                borderRadius: resolveCornerRadius(geometry, geometry.pillRadius),
              },
            ]}
          />
          <Text
            style={[
              styles.telemetryTitle,
              {
                color: tokens.cardForeground,
                fontFamily: typography.displayFamily ?? typography.bodyFamily,
              },
            ]}
          >
            {title}
          </Text>
          {statusLabel ? (
            <Text
              style={[
                styles.telemetryStatus,
                {
                  color: active ? tokens.statusWorking : tokens.mutedForeground,
                  fontFamily: typography.monoFamily ?? typography.bodyFamily,
                  textTransform: typography.uppercaseLabels ? "uppercase" : "none",
                },
              ]}
            >
              {statusLabel}
            </Text>
          ) : null}
        </View>
        {action ? <View style={styles.telemetryAction}>{action}</View> : null}
      </View>
      {metrics && metrics.length > 0 ? (
        <View style={styles.telemetryMetrics}>
          {metrics.map((metric, index) => (
            <View key={`${metric.label}-${index}`} style={styles.telemetryMetricItem}>
              <Text
                style={[
                  styles.telemetryMetricLabel,
                  {
                    color: tokens.mutedForeground,
                    fontFamily: typography.bodyFamily,
                    textTransform: typography.uppercaseLabels ? "uppercase" : "none",
                  },
                ]}
              >
                {metric.label}
              </Text>
              <Text
                style={[
                  styles.telemetryMetricValue,
                  {
                    color: metric.accent ? tokens.link : tokens.cardForeground,
                    fontFamily: typography.monoFamily ?? typography.bodyFamily,
                  },
                ]}
              >
                {metric.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export const classicPrimitiveSlots: UiModePrimitiveSlots = {
  Card: ClassicCard,
  Trigger: ClassicTrigger,
  CodeContainer: ClassicCodeContainer,
  ApprovalContainer: ClassicApprovalContainer,
  TelemetryBanner: ClassicTelemetryBanner,
};

export function resolveUiModePrimitive<K extends keyof UiModePrimitiveSlots>(
  modeOrTheme: UiModeDefinition | ResolvedUiModeTheme,
  slot: K,
): UiModePrimitiveSlots[K] {
  const mode = "mode" in modeOrTheme ? modeOrTheme.mode : modeOrTheme;
  if (mode.id === CLASSIC_UI_MODE_ID) {
    return classicPrimitiveSlots[slot];
  }
  return (mode.primitives?.[slot] ?? classicPrimitiveSlots[slot]) as UiModePrimitiveSlots[K];
}

export function resolveUiModeScreen<K extends UiModeScreenSlotKey>(
  modeOrTheme: UiModeDefinition | ResolvedUiModeTheme,
  slot: K,
): UiModeScreenSlots[K] | undefined {
  const mode = "mode" in modeOrTheme ? modeOrTheme.mode : modeOrTheme;
  if (mode.id === CLASSIC_UI_MODE_ID) {
    return undefined;
  }
  return mode.screens?.[slot];
}

export function useUiModePrimitive<K extends keyof UiModePrimitiveSlots>(
  slot: K,
): UiModePrimitiveSlots[K] {
  const theme = useUiModeTheme();
  return resolveUiModePrimitive(theme, slot);
}

export type UiModeCrashBoundaryProps = {
  modeId: string;
  fallback: ReactNode | (() => ReactNode);
  onModeError?: (error: Error, modeId: string) => void;
  children: ReactNode;
};

type UiModeCrashBoundaryState = {
  trackedModeId: string;
  failedError: Error | null;
};

function normalizeModeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(typeof error === "string" ? error : "Unknown UI mode render error");
}

export class UiModeCrashBoundary extends Component<
  UiModeCrashBoundaryProps,
  UiModeCrashBoundaryState
> {
  override state: UiModeCrashBoundaryState = {
    trackedModeId: this.props.modeId,
    failedError: null,
  };

  static getDerivedStateFromProps(
    nextProps: UiModeCrashBoundaryProps,
    prevState: UiModeCrashBoundaryState,
  ): Partial<UiModeCrashBoundaryState> | null {
    if (nextProps.modeId !== prevState.trackedModeId) {
      return {
        trackedModeId: nextProps.modeId,
        failedError: null,
      };
    }
    return null;
  }

  static getDerivedStateFromError(error: unknown): Partial<UiModeCrashBoundaryState> {
    return {
      failedError: normalizeModeError(error),
    };
  }

  override componentDidCatch(error: Error): void {
    if (this.props.modeId === CLASSIC_UI_MODE_ID) {
      return;
    }
    this.props.onModeError?.(normalizeModeError(error), this.props.modeId);
  }

  override componentDidUpdate(prevProps: UiModeCrashBoundaryProps): void {
    if (
      prevProps.modeId !== this.props.modeId &&
      (this.state.failedError !== null || this.state.trackedModeId !== this.props.modeId)
    ) {
      this.setState({
        trackedModeId: this.props.modeId,
        failedError: null,
      });
    }
  }

  override render(): ReactNode {
    if (this.state.failedError !== null && this.state.trackedModeId === this.props.modeId) {
      if (this.props.modeId === CLASSIC_UI_MODE_ID) {
        throw this.state.failedError;
      }
      return typeof this.props.fallback === "function"
        ? this.props.fallback()
        : this.props.fallback;
    }
    return this.props.children;
  }
}

export type UiModeScreenHostProps<TController> = {
  slot: UiModeScreenSlotKey;
  controller: TController;
  renderClassic: () => ReactNode;
};

export function UiModeScreenHost<TController>({
  slot,
  controller,
  renderClassic,
}: UiModeScreenHostProps<TController>) {
  const { onModeRenderError } = useUiModeRuntime();
  const theme = useUiModeTheme();
  const CustomScreen = resolveUiModeScreen(theme, slot);

  if (!CustomScreen) {
    return <>{renderClassic()}</>;
  }

  return (
    <UiModeCrashBoundary
      modeId={theme.mode.id}
      fallback={renderClassic}
      onModeError={onModeRenderError}
    >
      <CustomScreen controller={controller} renderClassic={renderClassic} />
    </UiModeCrashBoundary>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  triggerLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.5,
  },
  codeContainer: {
    overflow: "hidden",
  },
  codeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  codeHeaderMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  codeTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  codeLanguage: {
    fontSize: 12,
  },
  codeMeta: {
    fontSize: 12,
  },
  codeBody: {
    padding: 12,
  },
  approvalContainer: {
    gap: 12,
    padding: 16,
  },
  approvalHeader: {
    gap: 4,
  },
  approvalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  approvalTitle: {
    fontSize: 16,
    fontWeight: "600",
    flexShrink: 1,
  },
  approvalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  approvalBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  approvalSubtitle: {
    fontSize: 14,
  },
  approvalBody: {
    gap: 8,
  },
  approvalActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  approvalButton: {
    minWidth: 88,
  },
  telemetryBanner: {
    gap: 10,
    padding: 14,
  },
  telemetryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  telemetryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  telemetryDot: {
    width: 8,
    height: 8,
  },
  telemetryTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  telemetryStatus: {
    fontSize: 12,
    fontWeight: "500",
  },
  telemetryAction: {
    flexShrink: 0,
  },
  telemetryMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  telemetryMetricItem: {
    gap: 2,
  },
  telemetryMetricLabel: {
    fontSize: 11,
  },
  telemetryMetricValue: {
    fontSize: 13,
    fontWeight: "600",
  },
});
