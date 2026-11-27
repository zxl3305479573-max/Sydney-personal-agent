// @vitest-environment jsdom

import type { AdminUserFeatureAccess, Me } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act, createElement, useEffect } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FeatureAccessScreen from "../app/(settings)/feature-access";
import { MainBottomNavigation } from "../components/main-bottom-navigation";
import { hasFeatureAccess, resolveMobileFeatureAccess } from "./feature-access";
import { accountRpcQuery, queryClient } from "./query";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  push: vi.fn(),
  alert: vi.fn(),
  pathname: "/",
}));

vi.mock("./query-client", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return {
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  };
});

vi.mock("./query", async () => {
  const { queryClient } = await import("./query-client");
  return {
    queryClient,
    accountRpcQuery: () => ({
      queryKey: ["server:https://server.example", "session:1", "me", {}] as const,
      queryFn: async () => {
        throw new Error("unexpected fetch");
      },
    }),
  };
});

vi.mock("./api", () => ({
  rpc: mocks.rpc,
  fetchAccountAvatar: vi.fn(),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: () => createElement("span", { "data-testid": "loading" }, "loading"),
  Alert: { alert: mocks.alert },
  Platform: { OS: "ios" },
  Pressable: ({
    children,
    accessibilityLabel,
    accessibilityRole,
    onPress,
    disabled,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
    accessibilityRole?: string;
    onPress?: () => void;
    disabled?: boolean;
  }) =>
    createElement(
      "button",
      {
        type: "button",
        role: accessibilityRole,
        "aria-label": accessibilityLabel,
        disabled,
        onClick: onPress,
      },
      children,
    ),
  RefreshControl: () => null,
  ScrollView: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  StyleSheet: { hairlineWidth: 1, create: <T,>(styles: T) => styles },
  Text: ({ children }: { children?: ReactNode }) => createElement("span", null, children),
  View: ({ children, testID }: { children?: ReactNode; testID?: string }) =>
    createElement("div", { "data-testid": testID }, children),
}));

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock("expo-router", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push, replace: vi.fn() }),
  useFocusEffect: (effect: () => undefined | (() => void)) => {
    useEffect(effect, [effect]);
  },
}));

vi.mock("../components/native-symbol", () => ({ NativeSymbol: () => null }));
vi.mock("../components/tab-indicator", () => ({ TabIndicator: () => null }));
vi.mock("../components/motion-pressable", () => ({
  MotionPressable: ({
    children,
    accessibilityLabel,
    accessibilityRole,
    onPress,
    disabled,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
    accessibilityRole?: string;
    onPress?: () => void;
    disabled?: boolean;
  }) =>
    createElement(
      "button",
      {
        type: "button",
        role: accessibilityRole,
        "aria-label": accessibilityLabel,
        disabled,
        onClick: onPress,
      },
      children,
    ),
}));
vi.mock("../components/account-avatar", () => ({
  AccountAvatar: ({ initial }: { initial: string }) => createElement("span", null, initial),
}));
vi.mock("../components/settings-group", () => ({
  SettingsGroup: ({ label, children }: { label?: string; children?: ReactNode }) =>
    createElement("section", null, label ? createElement("h3", null, label) : null, children),
  SettingsRow: ({
    title,
    detail,
    onPress,
    disabled,
  }: {
    title: string;
    detail?: string;
    onPress?: () => void;
    disabled?: boolean;
  }) =>
    createElement(
      onPress ? "button" : "div",
      onPress ? { type: "button", onClick: onPress, disabled } : null,
      title,
      detail ? ` ${detail}` : "",
    ),
  SettingsSwitch: ({
    label,
    value,
    disabled,
    onChange,
  }: {
    label: string;
    value: boolean;
    disabled?: boolean;
    onChange: (next: boolean) => void;
  }) =>
    createElement(
      "button",
      {
        type: "button",
        role: "switch",
        "aria-label": label,
        "aria-checked": value,
        disabled,
        onClick: () => onChange(!value),
      },
      `${label}:${value ? "on" : "off"}`,
    ),
}));
vi.mock("./app-background", () => ({ useAppBackground: () => ({ componentOpacity: 1 }) }));
vi.mock("./component-opacity", () => ({ componentSurfaceColor: (color: string) => color }));
vi.mock("./scoped-theme-context", () => ({
  useScopedTheme: () => null,
  useScreenBackground: (fallback: string) => fallback,
}));
vi.mock("./side-insets", () => ({ useSideInsets: () => ({}) }));
vi.mock("./tab-scroll-to-top", () => ({ triggerTabScrollToTop: vi.fn() }));
vi.mock("./main-navigation", () => ({ openMainNavigation: vi.fn() }));
vi.mock("./i18n", () => ({
  useI18n: () => ({ t: (text: string) => text, locale: "zh-CN" }),
}));
vi.mock("./native", () => ({
  native: { groupedPage: "#F3F1EC", secondaryLabel: "#666", label: "#111" },
  useMobileTokens: () => ({
    foreground: "#111",
    mutedForeground: "#666",
    background: "#FFF",
    card: "#FFF",
    border: "#DDD",
  }),
  useResolvedAppearance: () => "light",
}));

