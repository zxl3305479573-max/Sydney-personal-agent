import type { ComputerMode, ComputerReleaseReason } from "@rakazo/contracts";
import type { ScreenPageState } from "@rakazo/core";
import {
  createScreenReconnect,
  DEFAULT_COMPUTER_SCREEN,
  displayName,
  isRetryableError,
  SCREEN_RECONNECT_DELAY_MS,
  screenProbeUrl,
  waitForScreenPage,
} from "@rakazo/core";
import { useLocalSearchParams, useNavigation } from "expo-router";
import type { RefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Modal,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import {
  initialWindowMetrics,
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { ComputerKeyboardBar } from "../components/computer-keyboard-bar";
import { ComputerMaintenanceActions } from "../components/computer-maintenance-actions";
import { ComputerModePicker } from "../components/computer-mode-picker";
import { GlassIconButton } from "../components/glass-icon-button";
import { GlassSurface } from "../components/glass-surface";
import { MotionPressable } from "../components/motion-pressable";
import { NativeActionButton } from "../components/native-action-button";
import { ComputerVirtualMouse, NativeComputerControl } from "../components/native-computer-control";
import {
  captureApiRequestContext,
  currentApiBase,
  currentSpaceSelectionGeneration,
  isSpaceSelectionPending,
  rpc,
  selectedSpaceId,
  spaceSelectionSeq,
  subscribeSpaceSelection,
} from "../lib/api";
import { useAppForeground } from "../lib/app-foreground";
import type { ComputerStatus } from "../lib/computer";
import {
  COMPUTER_HEARTBEAT_MS,
  COMPUTER_LIFECYCLE_TIMEOUT_MS,
  COMPUTER_SCREEN_SIZE_SCRIPT,
  computerLabel,
  computerScreenDimensions,
  controlLabel,
  embeddableScreenUrl,
  fromScreenPage,
  isProxiedScreenPage,
  nextLoadedScreenUrl,
  previewPlaceholder,
  readScreenUrl,
  retainScreenSource,
  SCREEN_URL_OPEN_ATTEMPTS,
  screenPageState,
  screenPageStatus,
  screenStreamKey,
  screenUrlForApi,
} from "../lib/computer";
import type { ComputerKeyboardCommand } from "../lib/computer-keyboard";
import {
  computerKeyboardReadyProbe,
  computerKeyboardScript,
  createComputerKeyboardBridge,
  isComputerKeyboardReadyMessage,
  NATIVE_COMPUTER_KEYBOARD_BOOT,
} from "../lib/computer-keyboard";
import { createComputerRefresh } from "../lib/computer-refresh";
import { tabletopLayout } from "../lib/fold-layout";
import { useFoldRegions } from "../lib/fold-regions";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import type { ComputerPointerMode, NativeScreenGeometry } from "../lib/native-computer-control";
import {
  createNativeComputerInputQueue,
  isNativeControlPage,
  isNativeScreenGeometryInvalidation,
  nativeKeyboardInputs,
  nativeScreenGeometry,
  nativeScreenGeometryScript,
} from "../lib/native-computer-control";
import { iosAtLeast } from "../lib/native-controls";
import { useScreenBackground } from "../lib/scoped-theme-context";
import { isAllowedScreenNavigation } from "../lib/screen-navigation";
import { currentSessionGeneration } from "../lib/session";
import { useSideInsets } from "../lib/side-insets";
import { stacksAtTextScale } from "../lib/text-scale";
import { UiModeScreenHost } from "../lib/ui-mode-slots";
import { computerBootErrorDetail, errorText } from "../lib/user-error";
import type { ComputerUiModeController } from "../ui-modes/controllers";

let nativeInputNeedsReview = false;
let nativeInputBlockedLease: string | null = null;

function isLightSurface(background?: string): boolean {
  if (!background || !background.startsWith("#") || background.length < 7) return true;
  return Number.parseInt(background.slice(1, 3), 16) >= 128;
}

export default function Computer() {
  const sideInsets = useSideInsets();
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const screenBackground = useScreenBackground(tokens.background);
  const navigation = useNavigation();
  const windowSize = useWindowDimensions();
  const stacked = stacksAtTextScale(windowSize.fontScale);
  const folds = useFoldRegions();
  const { botId, name: nameParam } = useLocalSearchParams<{ botId?: string; name?: string }>();
  const name = displayName(nameParam, t("Bot"));
  const foreground = useAppForeground();
  const [computer, setComputer] = useState<ComputerStatus | null>(null);
  const [screenUrl, setScreenUrl] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [screenReadError, setScreenReadError] = useState<string | null>(null);
  const [screenOriginError, setScreenOriginError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readyBotId, setReadyBotId] = useState<string | null>(null);
  const [bootingCount, setBootingCount] = useState(0);
  const [switchingCount, setSwitchingCount] = useState(0);
  const booting = bootingCount > 0;
  const [bootFailed, setBootFailed] = useState(false);
  const switching = switchingCount > 0;
  const [computerOpen, setComputerOpen] = useState(false);
  // The keyboard closes on the Release tap, not when the server answers.
  const [releasing, setReleasing] = useState(false);
  const autoBooted = useRef<string | null>(null);
  const screenWebViewRef = useRef<WebView>(null);
  const keyboardGate = useRef({
    key: "",
    session: 0,
    bridge: createComputerKeyboardBridge(),
  });
  const heldScreenUrl = useRef<string | null>(null);
  // Bumped to load the screen page again after the app returns from the background or the
  // WebView loses its renderer; either can leave the stream black until it reconnects.
  const [screenReload, setScreenReload] = useState(0);
  const [screenFrame, setScreenFrame] = useState<{
    source: string;
    width: number;
    height: number;
  } | null>(null);
  const [screenStage, setScreenStage] = useState<{ width: number; height: number } | null>(null);
  const [pointerMode, setPointerMode] = useState<ComputerPointerMode>("touch");
  const [nativeGeometry, setNativeGeometry] = useState<NativeScreenGeometry | null>(null);
  const [nativeInputError, setNativeInputError] = useState<string | null>(null);
  const [mouseInputError, setMouseInputError] = useState<string | null>(null);
  const [nativeInputReview, setNativeInputReview] = useState(nativeInputNeedsReview);

  const embeddedScreenUrl = embeddableScreenUrl(screenUrl, currentApiBase());
  const screenSource = embeddedScreenUrl ? screenStreamKey(embeddedScreenUrl) : null;
  const screenDimensions =
    screenFrame && screenFrame.source === screenSource
      ? screenFrame
      : {
          width: computer?.screenWidth ?? DEFAULT_COMPUTER_SCREEN.width,
          height: computer?.screenHeight ?? DEFAULT_COMPUTER_SCREEN.height,
        };
  const screenAspectRatio = screenDimensions.width / screenDimensions.height;
  const screenStageWidth = screenStage
    ? Math.max(1, Math.min(screenStage.width, screenStage.height * screenAspectRatio))
    : "100%";
  useEffect(() => setScreenError(null), [embeddedScreenUrl]);
  // Without a WebView a dropped URL never fails on its own, so say so instead of a dead preview.
  const unreachableScreen =
    computer?.state === "running" && Boolean(screenUrl) && !embeddedScreenUrl;

  const hasControl = computer?.controlHolder === "user" && computer.controlBotId === botId;
  const nativeComputer = computer?.kind === "native-linux";
  const nativeLease = nativeComputer && hasControl ? (computer?.controlLeaseId ?? null) : null;
  const tabletop = hasControl ? tabletopLayout(windowSize.width, windowSize.height, folds) : null;
  const screenVisible =
    computerOpen && computer?.state === "running" && Boolean(embeddedScreenUrl) && !screenError;
  const loadedScreenUrl = nextLoadedScreenUrl(
    heldScreenUrl.current,
    embeddedScreenUrl,
    screenVisible,
  );
  heldScreenUrl.current = loadedScreenUrl;
  const scopeGeneration = currentSessionGeneration();
  const scopeSpace = selectedSpaceId();
  const scopeSpaceGeneration = currentSpaceSelectionGeneration();
  const scopeSelectionSeq = spaceSelectionSeq();
  const scopeBase = currentApiBase();
  const isCurrentScope = () =>
    scopeGeneration === currentSessionGeneration() &&
    scopeSpace === selectedSpaceId() &&
    scopeSpaceGeneration === currentSpaceSelectionGeneration() &&
    scopeSelectionSeq === spaceSelectionSeq() &&
    !isSpaceSelectionPending() &&
    scopeBase === currentApiBase();
  function onScreenDimensions(sourceUrl: string, dimensions: { width: number; height: number }) {
    const source = screenStreamKey(sourceUrl);
    if (source === screenSource && isCurrentScope()) setScreenFrame({ source, ...dimensions });
  }
  const inputQueue = useMemo(() => {
    if (
      !hasControl ||
      (nativeComputer &&
        (!nativeLease || nativeLease === nativeInputBlockedLease || nativeInputReview)) ||
      !botId ||
      !computerOpen ||
      !foreground ||
      releasing ||
      isSpaceSelectionPending() ||
      !loadedScreenUrl ||
      screenError
    )
      return null;
    return createNativeComputerInputQueue(
      async (input, isQueued) => {
        if (!isCurrentScope()) throw new Error("Computer control session changed.");
        const requestContext = await captureApiRequestContext(scopeSpace);
        if (!isQueued()) return;
        if (!isCurrentScope()) throw new Error("Computer control session changed.");
        return rpc(
          "computer/input",
          { botId, ...(nativeLease ? { controlLeaseId: nativeLease } : {}), ...input },
          { requestContext },
        );
      },
      (cause) => {
        const message = errorText(cause, t("Computer input failed. Take control again."));
        if (nativeComputer) setNativeInputError(message);
        else setMouseInputError(message);
      },
      () => {
        if (!nativeComputer) return;
        nativeInputNeedsReview = true;
        nativeInputBlockedLease = nativeLease;
        setNativeInputReview(true);
      },
    );
  }, [
    hasControl,
    nativeComputer,
    nativeLease,
    nativeInputReview,
    botId,
    computerOpen,
    foreground,
    releasing,
    loadedScreenUrl,
    screenError,
    screenReload,
    scopeGeneration,
    scopeSpace,
    scopeSpaceGeneration,
    scopeSelectionSeq,
    scopeBase,
    t,
  ]);
  const nativeQueue = nativeComputer ? inputQueue : null;
  const inputQueueRef = useRef(inputQueue);
  inputQueueRef.current = inputQueue;
  const foregroundRef = useRef(foreground);
  foregroundRef.current = foreground;
  useEffect(() => {
    setNativeGeometry(null);
    setMouseInputError(null);
    return () => {
      inputQueue?.invalidate();
      inputQueue?.dispose();
    };
  }, [inputQueue]);
  useEffect(() => setNativeInputError(null), [nativeLease]);
  useEffect(() => {
    if (!hasControl || !computerOpen) setPointerMode("touch");
  }, [hasControl, computerOpen]);
  // The gate follows the page the WebView actually loaded. A capability refresh that
  // does not reload that page must not open a session the bridge will never acknowledge.
  const keyboardSurfaceKey = `${computerOpen}:${hasControl}:${screenReload}:${loadedScreenUrl ?? ""}`;
  if (keyboardGate.current.key !== keyboardSurfaceKey) {
    keyboardGate.current = {
      key: keyboardSurfaceKey,
      session: keyboardGate.current.session + 1,
      bridge: createComputerKeyboardBridge(),
    };
  }
  const keyboardSession = String(keyboardGate.current.session);

  useEffect(() => {
    if (!computerOpen || !hasControl || nativeComputer || !loadedScreenUrl) return;
    const gate = keyboardGate.current;
    if (gate.bridge.isReady()) return;
    const webView = screenWebViewRef.current;
    if (!webView) return;
    webView.injectJavaScript(computerKeyboardReadyProbe(String(gate.session)));
  }, [
    computerOpen,
    hasControl,
    nativeComputer,
    loadedScreenUrl,
    embeddedScreenUrl,
    keyboardSession,
  ]);

  function injectKeyboardCommands(commands: ComputerKeyboardCommand[]) {
    if (!isCurrentScope()) return;
    const webView = screenWebViewRef.current;
    if (!webView) return;
    for (const command of commands) webView.injectJavaScript(computerKeyboardScript(command));
  }

  const label = computerLabel(computer?.mode, name);

  useLayoutEffect(() => {
    navigation.setOptions({ title: label });
  }, [label, navigation]);

  const refreshController = useMemo(
    () =>
      createComputerRefresh({
        readStatus: () => rpc("computer/status", { botId: botId ?? "" }),
        readScreen: async (attempts) => {
          const generation = currentSessionGeneration();
          const spaceGeneration = currentSpaceSelectionGeneration();
          const selectionSeq = spaceSelectionSeq();
          const space = selectedSpaceId();
          const base = currentApiBase();
          const isCurrent = () =>
            generation === currentSessionGeneration() &&
            spaceGeneration === currentSpaceSelectionGeneration() &&
            selectionSeq === spaceSelectionSeq() &&
            space === selectedSpaceId() &&
            base === currentApiBase();
          const url = await readScreenUrl(
            async () => {
              if (!isCurrent()) throw new Error("Screen request context changed");
              const context = await captureApiRequestContext(space);
              if (!isCurrent() || context.apiBase !== base)
                throw new Error("Screen request context changed");
              const screen = await rpc(
                "computer/screenUrl",
                { botId: botId ?? "" },
                { requestContext: context },
              );
              if (!isCurrent()) throw new Error("Screen request context changed");
              return { url: screenUrlForApi(screen, context.apiBase) };
            },
            { attempts },
          );
          return { url, isCurrent };
        },
        onStatus: (status) => {
          setComputer(status);
          // Another client may have started it since this one failed.
          if (status.state === "running") setBootFailed(false);
        },
        onScreen: setScreenUrl,
        onScreenError: (err) => setScreenReadError(err == null ? null : errorText(err)),
        onReady: () => setReadyBotId(botId ?? null),
        onInitialError: (err) => setError(errorText(err)),
      }),
    [botId],
  );
  const refresh = refreshController.refresh;
  const refreshAfterMaintenance = useCallback(async () => {
    await refresh();
  }, [refresh]);

  useEffect(() => {
    setComputer(null);
    setScreenUrl(null);
    setScreenError(null);
    setScreenReadError(null);
    setScreenOriginError(false);
    setError(null);
    setReadyBotId(null);
    setBootingCount(0);
    setBootFailed(false);
    setSwitchingCount(0);
    setComputerOpen(false);
    autoBooted.current = null;
    if (botId && !isSpaceSelectionPending()) refreshController.start();
    return () => refreshController.dispose();
  }, [botId, refreshController]);

  // The computer status poll and the live WebView are expensive; neither should
  // run while the app is in the background.
  useEffect(() => {
    if (!botId) return;
    if (foreground && !isSpaceSelectionPending()) {
      if (refreshController.isActive()) refreshController.resume();
      else refreshController.start();
    } else refreshController.pause();
  }, [botId, foreground, refreshController]);

  async function bootComputer({
    takeControl,
    showProgress,
    force = false,
  }: {
    takeControl: boolean;
    showProgress: boolean;
    force?: boolean;
  }) {
    if (!botId || !refreshController.isActive()) return false;
    const action = refreshController.beginAction();
    const needsBoot = force || computer?.state !== "running" || !screenUrl;
    let starting = needsBoot;
    const showBooting = showProgress && needsBoot;
    if (showBooting) {
      setBootingCount((count) => count + 1);
      setError(null);
    }
    setBootFailed(false);
    try {
      if (needsBoot) {
        const answered = await rpc(
          "computer/boot",
          { botId },
          { timeoutMs: COMPUTER_LIFECYCLE_TIMEOUT_MS },
        ).then(
          () => true,
          (err: unknown) => {
            // The server keeps booting after the client stops waiting; the status poll takes over.
            if (err instanceof Error && err.name === "TimeoutError") return false;
            throw err;
          },
        );
        if (!answered) return false;
      }
      starting = false;
      if (!action.isActive()) return false;
      if (takeControl) await rpc("computer/takeover", { botId });
      if (!action.isActive()) return false;
      await action.refresh({ screenAttempts: SCREEN_URL_OPEN_ATTEMPTS });
      if (!action.isActive()) return false;
      setError(null);
      return true;
    } catch (err) {
      if (!action.isActive()) return false;
      setError(
        starting
          ? computerBootErrorDetail(err)
          : err instanceof Error && err.name === "TimeoutError"
            ? t("Request timed out")
            : errorText(err, t("Could not open computer")),
      );
      setBootFailed(starting);
      throw err;
    } finally {
      if (action.isActive() && showBooting) setBootingCount((count) => count - 1);
      action.finish();
    }
  }

  useEffect(() => {
    if (!botId || readyBotId !== botId || switching || isSpaceSelectionPending()) return;
    if (computer?.state === "booting" || computer?.state === "suspended") return;
    if (autoBooted.current === botId) return;
    autoBooted.current = botId;
    void bootComputer({
      takeControl: false,
      showProgress: computer?.state !== "running",
      force: true,
    }).catch(() => undefined);
  }, [readyBotId, botId, computer?.state, switching]);

  const reloadScreen = useCallback(async () => {
    await refresh().catch(() => undefined);
    heldScreenUrl.current = null;
    setScreenError(null);
    setScreenReload((count) => count + 1);
  }, [refresh]);

  // A screen that drops after connecting loads again by itself now and then; the load goes
  // through the screen's full authorization, so a revoked one stays closed.
  const screenReconnect = useRef(createScreenReconnect());
  const screenReconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const screenReconnectWait = useRef<AbortController | null>(null);
  const currentScreenUrl = useRef<string | null>(null);
  currentScreenUrl.current = loadedScreenUrl ?? embeddedScreenUrl;
  useLayoutEffect(() => {
    const clearScope = () => {
      inputQueueRef.current?.dispose();
      inputQueueRef.current = null;
      refreshController.dispose();
      heldScreenUrl.current = null;
      currentScreenUrl.current = null;
      screenReconnectWait.current?.abort();
      clearTimeout(screenReconnectTimer.current);
      screenReconnect.current = createScreenReconnect();
      keyboardGate.current = {
        key: "",
        session: keyboardGate.current.session + 1,
        bridge: createComputerKeyboardBridge(),
      };
      setComputer(null);
      setScreenUrl(null);
      setScreenError(null);
      setScreenReadError(null);
      setScreenOriginError(false);
      setError(null);
      setBootingCount(0);
      setBootFailed(false);
      setSwitchingCount(0);
      setReleasing(false);
      setNativeGeometry(null);
      setPointerMode("touch");
      setComputerOpen(false);
      setReadyBotId(null);
      autoBooted.current = null;
      if (!isSpaceSelectionPending() && foregroundRef.current && botId) refreshController.start();
    };
    const unsubscribe = subscribeSpaceSelection(clearScope);
    if (isSpaceSelectionPending()) clearScope();
    return unsubscribe;
  }, [botId, refreshController]);
  const onScreenState = useCallback(
    (state: ScreenPageState) => {
      const next = screenReconnect.current.report(state);
      if (next !== "reconnect") {
        // A drop that won't reconnect by itself shows why, with Retry.
        const failed = next === "error";
        setScreenOriginError(failed);
        setScreenError(
          !failed
            ? null
            : state === "failed"
              ? t("Could not connect to the computer screen")
              : t("The screen connection closed."),
        );
        return;
      }
      clearTimeout(screenReconnectTimer.current);
      screenReconnectWait.current?.abort();
      const wait = new AbortController();
      screenReconnectWait.current = wait;
      const url = currentScreenUrl.current;
      screenReconnectTimer.current = setTimeout(() => {
        // Wait out an API that can't be reached, so the one reconnect isn't spent on it; the
        // reload then shows whatever the page answers.
        // Only the proxy answers probes; another screen is loaded again straight away.
        const probe = url && isProxiedScreenPage(url) ? screenProbeUrl(url) : null;
        void waitForScreenPage(
          async (signal) => (probe ? screenPageStatus(probe, fetch, signal) : 200),
          { signal: wait.signal },
        ).then((outcome) => {
          if (outcome !== "cancelled") void reloadScreen();
        });
      }, SCREEN_RECONNECT_DELAY_MS);
    },
    [reloadScreen, t],
  );
  const onScreenLoadStart = useCallback(() => screenReconnect.current.loaded(), []);
  // Closing the screen, leaving the app or a new screen URL (taking or releasing control)
  // cancels a pending reconnect.
  useEffect(
    () => () => {
      screenReconnectWait.current?.abort();
      clearTimeout(screenReconnectTimer.current);
    },
    // A renewed link for the same screen keeps the page and the pending reconnect.
    [computerOpen, foreground, embeddedScreenUrl ? screenStreamKey(embeddedScreenUrl) : null],
  );

  useEffect(() => {
    if (!computerOpen) return;
    let backgrounded = false;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") backgrounded = true;
      if (state !== "active" || !backgrounded) return;
      backgrounded = false;
      void reloadScreen();
    });
    return () => subscription.remove();
  }, [computerOpen, reloadScreen]);

  useEffect(() => {
    if (!botId || !foreground || computer?.state !== "running") return;
    // A refused heartbeat (403, 404, 426...) stops until the computer's state changes.
    const ping = () =>
      void rpc("computer/heartbeat", { botId }).catch((error: unknown) => {
        if (!isRetryableError(error)) clearInterval(timer);
      });
    const timer = setInterval(ping, COMPUTER_HEARTBEAT_MS);
    ping();
    return () => clearInterval(timer);
  }, [botId, computer?.state, foreground]);

  /** Open the full window. Only an explicit Take control asks for the lease. */
  async function openComputer({ takeControl }: { takeControl: boolean }) {
    if (!botId) return;
    if (takeControl && nativeInputNeedsReview) return;
    const needsTakeover = takeControl && !hasControl;
    try {
      const opened = await bootComputer({
        takeControl: needsTakeover,
        showProgress: needsTakeover || computer?.state !== "running",
        force: computer?.state !== "running",
      });
      if (!opened || !refreshController.isActive()) return;
      setComputerOpen(true);
      setScreenError(null);
    } catch {
      // error already set
    }
  }

  async function releaseComputer(reason?: ComputerReleaseReason) {
    if (!botId || !refreshController.isActive()) return;
    const action = refreshController.beginAction();
    inputQueue?.dispose();
    setNativeGeometry(null);
    setReleasing(true);
    try {
      await rpc("computer/release", { botId, reason });
      if (!action.isActive()) return;
      setComputerOpen(false);
      await action.refresh().catch(() => undefined);
    } catch {
      if (action.isActive()) {
        setScreenOriginError(false);
        setScreenError(t("Could not continue"));
      }
    } finally {
      setReleasing(false);
      action.finish();
    }
  }

  function closeComputer() {
    inputQueue?.dispose();
    setNativeGeometry(null);
    setComputerOpen(false);
  }

  async function setComputerMode(mode: ComputerMode) {
    if (!botId || !refreshController.isActive() || mode === computer?.mode) return;
    const action = refreshController.beginAction();
    setSwitchingCount((count) => count + 1);
    setError(null);
    try {
      if (hasControl) {
        await rpc("computer/release", {
          botId,
          reason: computer?.takeoverRequested ? "skipped" : undefined,
        });
      }
      if (!action.isActive()) return;
      await rpc("bots/setComputer", { botId, mode }, { timeoutMs: COMPUTER_LIFECYCLE_TIMEOUT_MS });
      if (!action.isActive()) return;
      setComputer(null);
      setScreenUrl(null);
      autoBooted.current = null;
      await action.refresh();
    } catch (err) {
      if (!action.isActive()) return;
      setError(errorText(err, t("Could not switch computer")));
    } finally {
      if (action.isActive()) setSwitchingCount((count) => count - 1);
      action.finish();
    }
  }

  const keyboardBar = hasControl ? (
    <ComputerKeyboardBar
      pointer={{ mode: pointerMode, onChange: setPointerMode }}
      active={
        computerOpen &&
        !releasing &&
        (!nativeComputer || Boolean(nativeQueue && nativeGeometry && !nativeInputError))
      }
      onCommand={(command) => {
        if (nativeComputer) {
          if (!nativeGeometry || nativeInputError) return;
          const inputs = nativeKeyboardInputs(command);
          if (!inputs) {
            nativeQueue?.reject(
              new Error("Deletion is too long to send. Check the screen and take control again."),
            );
            return;
          }
          nativeQueue?.enqueueBatch(inputs);
        } else injectKeyboardCommands(keyboardGate.current.bridge.push(command));
      }}
    />
  ) : null;
  const placeholder =
    screenError ??
    screenReadError ??
    (unreachableScreen
      ? t("Could not load the desktop. This device cannot reach the screen URL.")
      : previewPlaceholder(computer?.state, booting, name, computer?.mode));
  // Booting shows in the preview; the header and Back stay, and leaving lets the boot finish.
  const bootPending = booting || computer?.state === "booting";
  const canRetry = !bootPending && (bootFailed || computer?.state === "error");
  const screenRetry =
    Boolean(screenReadError) ||
    unreachableScreen ||
    (computer?.state === "running" && screenOriginError && Boolean(screenError));
  const retryScreenAction = screenRetry ? (
    <NativeActionButton
      style={{ marginBottom: 16 }}
      label={t("Retry screen")}
      prominence="primary"
      size="default"
      onPress={() => void reloadScreen()}
    />
  ) : null;

  const controller: ComputerUiModeController = {
    botId,
    name,
    computer,
    screen: {
      previewUrl: embeddedScreenUrl,
      workspaceUrl: loadedScreenUrl,
      visible: screenVisible,
      placeholder,
      error: screenError ?? screenReadError,
      native: Boolean(nativeComputer),
    },
    keyboardBar,
    booting,
    switching,
    releasing,
    hasControl,
    open: computerOpen,
    error,
    screenError: screenError ?? screenReadError,
    nativeInputError,
    nativeGeometry,
    openComputer,
    closeComputer,
    releaseComputer,
    setComputerMode,
    reloadScreen,
  };
  const isLight = isLightSurface(tokens?.background);
  const canvasBg = tokens?.background ?? (isLight ? "#F3F1EC" : "#15171C");
  const cardBg = isLight ? "#FFFEFC" : "#242933";
  const cardBorder = isLight ? "rgba(38, 35, 31, 0.055)" : "rgba(245, 244, 240, 0.09)";
  const chipBg = isLight ? "#F8F6F2" : "#2A303B";
  const chipBorder = isLight ? "rgba(38, 35, 31, 0.07)" : "rgba(245, 244, 240, 0.10)";
  const fg = tokens?.foreground ?? (isLight ? "#26231F" : "#F5F4F0");
  const mutedFg = tokens?.mutedForeground ?? (isLight ? "#6E675E" : "#B8B3AA");
  const cardShadow = {
    shadowColor: "#26231F",
    shadowOpacity: isLight ? 0.028 : 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  } as const;
  const porcelainCard = {
    backgroundColor: cardBg,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: cardBorder,
    ...cardShadow,
  } as const;

  const classicContent = (
    // The full window's Modal is a child of this scroll view. A tap there, on Close or on the
    // native keyboard bar, must never just dismiss the computer keyboard; only the bar closes it.
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={[{ flex: 1, backgroundColor: screenBackground }, sideInsets]}
      contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="always"
    >
      {canRetry && computer?.state !== "running" ? (
        <View style={{ ...porcelainCard, padding: 18, gap: 8, marginBottom: 14 }}>
          <Text style={{ color: tokens.destructive, fontSize: 17, fontWeight: "600" }}>
            {t("Couldn't start the computer")}
          </Text>
          <Text style={{ color: mutedFg }}>
            {t("Something went wrong while it was starting. Try again in a moment.")}
          </Text>
          {error ? <Text style={{ color: mutedFg, fontSize: 13 }}>{error}</Text> : null}
        </View>
      ) : error || canRetry ? (
        <View style={{ ...porcelainCard, padding: 16, marginBottom: 14 }}>
          <Text style={{ color: mutedFg }}>
            {error ?? t("Something went wrong while it was starting. Try again in a moment.")}
          </Text>
        </View>
      ) : null}
      {screenReadError ? (
        <Text accessibilityRole="alert" style={{ color: tokens.destructive, marginBottom: 12 }}>
          {screenReadError}
        </Text>
      ) : null}
      {retryScreenAction}
      {nativeInputReview ? (
        <View style={{ ...porcelainCard, padding: 18, gap: 10, marginBottom: 14 }}>
          <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>
            之前的电脑输入可能已部分执行或结果未知。请先查看电脑画面并确认，再重新接管。
          </Text>
          <NativeActionButton
            label="我已核对电脑画面"
            prominence="secondary"
            onPress={() => {
              nativeInputNeedsReview = false;
              setNativeInputReview(false);
            }}
          />
        </View>
      ) : null}
      {canRetry ? (
        <NativeActionButton
          label={t("Try again")}
          prominence="primary"
          size="default"
          style={{ marginBottom: 14 }}
          onPress={() =>
            void bootComputer({ takeControl: false, showProgress: true, force: true }).catch(
              () => undefined,
            )
          }
        />
      ) : null}
      <View
        style={{
          aspectRatio: screenAspectRatio,
          borderRadius: 22,
          overflow: "hidden",
          backgroundColor: cardBg,
          borderWidth: 0.5,
          borderColor: cardBorder,
          ...cardShadow,
        }}
      >
        {computerOpen ? (
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 52 }}
          >
            <Text style={{ color: mutedFg }}>{t("Open in full window")}</Text>
          </View>
        ) : foreground && computer?.state === "running" && embeddedScreenUrl && !screenError ? (
          <ScreenWebView
            key={screenReload}
            url={embeddedScreenUrl}
            interactive={false}
            onDimensions={onScreenDimensions}
            onScreenState={(state) => {
              if (isCurrentScope()) onScreenState(state);
            }}
            onLoadStart={() => {
              if (isCurrentScope()) onScreenLoadStart();
            }}
            onRendererLost={() => {
              if (isCurrentScope()) void reloadScreen();
            }}
            onError={() => {
              if (!isCurrentScope()) return;
              refreshController.invalidateScreen();
              setScreenOriginError(true);
              setScreenError(
                t("Could not load the desktop. This device cannot reach the screen URL."),
              );
            }}
          />
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: 16,
              paddingBottom: 56,
            }}
          >
            {bootPending ? <ActivityIndicator size="large" color={mutedFg} /> : null}
            <Text style={{ color: mutedFg, textAlign: "center" }}>{placeholder}</Text>
          </View>
        )}
        <MotionPressable
          preset="control"
          accessibilityRole="button"
          accessibilityLabel={bootPending ? placeholder : t("Open computer")}
          accessibilityState={{ disabled: bootPending, busy: bootPending }}
          disabled={bootPending}
          onPress={() => void openComputer({ takeControl: false })}
          style={{
            position: "absolute",
            bottom: 14,
            end: 14,
            minHeight: 44,
            justifyContent: "center",
            paddingHorizontal: 16,
            borderRadius: 999,
            backgroundColor: tokens?.primary ?? (isLight ? "#2B2823" : "#F5F4F0"),
            opacity: bootPending ? 0.55 : 1,
          }}
        >
          <Text
            style={{
              color: tokens?.primaryForeground ?? (isLight ? "#FFFEFC" : "#15171C"),
              fontSize: 14.5,
              fontWeight: "600",
            }}
          >
            {t("Open computer")}
          </Text>
        </MotionPressable>
      </View>
      <View
        style={{
          ...porcelainCard,
          marginTop: 14,
          paddingHorizontal: 18,
          paddingVertical: 14,
          flexDirection: stacked ? "column" : "row",
          alignItems: stacked ? "flex-start" : "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Text
          style={{
            color: mutedFg,
            ...(stacked ? { alignSelf: "stretch" } : { flex: 1 }),
          }}
        >
          {controlLabel(computer, name, botId)}
        </Text>
        {hasControl ? (
          <ComputerReleaseActions
            takeoverRequested={computer?.takeoverRequested ?? false}
            onRelease={releaseComputer}
          />
        ) : (
          <NativeActionButton
            label={t("Take control")}
            prominence="secondary"
            disabled={bootPending || nativeInputReview}
            style={{ alignSelf: "center" }}
            onPress={() => void openComputer({ takeControl: true })}
          />
        )}
      </View>
      {computer ? (
        <ComputerMaintenanceActions
          botId={botId ?? ""}
          computer={computer}
          onChanged={refreshAfterMaintenance}
        />
      ) : null}
      <ComputerModePicker
        // Restacking the row above leaves the native picker at its old measured height; remount it.
        key={stacked ? "stacked" : "row"}
        value={computer?.mode}
        disabled={switching || bootPending}
        onChange={(mode) => void setComputerMode(mode)}
      />

      <Modal
        visible={computerOpen}
        animationType="fade"
        presentationStyle="fullScreen"
        supportedOrientations={["portrait", "landscape-left", "landscape-right"]}
        onRequestClose={closeComputer}
      >
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <KeyboardAvoidingView
            behavior="height"
            enabled={!tabletop}
            style={{ flex: 1, backgroundColor: canvasBg }}
          >
            <SafeAreaView
              edges={["top", "left", "right"]}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                borderBottomWidth: iosAtLeast(26) ? 0 : 0.5,
                borderBottomColor: cardBorder,
                paddingHorizontal: 14,
                paddingVertical: 6,
              }}
            >
              <View
                style={{
                  flex: 1,
                  minWidth: 0,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    flexShrink: 1,
                    color: fg,
                    fontSize: 15.5,
                    fontWeight: "600",
                  }}
                >
                  {label}
                </Text>
                {hasControl ? (
                  <View
                    style={{
                      borderRadius: 999,
                      backgroundColor: chipBg,
                      borderWidth: 0.5,
                      borderColor: chipBorder,
                      paddingHorizontal: 10,
                      paddingVertical: 3,
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        color: tokens?.success ?? (isLight ? "#006B3D" : "#46BD7B"),
                        fontSize: 12,
                        fontWeight: "500",
                      }}
                    >
                      {t("You have control")}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {hasControl ? (
                  <ComputerReleaseActions
                    takeoverRequested={computer?.takeoverRequested ?? false}
                    onRelease={releaseComputer}
                  />
                ) : (
                  <NativeActionButton
                    label={t("Take control")}
                    prominence="secondary"
                    fill={false}
                    style={{ alignSelf: "center" }}
                    onPress={() =>
                      void bootComputer({ takeControl: true, showProgress: false }).catch(
                        () => undefined,
                      )
                    }
                  />
                )}
                <GlassIconButton
                  accessibilityLabel={t("Close computer")}
                  onPress={closeComputer}
                  ios="xmark"
                  android="close"
                  size={36}
                  iconSize={16}
                />
              </View>
            </SafeAreaView>
            {error || screenReadError ? (
              <Text accessibilityRole="alert" style={{ color: tokens.destructive, padding: 10 }}>
                {error ?? screenReadError}
              </Text>
            ) : null}
            {screenReadError && loadedScreenUrl ? retryScreenAction : null}
            <SafeAreaView
              edges={hasControl ? ["left", "right"] : ["left", "right", "bottom"]}
              style={{ flex: 1, justifyContent: "center", paddingHorizontal: 12 }}
            >
              <View
                onLayout={(event) => setScreenStage(event.nativeEvent.layout)}
                style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
              >
                <View
                  style={{
                    width: screenStageWidth,
                    aspectRatio: screenAspectRatio,
                    backgroundColor: cardBg,
                    borderRadius: 16,
                    borderWidth: 0.5,
                    borderColor: cardBorder,
                    overflow: "hidden",
                  }}
                >
                  {foreground && loadedScreenUrl ? (
                    <ScreenWebView
                      key={`${screenReload}:${loadedScreenUrl}:${Boolean(nativeQueue)}`}
                      url={loadedScreenUrl}
                      interactive={hasControl && !nativeComputer && pointerMode === "touch"}
                      nativeKeyboard={hasControl && !nativeComputer}
                      nativeGeometry={Boolean(nativeQueue)}
                      keyboardSession={keyboardSession}
                      webViewRef={screenWebViewRef}
                      onDimensions={onScreenDimensions}
                      onNativeGeometry={(geometry) => {
                        if (!isCurrentScope()) return;
                        if (!geometry) {
                          nativeQueue?.invalidate();
                          nativeQueue?.reject(
                            new Error(
                              "画面连接已失效，输入可能已部分执行或结果未知。请核对画面后释放并重新接管。",
                            ),
                          );
                        }
                        setNativeGeometry(geometry);
                      }}
                      onNativeSourceUnavailable={() => {
                        if (!isCurrentScope()) return;
                        nativeQueue?.invalidate();
                        nativeQueue?.reject(
                          new Error(
                            "无法验证电脑画面消息来源，此设备暂不支持安全接管。请释放并检查设备兼容性。",
                          ),
                        );
                      }}
                      onKeyboardMessage={(data) => {
                        if (!isCurrentScope()) return;
                        const gate = keyboardGate.current;
                        if (!isComputerKeyboardReadyMessage(data, String(gate.session))) return;
                        injectKeyboardCommands(gate.bridge.ready());
                      }}
                      onScreenState={(state) => {
                        if (!isCurrentScope()) return;
                        if (state !== "connected") {
                          inputQueue?.invalidate();
                          setNativeGeometry(null);
                        } else if (nativeQueue) {
                          screenWebViewRef.current?.injectJavaScript(
                            "window.__rakazoNativeGeometryRefresh?.();true;",
                          );
                        }
                        onScreenState(state);
                      }}
                      onLoadStart={() => {
                        if (!isCurrentScope()) return;
                        inputQueue?.invalidate();
                        setNativeGeometry(null);
                        onScreenLoadStart();
                      }}
                      onRendererLost={() => {
                        if (!isCurrentScope()) return;
                        inputQueue?.invalidate();
                        void reloadScreen();
                      }}
                      onError={() => {
                        if (!isCurrentScope()) return;
                        inputQueue?.invalidate();
                        refreshController.invalidateScreen();
                        setScreenOriginError(true);
                        setScreenError(
                          t("Could not load the desktop. This device cannot reach the screen URL."),
                        );
                      }}
                    />
                  ) : (
                    <View
                      style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 16,
                      }}
                    >
                      <Text style={{ color: mutedFg, textAlign: "center" }}>{placeholder}</Text>
                      {retryScreenAction}
                    </View>
                  )}
                  {pointerMode === "mouse" &&
                  inputQueue &&
                  screenVisible &&
                  !mouseInputError &&
                  !nativeInputError &&
                  (!nativeComputer || nativeGeometry) ? (
                    <ComputerVirtualMouse
                      key={`${screenReload}:${loadedScreenUrl}`}
                      geometry={nativeComputer ? nativeGeometry : null}
                      screen={nativeGeometry ?? screenDimensions}
                      onInput={(input) => inputQueue.enqueue(input)}
                    />
                  ) : null}
                  {pointerMode === "mouse" && mouseInputError ? (
                    <Text
                      accessibilityRole="alert"
                      style={{ color: tokens.destructive, padding: 8 }}
                    >
                      {mouseInputError}
                    </Text>
                  ) : null}
                  {nativeComputer && hasControl && computerOpen ? (
                    <>
                      {pointerMode === "touch" && nativeQueue && !nativeInputError ? (
                        <NativeComputerControl
                          geometry={nativeGeometry}
                          onInput={(input) => nativeQueue.enqueue(input)}
                        />
                      ) : null}
                      {!nativeLease || nativeInputError || !nativeGeometry ? (
                        <View
                          pointerEvents="none"
                          style={{
                            position: "absolute",
                            bottom: 12,
                            left: 16,
                            right: 16,
                          }}
                        >
                          <GlassSurface
                            shape="roundedRectangle"
                            cornerRadius={18}
                            style={{ borderRadius: 18, paddingHorizontal: 16, paddingVertical: 11 }}
                            fallbackStyle={{
                              backgroundColor: cardBg,
                              borderRadius: 18,
                              borderWidth: 0.5,
                              borderColor: cardBorder,
                              ...cardShadow,
                            }}
                          >
                            <Text accessibilityRole="alert" style={{ color: fg, fontSize: 13 }}>
                              {nativeLease && nativeLease === nativeInputBlockedLease
                                ? "请先释放当前接管，核对画面后重新接管。"
                                : !nativeLease
                                  ? t(
                                      "Computer control is unavailable. Release and take control again.",
                                    )
                                  : nativeInputError
                                    ? `${nativeInputError} ${t("Check the screen, then release and take control again.")}`
                                    : t("Waiting for screen dimensions…")}
                            </Text>
                          </GlassSurface>
                        </View>
                      ) : null}
                    </>
                  ) : null}
                </View>
              </View>
            </SafeAreaView>
            {tabletop ? (
              // A fixed lower half, so the keyboard lifts the bar without pushing the desktop.
              <View style={{ height: windowSize.height - tabletop.top, paddingTop: tabletop.gap }}>
                <KeyboardAvoidingView
                  behavior="height"
                  style={{ flex: 1, justifyContent: "flex-end" }}
                >
                  {keyboardBar}
                </KeyboardAvoidingView>
              </View>
            ) : (
              keyboardBar
            )}
          </KeyboardAvoidingView>
        </SafeAreaProvider>
      </Modal>
    </ScrollView>
  );
  return (
    <UiModeScreenHost
      slot="computer"
      controller={controller}
      renderClassic={() => classicContent}
    />
  );
}

