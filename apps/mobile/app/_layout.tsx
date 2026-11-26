import type { LinkFavicons } from "@rakazo/chat-ui/native";
import {
  CodeCopyButtonContext,
  LinkFaviconsContext,
  MarkdownLinkPromptProvider,
  MermaidDiagramContext,
  RemoteImagesContext,
} from "@rakazo/chat-ui/native";
import { analyticsScreen } from "@rakazo/core";
import {
  DarkTheme,
  Stack,
  ThemeProvider,
  useGlobalSearchParams,
  usePathname,
  useRouter,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppErrorBoundary } from "../components/app-error-boundary";
import { CallCard } from "../components/CallCard";
import { chatRouteHeader } from "../components/chat-route-header";
import { CodeCopyButton } from "../components/code-copy-button";
import { CompanionFloatingBar } from "../components/companion-floating-bar";
import { ComputerUpdateProgress } from "../components/computer-update-progress";
import { floatingHeaderOptions, glassHeaderOptions } from "../components/glass-title";
import { MermaidDiagram } from "../components/mermaid-diagram";
import { MessageMenuHost } from "../components/message-action-menu";
import { MessageActionSheetHost } from "../components/message-action-sheet-host";
import { NativeSymbol } from "../components/native-symbol";
import { ScopedThemeRoute, ScopedThemeScreen } from "../components/scoped-theme";
import { StartupSplash } from "../components/startup-splash";
import { UpdateDownloadBanner } from "../components/update-download-banner";
import { VoicePlayerBar } from "../components/voice-player-bar";
import {
  currentApiBase,
  loadApiBase,
  loadSessionToken,
  rpc,
  selectedSpaceId,
  subscribeApiBase,
  subscribeSessionRejected,
} from "../lib/api";
import { clearAppBadge } from "../lib/app-badge";
import { loadAppearancePreference } from "../lib/appearance";
import { replaceWithSignIn } from "../lib/auth-routing";
import { AvatarScreenFocus } from "../lib/avatar-life";
import { installClientUpdates, useStartupUpdatePrompt } from "../lib/client-update";
import { loadInstalledThemes } from "../lib/theme-library";
import { themeScopeForRoute } from "../lib/theme-pack";
import { themeManager } from "../lib/theme-state";
import { loadUiMode } from "../lib/ui-mode";
import { UiModeProvider } from "../lib/ui-mode-provider";
import "../lib/companion-activity";
import { InboxPane } from "../components/inbox-screens";
import { loadCompanionPreferences, setCompanionOpenThreadBotId } from "../lib/companion-session";
import { useCompanionThreadWatch } from "../lib/companion-thread-watch";
import { bootstrapI18n, useI18n } from "../lib/i18n";
import { loadLinkFavicon } from "../lib/link-favicons";
import {
  configureForegroundNotifications,
  resumeLiveNotifications,
} from "../lib/live-notifications";
import {
  MainNavigationProvider,
  showsMainNavigation,
  useMainNavigationHidden,
} from "../lib/main-navigation";
import { setMobileMonitoringScreen } from "../lib/monitoring";
import { native, useMobileTokens, useResolvedAppearance } from "../lib/native";
import { loadNotificationPreferences } from "../lib/notification-preferences";
import { useNotificationResponses } from "../lib/open-notification";
import { clearQueries } from "../lib/query";
import {
  getCachedRemoteImagesEnabled,
  loadRemoteImagesPreference,
  subscribeRemoteImages,
} from "../lib/remote-images-preference";
import { loadResponseStreamingPreference } from "../lib/response-streaming";
import { clearSavedChats } from "../lib/saved-chats";
import {
  currentReadySessionGeneration,
  registerSessionDiskCache,
  subscribeSessionGeneration,
} from "../lib/session";
import { BottomSafeAreaClaimedContext, InboxBesideContext } from "../lib/side-insets";
import {
  chooseInboxWidth,
  closesSplitPane,
  inboxPaneWidth,
  loadInboxWidth,
  setInboxHidden,
  useSplitView,
} from "../lib/split-view";
import {
  completeMobileStartup,
  markMobileStartupMounted,
  ServerSettingsStartupError,
  trackMobileStartup,
  waitForMobileStartup,
} from "../lib/startup";
import { capTextScaling } from "../lib/text-scale";
import {
  loadTrustedLinkSites,
  trustLinkSite,
  useTrustedLinkSites,
} from "../lib/trusted-link-sites";
import { startUnsentSends } from "../lib/unsent-sends";
import { useFirstLaunchNotificationPrompt } from "../lib/use-first-launch-notification-prompt";
import { getVoicePlaybackState, subscribeVoicePlayback } from "../lib/voice";

