// @vitest-environment jsdom
import { darkTokens } from "@rakazo/ui-tokens";
import type { CSSProperties, ReactNode } from "react";
import { act, Component, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ModeApprovalContainerSlotProps,
  ModeCardSlotProps,
  ModeTriggerSlotProps,
  ResolvedUiModeTheme,
  UiModeDefinition,
} from "../ui-modes/types";
import { CLASSIC_UI_MODE_ID, defineUiModeScreenSlot } from "../ui-modes/types";
import type { UiModeRuntimeContextValue } from "./ui-mode-slots";
import {
  classicPrimitiveSlots,
  DEFAULT_CLASSIC_RESOLVED_THEME,
  DEFAULT_CLASSIC_SNAPSHOT,
  UiModeCrashBoundary,
  UiModeRuntimeProvider,
  UiModeScreenHost,
  UiModeThemeContext,
  useUiModePrimitive,
  useUiModeTheme,
} from "./ui-mode-slots";

function flattenMockStyle(style: unknown): CSSProperties {
  if (!style) return {};
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.map((entry) => flattenMockStyle(entry)));
  }
  if (typeof style === "object") {
    return style as CSSProperties;
  }
  return {};
}

vi.mock("react-native", () => ({
  StyleSheet: {
    hairlineWidth: 1,
    create: <T,>(styles: T): T => styles,
  },
  View: ({
    children,
    testID,
    accessibilityLabel,
    accessibilityRole,
    accessibilityLiveRegion,
    style,
  }: {
    children?: ReactNode;
    testID?: string;
    accessibilityLabel?: string;
    accessibilityRole?: string;
    accessibilityLiveRegion?: "none" | "polite" | "assertive";
    style?: unknown;
  }) => (
    <div
      data-testid={testID}
      data-accessibility-label={accessibilityLabel}
      role={accessibilityRole}
      aria-live={accessibilityLiveRegion === "none" ? "off" : accessibilityLiveRegion}
      style={flattenMockStyle(style)}
    >
      {children}
    </div>
  ),
  Text: ({
    children,
    testID,
    accessibilityRole,
    style,
  }: {
    children?: ReactNode;
    testID?: string;
    accessibilityRole?: string;
    style?: unknown;
  }) => (
    <span data-testid={testID} role={accessibilityRole} style={flattenMockStyle(style)}>
      {children}
    </span>
  ),
  Pressable: ({
    children,
    onPress,
    disabled,
    testID,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    style,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    testID?: string;
    accessibilityLabel?: string;
    accessibilityRole?: string;
    accessibilityState?: { disabled?: boolean };
    style?: unknown;
  }) => (
    <button
      type="button"
      data-testid={testID}
      data-accessibility-label={accessibilityLabel}
      data-role={accessibilityRole}
      aria-disabled={accessibilityState?.disabled}
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onPress?.();
        }
      }}
      style={flattenMockStyle(style)}
    >
      {children}
    </button>
  ),
}));

type RootCatchState = { caught: Error | null };

class RootTestBoundary extends Component<
  { onCatch?: (error: Error) => void; children: ReactNode },
  RootCatchState