function makeMe(overrides: Partial<Me> = {}): Me {
  return {
    ticketBoardEnabled: false,
    phoneCallsEnabled: false,
    navLinks: [],
    userId: "user-1",
    email: "friend@example.test",
    name: "Friend",
    spaceId: "space-1",
    image: null,
    isDeploymentOwner: false,
    isAdmin: false,
    needsModel: false,
    defaultProvider: "openrouter",
    defaultModel: "model-1",
    hostCredentialProvider: null,
    hostCredentialSource: null,
    computerHost: null,
    canChooseHostComputer: false,
    sandboxProvider: "native-linux",
    mcpStdioEnabled: false,
    avatarStyle: "organic",
    timezone: null,
    locale: "zh-CN",
    billingEnabled: false,
    ...overrides,
  };
}

describe("mobile feature access gating and admin screen", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    queryClient.clear();
    mocks.rpc.mockReset();
    mocks.push.mockReset();
    mocks.alert.mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("defaults missing featureAccess to enabled for older servers and enforces explicit flags", () => {
    expect(resolveMobileFeatureAccess(makeMe())).toEqual({
      computer: true,
      projects: true,
      github: true,
      integrations: true,
      isAdmin: false,
    });
    const restricted = makeMe({
      featureAccess: { computer: false, projects: false, github: true, integrations: false },
    });
    expect(hasFeatureAccess(restricted, "computer")).toBe(false);
    expect(hasFeatureAccess(restricted, "projects")).toBe(false);
    expect(hasFeatureAccess(restricted, "github")).toBe(true);
    expect(hasFeatureAccess(restricted, "integrations")).toBe(false);
  });

  it("hides the Projects tab in MainBottomNavigation when projects access is disabled", async () => {
    queryClient.setQueryData(
      accountRpcQuery("me").queryKey,
      makeMe({
        featureAccess: { computer: false, projects: false, github: false, integrations: false },
      }),
    );

    await act(async () => {
      root.render(createElement(MainBottomNavigation));
    });
    const tabs = [...container.querySelectorAll('[role="tab"]')].map((el) =>
      el.getAttribute("aria-label"),
    );
    expect(tabs).toEqual(["首页", "聊天"]);

    await act(async () => {
      queryClient.setQueryData(
        accountRpcQuery("me").queryKey,
        makeMe({
          isAdmin: true,
          featureAccess: { computer: true, projects: true, github: true, integrations: true },
        }),
      );
    });
    const adminTabs = [...container.querySelectorAll('[role="tab"]')].map((el) =>
      el.getAttribute("aria-label"),
    );
    expect(adminTabs).toEqual(["首页", "聊天", "项目"]);
  });

  it("blocks non-admin accounts on FeatureAccessScreen without calling admin RPCs", async () => {
    queryClient.setQueryData(accountRpcQuery("me").queryKey, makeMe({ isAdmin: false }));

    await act(async () => {
      root.render(createElement(FeatureAccessScreen));
    });

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(container.textContent).toContain("仅服务器管理员可管理成员功能权限");
  });

  it("loads members and persists feature toggles for admins on FeatureAccessScreen", async () => {
    const adminRow: AdminUserFeatureAccess = {
      userId: "admin-1",
      email: "owner@example.test",
      name: "Owner",
      image: null,
      emailVerified: true,
      isAdmin: true,
      createdAt: "2026-11-01T00:00:00Z",
      overrides: { computer: null, projects: null, github: null, integrations: null },
      effective: { computer: true, projects: true, github: true, integrations: true },
    };
    const friendRow: AdminUserFeatureAccess = {
      userId: "friend-1",
      email: "friend@example.test",
      name: "Friend",
      image: null,
      emailVerified: true,
      isAdmin: false,
      createdAt: "2026-11-02T00:00:00Z",
      overrides: { computer: null, projects: null, github: null, integrations: null },
      effective: { computer: false, projects: false, github: false, integrations: false },
    };
    mocks.rpc.mockImplementation(async (path: string, input?: unknown) => {
      if (path === "featureAccess/listUsers") {
        return { restrictNonAdmins: true, users: [adminRow, friendRow] };
      }
      if (path === "featureAccess/updateUser") {
        const patch = input as { userId: string; github?: boolean };
        return {
          ...friendRow,
          overrides: { ...friendRow.overrides, github: patch.github ?? null },
          effective: { ...friendRow.effective, github: Boolean(patch.github) },
        };
      }
      throw new Error(`unexpected rpc ${path}`);
    });
    queryClient.setQueryData(accountRpcQuery("me").queryKey, makeMe({ isAdmin: true }));

    await act(async () => {
      root.render(createElement(FeatureAccessScreen));
    });

    expect(mocks.rpc).toHaveBeenCalledWith("featureAccess/listUsers");
    expect(container.textContent).toContain("管理员默认拥有全部权限");
    expect(container.textContent).toContain("Friend");

    const githubSwitch = container.querySelector(
      'button[role="switch"][aria-label="GitHub"]',
    ) as HTMLButtonElement | null;
    expect(githubSwitch).not.toBeNull();
    expect(githubSwitch?.getAttribute("aria-checked")).toBe("false");

    await act(async () => {
      githubSwitch?.click();
    });

    expect(mocks.rpc).toHaveBeenCalledWith("featureAccess/updateUser", {
      userId: "friend-1",
      github: true,
    });
    expect(githubSwitch?.getAttribute("aria-checked")).toBe("true");
  });
});