// Before anything renders: text grows with the iOS text size only up to a fixed maximum.
capTextScaling();
configureForegroundNotifications();
registerSessionDiskCache(clearSavedChats);
registerSessionDiskCache(clearQueries);
installClientUpdates();
registerSessionDiskCache(() => void clearAppBadge());
// Keep the splash up until the saved appearance applies, so the first frame isn't in the OS scheme.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const DIVIDER_GRAB_WIDTH = 24;
// Screens that take the whole window even when it is wide enough for the chat list beside them.
const FULL_WINDOW_ROUTES = new Set([
  "/sign-in",
  "/server",
  "/image",
  "/computer",
  "/share",
  "/map",
]);

/** On a wide window the chat list stays on the left and the stack shows the open chat beside it. */
function SplitFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  useEffect(() => {
    themeManager.setActiveScope(themeScopeForRoute(pathname));
  }, [pathname]);
  const router = useRouter();
  const params = useGlobalSearchParams();
  const routeKey = JSON.stringify([pathname, params]);
  const paneSpace = useRef<string | null>(null);
  // Capture the space when any route opens, including another entity on the same route.
  useEffect(() => {
    paneSpace.current = pathname === "/" || pathname === "/chats" ? null : selectedSpaceId();
  }, [routeKey]);
  const { split, inboxShown, inboxWidth, foldGap, foldActive, windowWidth } = useSplitView();
  const tokens = useMobileTokens();
  const chatsHome = pathname === "/chats";
  useEffect(() => {
    if (chatsHome) setInboxHidden(false);
  }, [chatsHome]);
  const projectRoute =
    pathname === "/" ||
    pathname === "/projects" ||
    pathname.startsWith("/projects/") ||
    pathname === "/integrations" ||
    pathname === "/github";
  const showsInbox =
    split && (chatsHome || inboxShown) && !FULL_WINDOW_ROUTES.has(pathname) && !projectRoute;
  // Dragging resizes the list natively; the width is kept when the finger lifts.
  const paneWidth = useSharedValue(inboxWidth);
  const dragStart = useRef(inboxWidth);
  useEffect(() => {
    paneWidth.value = inboxWidth;
  }, [inboxWidth, paneWidth]);
  const resize = Gesture.Pan()
    .enabled(!foldActive)
    .runOnJS(true)
    .activeOffsetX([-4, 4])
    .onStart(() => {
      dragStart.current = paneWidth.value;
    })
    .onUpdate((event) => {
      paneWidth.value = inboxPaneWidth(windowWidth, dragStart.current + event.translationX);
    })
    .onEnd((_event, success) => {
      if (success) chooseInboxWidth(paneWidth.value);
    });
  const paneStyle = useAnimatedStyle(() => ({ width: paneWidth.value }));
  const handleStyle = useAnimatedStyle(() => ({ left: paneWidth.value - DIVIDER_GRAB_WIDTH / 2 }));
  return (
    <View style={{ flex: 1, flexDirection: "row" }}>
      {showsInbox ? (
        <Animated.View
          style={[
            paneStyle,
            { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: tokens.border },
          ]}
        >
          <ScopedThemeScreen scope="inbox">
            <InboxPane
              onSelectSpace={(spaceId) => {
                if (
                  pathname !== "/chats" &&
                  closesSplitPane(pathname, paneSpace.current, spaceId)
                ) {
                  router.replace("/chats");
                }
              }}
            />
          </ScopedThemeScreen>
        </Animated.View>
      ) : null}
      {/* Keeps its place among the children so the navigation stack survives folding. */}
      <View style={{ flex: 1, marginLeft: showsInbox ? foldGap : 0 }}>
        <InboxBesideContext.Provider value={showsInbox}>{children}</InboxBesideContext.Provider>
      </View>
      {showsInbox && !foldActive ? (
        <GestureDetector gesture={resize}>
          {/* Drawn last and wider than the line, over both panes, so it is easy to grab. */}
          <Animated.View
            accessible={false}
            collapsable={false}
            style={[
              {
                position: "absolute",
                top: 0,
                bottom: 0,
                width: DIVIDER_GRAB_WIDTH,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "transparent",
              },
              handleStyle,
            ]}
          >
            <View
              style={{
                width: 5,
                height: 40,
                borderRadius: 3,
                backgroundColor: tokens.mutedForeground,
                opacity: 0.6,
              }}
            />
          </Animated.View>
        </GestureDetector>
      ) : null}
    </View>
  );
}