> {
  override state: RootCatchState = { caught: null };

  static getDerivedStateFromError(error: unknown): RootCatchState {
    return { caught: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error): void {
    this.props.onCatch?.(error);
  }

  override render(): ReactNode {
    if (this.state.caught) {
      return <div data-testid="root-error-fallback">{this.state.caught.message}</div>;
    }
    return this.props.children;
  }
}

function buildCustomTheme(
  overrides: Partial<UiModeDefinition> & { id: string },
  tokenOverrides?: Partial<typeof darkTokens>,
): ResolvedUiModeTheme {
  const geometry = overrides.geometry ?? {
    cardRadius: 4,
    controlRadius: 2,
    pillRadius: 6,
    borderWidth: 2,
    cornerShape: "sharp" as const,
    chamferSize: 0,
    topSpecularHighlight: "#FFAA00",
  };
  const typography = overrides.typography ?? {
    monoFamily: "JetBrainsMono",
    bodyFamily: "Inter",
    uppercaseLabels: true,
    letterSpacingScale: 1.5,
  };
  const glassPolicy = overrides.glassPolicy ?? {
    mode: "solid-fallback" as const,
    defaultCornerRadius: 0,
  };
  const mode: UiModeDefinition = {
    name: overrides.name ?? "Custom Deck",
    description: overrides.description ?? "Test custom UI mode",
    version: overrides.version ?? "1.0.0",
    supportedPlatforms: overrides.supportedPlatforms ?? ["ios"],
    colorSchemeLock: overrides.colorSchemeLock ?? "dark",
    systemColorPolicy: overrides.systemColorPolicy ?? "tokens",
    glassPolicy,
    chatAppearancePolicy: overrides.chatAppearancePolicy ?? "suspend",
    hapticProfile: overrides.hapticProfile ?? "tactile",
    geometry,
    typography,
    ...overrides,
  };

  return {
    mode,
    appearance: "dark",
    tokens: {
      ...darkTokens,
      card: "#101820",
      primary: "#00F5D4",
      primaryForeground: "#041014",
      muted: "#0B1218",
      ...tokenOverrides,
    },
    geometry,
    typography,
    glassPolicy,
    systemColorPolicy: mode.systemColorPolicy,
    chatAppearancePolicy: mode.chatAppearancePolicy,
    hapticProfile: mode.hapticProfile,
  };
}

function buildRuntimeValue(
  theme: ResolvedUiModeTheme,
  onModeRenderError?: UiModeRuntimeContextValue["onModeRenderError"],
): UiModeRuntimeContextValue {
  const isClassic = theme.mode.id === CLASSIC_UI_MODE_ID;
  return {
    snapshot: {
      ...DEFAULT_CLASSIC_SNAPSHOT,
      activeModeId: theme.mode.id,
      savedModeId: theme.mode.id,
      lastAlternateModeId: isClassic ? null : theme.mode.id,
      isClassic,
      hydrated: true,
    },
    theme,
    onModeRenderError,
  };
}

let mountedContainers: HTMLDivElement[] = [];
let mountedRoots: ReturnType<typeof createRoot>[] = [];

function mountClient(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedContainers.push(container);
  mountedRoots.push(root);
  act(() => {
    root.render(node);
  });
  return {
    container,
    rerender(nextNode: ReactNode) {
      act(() => {
        root.render(nextNode);
      });
    },
  };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  for (const root of mountedRoots) {
    act(() => {
      root.unmount();
    });
  }
  for (const container of mountedContainers) {
    container.remove();
  }
  mountedRoots = [];
  mountedContainers = [];
  vi.restoreAllMocks();
});