function ComputerReleaseActions({
  takeoverRequested,
  onRelease,
}: {
  takeoverRequested: boolean;
  onRelease: (reason?: ComputerReleaseReason) => Promise<void>;
}) {
  const { t } = useI18n();
  const actions: Array<{ label: string; reason?: ComputerReleaseReason; primary?: boolean }> =
    takeoverRequested
      ? [
          { label: t("Skip"), reason: "skipped" },
          { label: t("I’m done"), reason: "done", primary: true },
        ]
      : [{ label: t("Release") }];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      {actions.map((action) => (
        <NativeActionButton
          key={action.label}
          label={action.label}
          prominence={action.primary ? "primary" : "secondary"}
          fill={false}
          style={{ alignSelf: "center" }}
          onPress={() => void onRelease(action.reason)}
        />
      ))}
    </View>
  );
}

let nativeScreenPageSequence = 0;

function ScreenWebView({
  url,
  interactive,
  nativeKeyboard = false,
  nativeGeometry = false,
  keyboardSession,
  webViewRef,
  onDimensions,
  onKeyboardMessage,
  onNativeGeometry,
  onNativeSourceUnavailable,
  onScreenState,
  onLoadStart,
  onRendererLost,
  onError,
}: {
  url: string;
  interactive: boolean;
  nativeKeyboard?: boolean;
  nativeGeometry?: boolean;
  keyboardSession?: string;
  webViewRef?: RefObject<WebView | null>;
  onDimensions: (source: string, dimensions: { width: number; height: number }) => void;
  onKeyboardMessage?: (data: string) => void;
  onNativeGeometry?: (geometry: NativeScreenGeometry | null) => void;
  onNativeSourceUnavailable?: () => void;
  onScreenState?: (state: ScreenPageState) => void;
  onLoadStart?: () => void;
  onRendererLost?: () => void;
  onError: () => void;
}) {
  const tokens = useMobileTokens();
  const sourceUrl = useRef(url);
  sourceUrl.current = retainScreenSource(sourceUrl.current, url);
  const loadedSource = sourceUrl.current;
  const loadedPageUrl = useRef<string | null>(null);
  const screenConnected = useRef(false);
  const nativePage = useRef<string | null>(null);
  if (nativePage.current === null) nativePage.current = String(++nativeScreenPageSequence);
  const nativePageId = nativePage.current;
  const nativePageClosed = useRef(false);
  const nativePageLoaded = useRef(false);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const reportStarted = useRef(false);
  const reportCallback = useRef(onScreenState);
  reportCallback.current = onScreenState;
  useEffect(() => {
    reportStarted.current = false;
    // Only proxy pages report their state; one that never starts shows as failed.
    if (!isProxiedScreenPage(loadedSource)) return;
    const timer = setTimeout(() => {
      if (!reportStarted.current) reportCallback.current?.("failed");
    }, 15_000);
    return () => clearTimeout(timer);
  }, [loadedSource, nativeKeyboard]);
  return (
    <WebView
      ref={webViewRef}
      // Reload when control enables the native keyboard. The boot script only
      // runs on load, and a view-only page never attaches the key bridge.
      key={`${nativeKeyboard ? "keys" : nativeGeometry ? "native" : "view"}:${sourceUrl.current}`}
      source={{ uri: sourceUrl.current }}
      injectedJavaScriptBeforeContentLoaded={
        nativeKeyboard
          ? NATIVE_COMPUTER_KEYBOARD_BOOT
          : nativeGeometry
            ? nativeScreenGeometryScript(nativePageId)
            : undefined
      }
      injectedJavaScript={`${COMPUTER_SCREEN_SIZE_SCRIPT}\n${
        nativeKeyboard && keyboardSession
          ? `document.getElementById("mobile-trackpad")?.style.setProperty("display", "none");\n${computerKeyboardReadyProbe(keyboardSession)}`
          : ""
      }`}
      onMessage={(event) => {
        if (!mounted.current || (nativeGeometry && nativePageClosed.current)) return;
        if (nativeGeometry && (!event.nativeEvent.url || event.nativeEvent.url === "null")) {
          nativePageClosed.current = true;
          onNativeSourceUnavailable?.();
          return;
        }
        const authorized = fromScreenPage(
          event.nativeEvent.url,
          sourceUrl.current,
          loadedPageUrl.current,
        );
        const nativeAuthorized =
          !nativeGeometry ||
          isNativeControlPage(event.nativeEvent.url, sourceUrl.current, loadedPageUrl.current);
        if (authorized && nativeAuthorized) {
          const dimensions = computerScreenDimensions(event.nativeEvent.data);
          if (dimensions) {
            onDimensions(loadedSource, dimensions);
            return;
          }
        }
        const state =
          authorized && nativeAuthorized ? screenPageState(event.nativeEvent.data) : null;
        if (state) {
          if (nativeGeometry) {
            if (
              state === "connected" ||
              ((state === "loading" || state === "connecting") && !screenConnected.current)
            )
              return;
            nativePageClosed.current = true;
            screenConnected.current = false;
            onNativeGeometry?.(null);
            onScreenState?.(state);
            return;
          }
          screenConnected.current = state === "connected";
          if (state !== "loading") reportStarted.current = true;
          onScreenState?.(state);
        } else if (authorized && nativeGeometry && nativeAuthorized) {
          const geometry = nativeScreenGeometry(event.nativeEvent.data, nativePageId);
          if (geometry) {
            if (!screenConnected.current) {
              screenConnected.current = true;
              reportStarted.current = true;
              onScreenState?.("connected");
            }
            onNativeGeometry?.(geometry);
          } else if (isNativeScreenGeometryInvalidation(event.nativeEvent.data, nativePageId)) {
            nativePageClosed.current = true;
            screenConnected.current = false;
            onNativeGeometry?.(null);
            onScreenState?.("disconnected");
          }
        } else if (authorized && nativeKeyboard) onKeyboardMessage?.(event.nativeEvent.data);
      }}
      onLoadStart={(event) => {
        if (!mounted.current) return;
        if (nativeGeometry && nativePageLoaded.current) {
          nativePageClosed.current = true;
          onNativeGeometry?.(null);
        }
        nativePageLoaded.current = true;
        screenConnected.current = false;
        loadedPageUrl.current = event?.nativeEvent?.url ?? null;
        onLoadStart?.();
      }}
      style={{ flex: 1, backgroundColor: tokens.background }}
      pointerEvents={interactive ? "auto" : "none"}
      // A view-only screen is a picture: keep its page, including the hidden keyboard field,
      // out of VoiceOver and TalkBack.
      accessibilityElementsHidden={!interactive}
      importantForAccessibility={interactive ? "auto" : "no-hide-descendants"}
      javaScriptEnabled
      domStorageEnabled
      keyboardDisplayRequiresUserAction={false}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      originWhitelist={["*"]}
      mixedContentMode="never"
      onShouldStartLoadWithRequest={(request) =>
        isAllowedScreenNavigation(sourceUrl.current, request.url)
      }
      setSupportMultipleWindows={false}
      scrollEnabled={false}
      overScrollMode="never"
      onError={onError}
      onHttpError={onError}
      onRenderProcessGone={onRendererLost}
      onContentProcessDidTerminate={onRendererLost}
    />
  );
}