function LinkGlobe() {
  const tokens = useMobileTokens();
  return (
    <NativeSymbol ios="globe" android="globe-outline" size={16} color={tokens.mutedForeground} />
  );
}

function ChatContentProviders({
  loadRemoteImages,
  children,
}: {
  loadRemoteImages: boolean;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const endpoint = useSyncExternalStore(subscribeApiBase, currentApiBase, currentApiBase);
  const linkFavicons = useMemo<LinkFavicons>(
    () => ({ endpoint, load: (origin) => loadLinkFavicon(origin, endpoint), globe: <LinkGlobe /> }),
    [endpoint],
  );
  const session = useSyncExternalStore(subscribeSessionGeneration, currentReadySessionGeneration);
  const trustedSites = useTrustedLinkSites();
  useEffect(() => {
    void loadTrustedLinkSites().catch(() => undefined);
  }, [endpoint, session]);
  return (
    <MarkdownLinkPromptProvider
      appOrigin={endpoint}
      copy={{
        title: t("Open external link?"),
        cancel: t("Cancel"),
        open: t("Open"),
        alwaysOpen: (site) => t("Always open {site}", { site }),
      }}
      trustedSites={trustedSites}
      trustSite={trustLinkSite}
    >
      <RemoteImagesContext.Provider value={loadRemoteImages}>
        <LinkFaviconsContext.Provider value={linkFavicons}>
          <MermaidDiagramContext.Provider value={MermaidDiagram}>
            <CodeCopyButtonContext.Provider value={CodeCopyButton}>
              {children}
            </CodeCopyButtonContext.Provider>
          </MermaidDiagramContext.Provider>
        </LinkFaviconsContext.Provider>
      </RemoteImagesContext.Provider>
    </MarkdownLinkPromptProvider>
  );
}

export const unstable_settings = { anchor: "(tabs)" };

function LayoutContent() {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const voicePlaying =
    useSyncExternalStore(subscribeVoicePlayback, getVoicePlaybackState).status !== "idle";
  // Beside the list a chat swaps in place, the way it does when picked from a sidebar.
  const { split, inboxHidden, foldActive } = useSplitView();
  const chatAnimation = split ? "none" : undefined;
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState(false);
  useNotificationResponses(ready);
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams<{ botId?: string | string[] }>();
  useEffect(() => {
    const rawBot = Array.isArray(globalParams.botId) ? globalParams.botId[0] : globalParams.botId;
    setCompanionOpenThreadBotId(pathname === "/thread" && rawBot ? rawBot : null);
  }, [pathname, globalParams.botId]);
  useCompanionThreadWatch(ready);
  const navigationHidden = useMainNavigationHidden();
  const showMainNavigation = showsMainNavigation(pathname) && !navigationHidden;
  const screen = analyticsScreen(pathname);
  useEffect(() => setMobileMonitoringScreen(screen), [screen]);
  useEffect(() => {
    const surface = Platform.OS;
    if (!ready || !screen || (surface !== "ios" && surface !== "android")) return;
    let active = true;
    void loadSessionToken()
      .then((token) => {
        if (active && token)
          return rpc("analytics/screen", { screen, surface }, { skipSpaceAuthRecovery: true });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [ready, screen]);
  const [appearanceReady, setAppearanceReady] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);
  const [splashAnimationDone, setSplashAnimationDone] = useState(false);
  useStartupUpdatePrompt(splashHidden && splashAnimationDone);
  useFirstLaunchNotificationPrompt(splashHidden && splashAnimationDone && ready, pathname);
  const resolved = useResolvedAppearance();
  const tokens = useMobileTokens();
  const loadRemoteImages = useSyncExternalStore(
    subscribeRemoteImages,
    getCachedRemoteImagesEnabled,
    () => false,
  );
  const navigationTheme = useMemo(() => {
    return {
      ...DarkTheme,
      dark: resolved === "dark",
      colors: {
        ...DarkTheme.colors,
        background: tokens.background,
        card: tokens.background,
        text: tokens.foreground,
        border: tokens.border,
        primary: tokens.primary,
        notification: tokens.foreground,
      },
    };
  }, [resolved, tokens]);

  useEffect(() => {
    if (appearanceReady && ready)
      void SplashScreen.hideAsync()
        .then(() => {
          completeMobileStartup();
          setSplashHidden(true);
        })
        .catch(() => undefined);
  }, [appearanceReady, ready]);

  useEffect(() => {
    if (!ready) return;
    // A session revoked or expired on the server ends here, from whichever screen noticed it.
    return subscribeSessionRejected(() => replaceWithSignIn());
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    return startUnsentSends();
  }, [ready]);

  useEffect(() => {
    let active = true;
    markMobileStartupMounted();
    void waitForMobileStartup(trackMobileStartup("server", loadApiBase()), [
      trackMobileStartup(
        "appearance",
        Promise.all([loadAppearancePreference(), loadUiMode(), loadInstalledThemes()]),
      ).finally(() => {
        if (active) setAppearanceReady(true);
      }),
      trackMobileStartup("streaming", loadResponseStreamingPreference()),
      trackMobileStartup("images", loadRemoteImagesPreference()),
      trackMobileStartup("notifications", loadNotificationPreferences()),
      trackMobileStartup("companion", loadCompanionPreferences()),
      trackMobileStartup("inbox", loadInboxWidth()),
      trackMobileStartup("language", bootstrapI18n()),
    ])
      .then(() => {
        if (!active) return;
        // The native poller stores the locale its notification copy uses, so the
        // restart waits for the language to load rather than saving the default.
        // Notification restoration must not keep the native splash visible.
        void loadSessionToken()
          .then((token) =>
            resumeLiveNotifications(currentApiBase(), token, selectedSpaceId() ?? ""),
          )
          .catch(() => undefined);
        setReady(true);
      })
      .catch(() => {
        if (active) setStartupError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (startupError) throw new ServerSettingsStartupError("Could not load server settings");

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        {ready ? (
          <ChatContentProviders loadRemoteImages={loadRemoteImages}>
            <ThemeProvider value={navigationTheme}>
              <StatusBar style={resolved === "light" ? "dark" : "light"} />
              <View style={{ flex: 1 }}>
                <BottomSafeAreaClaimedContext.Provider value={voicePlaying}>
                  <SplitFrame>
                    <Stack
                      screenLayout={({ route, navigation, options, children }) =>
                        route.name === "(tabs)" ? (
                          children
                        ) : (
                          <AvatarScreenFocus navigation={navigation}>
                            <ScopedThemeRoute routeName={route.name}>
                              {/* Sheets and modals cover the window, so the chat list is not beside them. */}
                              {options.presentation && options.presentation !== "card" ? (
                                <InboxBesideContext.Provider value={false}>
                                  {children}
                                </InboxBesideContext.Provider>
                              ) : (
                                children
                              )}
                            </ScopedThemeRoute>
                          </AvatarScreenFocus>
                        )
                      }
                      screenOptions={{
                        headerStyle: { backgroundColor: navigationTheme.colors.background },
                        ...floatingHeaderOptions(),
                        headerTintColor: navigationTheme.colors.text,
                        headerShadowVisible: false,
                        headerBackButtonDisplayMode: "minimal",
                        contentStyle: { backgroundColor: String(native.page) },
                      }}
                    >
                      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                      <Stack.Screen
                        name="search"
                        options={{
                          headerShown: false,
                          presentation: Platform.OS === "ios" ? "formSheet" : "card",
                          sheetAllowedDetents: [1],
                          sheetGrabberVisible: false,
                          sheetExpandsWhenScrolledToEdge: false,
                        }}
                      />
                      <Stack.Screen name="share" options={{ headerShown: false }} />
                      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
                      <Stack.Screen
                        name="paywall"
                        options={{
                          headerShown: false,
                          presentation: "fullScreenModal",
                          gestureEnabled: false,
                        }}
                      />
                      <Stack.Screen
                        name="(settings)"
                        options={{
                          headerShown: false,
                          // One stack of settings pages in a sheet over the screen that opened it.
                          // Android keeps pushed pages: it has no nested stack inside a formSheet.
                          presentation: Platform.OS === "ios" ? "formSheet" : "card",
                          sheetAllowedDetents: [0.95],
                          sheetGrabberVisible: false,
                          sheetExpandsWhenScrolledToEdge: false,
                          contentStyle: { backgroundColor: native.groupedPage },
                        }}
                      />
                      <Stack.Screen
                        name="server"
                        options={{
                          title: t("Server"),
                          presentation: "formSheet",
                          sheetAllowedDetents: [0.6, 1],
                          sheetGrabberVisible: true,
                        }}
                      />
                      <Stack.Screen
                        name="new-group"
                        options={{
                          title: t("New group chat"),
                          presentation: "modal",
                          gestureEnabled: true,
                        }}
                      />
                      <Stack.Screen
                        name="new-space"
                        options={{
                          title: t("New private space"),
                          presentation: "modal",
                          gestureEnabled: true,
                          headerBackVisible: false,
                        }}
                      />
                      <Stack.Screen name="artifacts" options={glassHeaderOptions(t("Artifacts"))} />
                      <Stack.Screen name="artifact" options={{ title: t("Artifact") }} />
                      <Stack.Screen name="github" options={glassHeaderOptions("GitHub")} />
                      <Stack.Screen name="github-repo" options={glassHeaderOptions("GitHub")} />
                      <Stack.Screen
                        name="integrations"
                        options={glassHeaderOptions(locale.startsWith("zh") ? "应用" : "Apps")}
                      />
                      <Stack.Screen
                        name="integration-detail"
                        options={glassHeaderOptions(locale.startsWith("zh") ? "应用详情" : "App")}
                      />
                      <Stack.Screen
                        name="projects/[workspaceId]"
                        options={glassHeaderOptions(locale.startsWith("zh") ? "项目" : "Project")}
                      />
                      <Stack.Screen
                        name="projects/[workspaceId]/chat"
                        options={glassHeaderOptions(
                          locale.startsWith("zh") ? "项目会话" : "Project chat",
                        )}
                      />
                      <Stack.Screen
                        name="group-thread"
                        options={({ route }) => ({
                          title: t("Group"),
                          animation: chatAnimation,
                          ...chatRouteHeader(route, t, { split, inboxHidden, foldActive }),
                        })}
                      />
                      <Stack.Screen
                        name="group-settings"
                        options={glassHeaderOptions(t("Group settings"))}
                      />
                      <Stack.Screen name="bot-profile" options={glassHeaderOptions(t("Profile"))} />
                      <Stack.Screen
                        name="bot-settings"
                        options={glassHeaderOptions(t("Chat settings"))}
                      />
                      <Stack.Screen name="bot-model" options={glassHeaderOptions(t("Model"))} />
                      <Stack.Screen
                        name="thread-model"
                        options={{
                          ...glassHeaderOptions(t("Model")),
                          presentation: "formSheet",
                          sheetAllowedDetents: [0.55, 1],
                          sheetGrabberVisible: true,
                        }}
                      />
                      <Stack.Screen
                        name="thread"
                        options={({ route }) => ({
                          title: t("Thread"),
                          animation: chatAnimation,
                          ...chatRouteHeader(route, t, { split, inboxHidden, foldActive }),
                        })}
                      />
                      <Stack.Screen name="routines" options={glassHeaderOptions(t("Routines"))} />
                      <Stack.Screen name="routine" options={glassHeaderOptions(t("Routine"))} />
                      <Stack.Screen name="board" options={glassHeaderOptions(t("Board"))} />
                      <Stack.Screen
                        name="companion"
                        options={glassHeaderOptions(
                          locale.startsWith("zh") ? "后台陪伴" : "Background Companion",
                        )}
                      />
                      <Stack.Screen
                        name="weather"
                        options={glassHeaderOptions(
                          locale.startsWith("zh")
                            ? locale === "zh-TW"
                              ? "天氣"
                              : "天气"
                            : "Weather",
                        )}
                      />
                      <Stack.Screen
                        name="map"
                        options={glassHeaderOptions(
                          locale.startsWith("zh") ? "地图与导航" : "Map & Navigation",
                        )}
                      />
                      <Stack.Screen name="computer" options={{ title: t("Computer") }} />
                      <Stack.Screen
                        name="image"
                        options={{
                          headerShown: false,
                          presentation: "transparentModal",
                          contentStyle: { backgroundColor: "transparent" },
                          animation: "fade",
                        }}
                      />
                    </Stack>
                  </SplitFrame>
                </BottomSafeAreaClaimedContext.Provider>
                <VoicePlayerBar
                  style={{ marginTop: 8, marginBottom: showMainNavigation ? 8 : insets.bottom + 8 }}
                />
                <CompanionFloatingBar
                  topInset={insets.top + 8}
                  bottomOffset={
                    (showMainNavigation ? insets.bottom + 68 : insets.bottom + 14) +
                    (voicePlaying ? 62 : 0)
                  }
                />
              </View>
              <ComputerUpdateProgress />
              <UpdateDownloadBanner />
              <MessageMenuHost />
              <MessageActionSheetHost />
              <CallCard />
              <StartupSplash
                ready={splashHidden && ready}
                onFinished={() => setSplashAnimationDone(true)}
              />
            </ThemeProvider>
          </ChatContentProviders>
        ) : (
          <View style={{ flex: 1, backgroundColor: String(native.page) }} />
        )}
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

export default function Layout() {
  return (
    <AppErrorBoundary>
      <UiModeProvider>
        <MainNavigationProvider>
          <LayoutContent />
        </MainNavigationProvider>
      </UiModeProvider>
    </AppErrorBoundary>
  );
}