describe("ui-mode-slots", () => {
  it("renders renderClassic directly and resolves classicPrimitiveSlots in default classic mode", () => {
    expect(DEFAULT_CLASSIC_RESOLVED_THEME.mode.id).toBe(CLASSIC_UI_MODE_ID);
    expect(DEFAULT_CLASSIC_RESOLVED_THEME.tokens).toBe(darkTokens);

    function ClassicProbe() {
      const Card = useUiModePrimitive("Card");
      const Trigger = useUiModePrimitive("Trigger");
      const CodeContainer = useUiModePrimitive("CodeContainer");
      const ApprovalContainer = useUiModePrimitive("ApprovalContainer");
      const TelemetryBanner = useUiModePrimitive("TelemetryBanner");

      expect(Card).toBe(classicPrimitiveSlots.Card);
      expect(Trigger).toBe(classicPrimitiveSlots.Trigger);
      expect(CodeContainer).toBe(classicPrimitiveSlots.CodeContainer);
      expect(ApprovalContainer).toBe(classicPrimitiveSlots.ApprovalContainer);
      expect(TelemetryBanner).toBe(classicPrimitiveSlots.TelemetryBanner);

      return (
        <UiModeScreenHost
          slot="inbox"
          controller={{ unreadCount: 3 }}
          renderClassic={() => (
            <Card
              testID="classic-card"
              accessibilityLabel="Inbox summary"
              accessibilityRole="summary"
              accessibilityLiveRegion="polite"
            >
              <Trigger testID="classic-trigger" label="Refresh" />
              <CodeContainer testID="classic-code" title="agent.ts" language="ts" meta="12 lines">
                <span>const ok = true;</span>
              </CodeContainer>
              <TelemetryBanner
                testID="classic-telemetry"
                title="Sandbox"
                statusLabel="Running"
                active
                metrics={[{ label: "CPU", value: "14%", accent: true }]}
              />
            </Card>
          )}
        />
      );
    }

    const markup = renderToStaticMarkup(<ClassicProbe />);
    const doc = new DOMParser().parseFromString(markup, "text/html");

    const card = doc.querySelector('[data-testid="classic-card"]');
    expect(card?.getAttribute("data-accessibility-label")).toBe("Inbox summary");
    expect(card?.getAttribute("role")).toBe("summary");
    expect(card?.getAttribute("aria-live")).toBe("polite");

    const trigger = doc.querySelector('[data-testid="classic-trigger"]');
    expect(trigger?.textContent).toBe("Refresh");
    expect(trigger?.getAttribute("data-role")).toBe("button");
    expect(trigger?.getAttribute("data-accessibility-label")).toBe("Refresh");

    expect(doc.querySelector('[data-testid="classic-code"]')?.textContent).toContain("agent.ts");
    expect(doc.querySelector('[data-testid="classic-telemetry"]')?.textContent).toContain("14%");
  });

  it("wires disabled, busy, onPress, onApprove, and onReject handlers on classic primitives", () => {
    const onPress = vi.fn();
    const onDisabledPress = vi.fn();
    const onApprove = vi.fn();
    const onReject = vi.fn();

    const { container, rerender } = mountClient(
      <UiModeThemeContext.Provider value={DEFAULT_CLASSIC_RESOLVED_THEME}>
        <classicPrimitiveSlots.Trigger testID="run-btn" label="Run" onPress={onPress} />
        <classicPrimitiveSlots.Trigger
          testID="disabled-btn"
          label="Locked"
          disabled
          onPress={onDisabledPress}
        />
        <classicPrimitiveSlots.ApprovalContainer
          testID="gate"
          title="Execute shell command?"
          subtitle="rm -rf ./tmp"
          badge="HIGH RISK"
          approveLabel="Allow"
          rejectLabel="Deny"
          onApprove={onApprove}
          onReject={onReject}
        />
      </UiModeThemeContext.Provider>,
    );

    const runBtn = container.querySelector('[data-testid="run-btn"]') as HTMLButtonElement;
    const disabledBtn = container.querySelector(
      '[data-testid="disabled-btn"]',
    ) as HTMLButtonElement;
    const approveBtn = container.querySelector('[data-testid="gate-approve"]') as HTMLButtonElement;
    const rejectBtn = container.querySelector('[data-testid="gate-reject"]') as HTMLButtonElement;

    expect(disabledBtn.disabled).toBe(true);
    act(() => {
      runBtn.click();
      disabledBtn.click();
      approveBtn.click();
      rejectBtn.click();
    });

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onDisabledPress).not.toHaveBeenCalled();
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);

    rerender(
      <UiModeThemeContext.Provider value={DEFAULT_CLASSIC_RESOLVED_THEME}>
        <classicPrimitiveSlots.ApprovalContainer
          testID="gate"
          title="Execute shell command?"
          busy
          onApprove={onApprove}
          onReject={onReject}
        />
      </UiModeThemeContext.Provider>,
    );

    const busyApprove = container.querySelector(
      '[data-testid="gate-approve"]',
    ) as HTMLButtonElement;
    expect(busyApprove.disabled).toBe(true);
    act(() => {
      busyApprove.click();
    });
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("renders overridden primitives while non-overridden slots fall back to classicPrimitiveSlots with mode tokens", () => {
    const CustomCard = ({ testID, children }: ModeCardSlotProps) => (
      <section data-testid={testID} data-custom-primitive="card">
        {children}
      </section>
    );
    const CustomTrigger = ({ testID, label, onPress }: ModeTriggerSlotProps) => (
      <button
        type="button"
        data-testid={testID}
        data-custom-primitive="trigger"
        onClick={() => onPress?.()}
      >
        [{label}]
      </button>
    );
    const CustomApproval = ({ testID, title, onApprove }: ModeApprovalContainerSlotProps) => (
      <div data-testid={testID} data-custom-primitive="approval">
        <span>{title}</span>
        <button type="button" data-testid={`${testID}-custom-ok`} onClick={() => onApprove?.()}>
          CONFIRM
        </button>
      </div>
    );

    const customTheme = buildCustomTheme(
      {
        id: "tactical-deck",
        primitives: {
          Card: CustomCard,
          Trigger: CustomTrigger,
          ApprovalContainer: CustomApproval,
        },
      },
      { muted: "rgb(11, 18, 24)", card: "rgb(16, 24, 32)" },
    );

    function SlotConsumer() {
      const theme = useUiModeTheme();
      const Card = useUiModePrimitive("Card");
      const Trigger = useUiModePrimitive("Trigger");
      const CodeContainer = useUiModePrimitive("CodeContainer");
      const ApprovalContainer = useUiModePrimitive("ApprovalContainer");
      const TelemetryBanner = useUiModePrimitive("TelemetryBanner");

      expect(theme.mode.id).toBe("tactical-deck");
      expect(Card).toBe(CustomCard);
      expect(Trigger).toBe(CustomTrigger);
      expect(ApprovalContainer).toBe(CustomApproval);
      expect(CodeContainer).toBe(classicPrimitiveSlots.CodeContainer);
      expect(TelemetryBanner).toBe(classicPrimitiveSlots.TelemetryBanner);

      return (
        <Card testID="slot-card">
          <Trigger testID="slot-trigger" label="Deploy" />
          <ApprovalContainer testID="slot-approval" title="Authorize deploy" />
          <CodeContainer testID="fallback-code" title="deploy.sh" language="sh">
            <span>pnpm start</span>
          </CodeContainer>
          <TelemetryBanner testID="fallback-telemetry" title="Link" statusLabel="Online" active />
        </Card>
      );
    }

    const markup = renderToStaticMarkup(
      <UiModeRuntimeProvider value={buildRuntimeValue(customTheme)}>
        <SlotConsumer />
      </UiModeRuntimeProvider>,
    );
    const doc = new DOMParser().parseFromString(markup, "text/html");

    expect(
      doc.querySelector('[data-testid="slot-card"]')?.getAttribute("data-custom-primitive"),
    ).toBe("card");
    expect(doc.querySelector('[data-testid="slot-trigger"]')?.textContent).toBe("[Deploy]");
    expect(
      doc.querySelector('[data-testid="slot-approval"]')?.getAttribute("data-custom-primitive"),
    ).toBe("approval");

    const fallbackCode = doc.querySelector('[data-testid="fallback-code"]') as HTMLElement;
    expect(fallbackCode).not.toBeNull();
    expect(fallbackCode.style.backgroundColor).toBe("rgb(11, 18, 24)");
    expect(fallbackCode.style.borderRadius).toBe("0px");
  });

  it("renders custom screens.inbox with controller data and renderClassic delegate while preserving hook order across switches", () => {
    type InboxController = {
      activeFilter: string;
      sessionCount: number;
    };

    const CustomInboxScreen = defineUiModeScreenSlot<InboxController>(
      ({ controller, renderClassic }) => {
        const [hudExpanded] = useState(true);
        return (
          <div data-testid="custom-inbox-screen" data-hud={String(hudExpanded)}>
            <span data-testid="custom-controller-summary">
              {controller.activeFilter}:{controller.sessionCount}
            </span>
            <div data-testid="delegated-classic">{renderClassic()}</div>
          </div>
        );
      },
    );

    const customTheme = buildCustomTheme({
      id: "matrix-hud",
      screens: {
        inbox: CustomInboxScreen,
      },
    });

    function InboxControllerHost({ runtime }: { runtime: UiModeRuntimeContextValue }) {
      const [sessionCount, setSessionCount] = useState(4);
      const controller = useMemo<InboxController>(
        () => ({ activeFilter: "unread", sessionCount }),
        [sessionCount],
      );

      return (
        <UiModeRuntimeProvider value={runtime}>
          <button
            type="button"
            data-testid="increment-sessions"
            onClick={() => setSessionCount((count) => count + 1)}
          >
            +1
          </button>
          <UiModeScreenHost
            slot="inbox"
            controller={controller}
            renderClassic={() => (
              <div data-testid="classic-inbox">Classic:{controller.sessionCount}</div>
            )}
          />
          <UiModeScreenHost
            slot="thread"
            controller={{ threadId: "t-1" }}
            renderClassic={() => <div data-testid="classic-thread">ClassicThread</div>}
          />
        </UiModeRuntimeProvider>
      );
    }

    const classicRuntime = buildRuntimeValue(DEFAULT_CLASSIC_RESOLVED_THEME);
    const customRuntime = buildRuntimeValue(customTheme);

    const { container, rerender } = mountClient(<InboxControllerHost runtime={classicRuntime} />);
    expect(container.querySelector('[data-testid="custom-inbox-screen"]')).toBeNull();
    expect(container.querySelector('[data-testid="classic-inbox"]')?.textContent).toBe("Classic:4");
    expect(container.querySelector('[data-testid="classic-thread"]')?.textContent).toBe(
      "ClassicThread",
    );

    rerender(<InboxControllerHost runtime={customRuntime} />);
    expect(container.querySelector('[data-testid="custom-inbox-screen"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="custom-controller-summary"]')?.textContent).toBe(
      "unread:4",
    );
    expect(
      container.querySelector('[data-testid="delegated-classic"] [data-testid="classic-inbox"]')
        ?.textContent,
    ).toBe("Classic:4");
    expect(container.querySelector('[data-testid="classic-thread"]')?.textContent).toBe(
      "ClassicThread",
    );

    const incrementBtn = container.querySelector(
      '[data-testid="increment-sessions"]',
    ) as HTMLButtonElement;
    act(() => {
      incrementBtn.click();
    });
    expect(container.querySelector('[data-testid="custom-controller-summary"]')?.textContent).toBe(
      "unread:5",
    );

    rerender(<InboxControllerHost runtime={classicRuntime} />);
    expect(container.querySelector('[data-testid="custom-inbox-screen"]')).toBeNull();
    expect(container.querySelector('[data-testid="classic-inbox"]')?.textContent).toBe("Classic:5");
  });

  it("catches non-classic screen crashes, reports onModeRenderError, renders classic fallback, and resets on mode change", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onModeRenderError = vi.fn();

    const BrokenInboxScreen = defineUiModeScreenSlot(() => {
      throw new Error("boom");
    });

    const HealthyInboxScreen = defineUiModeScreenSlot<{ count: number }>(({ controller }) => (
      <div data-testid="healthy-skin-inbox">Healthy:{controller.count}</div>
    ));

    const brokenTheme = buildCustomTheme({
      id: "broken-skin",
      screens: { inbox: BrokenInboxScreen },
    });
    const healthyTheme = buildCustomTheme({
      id: "healthy-skin",
      screens: { inbox: HealthyInboxScreen },
    });

    const { container, rerender } = mountClient(
      <UiModeRuntimeProvider value={buildRuntimeValue(brokenTheme, onModeRenderError)}>
        <UiModeScreenHost
          slot="inbox"
          controller={{ count: 9 }}
          renderClassic={() => <div data-testid="classic-recovery">RecoveredClassic:9</div>}
        />
      </UiModeRuntimeProvider>,
    );

    expect(onModeRenderError).toHaveBeenCalledTimes(1);
    const [reportedError, reportedModeId] = onModeRenderError.mock.calls[0]!;
    expect(reportedError).toBeInstanceOf(Error);
    expect(reportedError.message).toBe("boom");
    expect(reportedModeId).toBe("broken-skin");
    expect(container.querySelector('[data-testid="classic-recovery"]')?.textContent).toBe(
      "RecoveredClassic:9",
    );

    rerender(
      <UiModeRuntimeProvider value={buildRuntimeValue(healthyTheme, onModeRenderError)}>
        <UiModeScreenHost
          slot="inbox"
          controller={{ count: 9 }}
          renderClassic={() => <div data-testid="classic-recovery">RecoveredClassic:9</div>}
        />
      </UiModeRuntimeProvider>,
    );

    expect(container.querySelector('[data-testid="healthy-skin-inbox"]')?.textContent).toBe(
      "Healthy:9",
    );
  });

  it("does not swallow errors in UiModeCrashBoundary when modeId is classic", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onModeError = vi.fn();
    const onRootCatch = vi.fn();

    function ClassicBoom(): ReactNode {
      throw new Error("classic kernel bug");
    }

    const { container } = mountClient(
      <RootTestBoundary onCatch={onRootCatch}>
        <UiModeCrashBoundary
          modeId={CLASSIC_UI_MODE_ID}
          fallback={<div data-testid="swallowed-fallback">Should not render</div>}
          onModeError={onModeError}
        >
          <ClassicBoom />
        </UiModeCrashBoundary>
      </RootTestBoundary>,
    );

    expect(onModeError).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="swallowed-fallback"]')).toBeNull();
    expect(onRootCatch).toHaveBeenCalledTimes(1);
    expect(onRootCatch.mock.calls[0]![0]?.message).toBe("classic kernel bug");
    expect(container.querySelector('[data-testid="root-error-fallback"]')?.textContent).toBe(
      "classic kernel bug",
    );
  });

  it("clears UiModeCrashBoundary failure cleanly when onModeError resets active modeId back to classic", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onRootCatch = vi.fn();
    const crashedModes: string[] = [];

    function ModeSlot({ modeId }: { modeId: string }): ReactNode {
      if (modeId === "broken-skin") {
        throw new Error("skin render crash");
      }
      return <div data-testid="live-mode-view">Mode:{modeId}</div>;
    }

    function AutoRecoveringHost() {
      const [modeId, setModeId] = useState("broken-skin");
      return (
        <RootTestBoundary onCatch={onRootCatch}>
          <UiModeCrashBoundary
            modeId={modeId}
            fallback={() => <div data-testid="immediate-fallback">FallbackClassic</div>}
            onModeError={(_error, failedId) => {
              crashedModes.push(failedId);
              setModeId(CLASSIC_UI_MODE_ID);
            }}
          >
            <ModeSlot modeId={modeId} />
          </UiModeCrashBoundary>
        </RootTestBoundary>
      );
    }

    const { container } = mountClient(<AutoRecoveringHost />);
    expect(crashedModes).toEqual(["broken-skin"]);
    expect(onRootCatch).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="live-mode-view"]')?.textContent).toBe(
      "Mode:classic",
    );
  });
});
