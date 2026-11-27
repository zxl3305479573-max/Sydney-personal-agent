// @vitest-environment jsdom

import type { Me } from "@rakazo/contracts";
import { accountDisplay } from "@rakazo/core";
import type { ReactNode } from "react";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InboxHeader } from "../components/inbox-header";
import {
  captureAccountMeSnapshot,
  syncAccountMeCache,
  useAccountAvatar,
  useCachedAccountMe,
} from "./account-avatar";
import { accountRpcQuery, queryClient } from "./query";

const mocks = vi.hoisted(() => ({
  fetchAccountAvatar: vi.fn(),
  push: vi.fn(),
}));

vi.mock("./query", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return {
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    accountRpcQuery: () => ({
      queryKey: ["server:https://server.example", "session:1", "me", {}] as const,
      queryFn: async () => {
        throw new Error("unexpected fetch");
      },
    }),
  };
});

vi.mock("./api", () => ({
  fetchAccountAvatar: mocks.fetchAccountAvatar,
}));

vi.mock("react-native", () => ({
  Image: ({ source }: { source: { uri: string } }) =>
    createElement("img", { src: source.uri, alt: "" }),
  Platform: { OS: "ios" },
  Pressable: ({
    children,
    accessibilityLabel,
    onPress,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
    onPress?: () => void;
  }) =>
    createElement(
      "button",
      { type: "button", "aria-label": accessibilityLabel, onClick: onPress },
      children,
    ),
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: ({ children }: { children?: ReactNode }) => createElement("span", null, children),
  View: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
}));

vi.mock("@expo/ui/community/menu", () => ({
  MenuView: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));

vi.mock("../components/native-symbol", () => ({ NativeSymbol: () => null }));
vi.mock("./material-icons", () => ({ materialIcons: {} }));
vi.mock("./appearance", () => ({
  mobileTokens: () => ({}),
  resolveMobileAppearance: () => "light",
}));
vi.mock("./i18n", () => ({
  useI18n: () => ({ t: (text: string) => text, locale: "zh-CN" }),
}));
vi.mock("./native", () => ({
  native: {},
  useMobileTokens: () => ({}),
  useResolvedAppearance: () => "light",
  useThemedStyles: () => ({}),
}));

function makeMe(overrides: Partial<Me> = {}): Me {
  return {
    ticketBoardEnabled: false,
    phoneCallsEnabled: false,
    navLinks: [],
    userId: "user-1",
    email: "user@example.test",
    name: "Sydney",
    spaceId: "space-1",
    isDeploymentOwner: false,
    isAdmin: false,
    needsModel: false,
    defaultProvider: null,
    defaultModel: null,
    hostCredentialProvider: null,
    hostCredentialSource: null,
    computerHost: null,
    canChooseHostComputer: false,
    sandboxProvider: "none",
    mcpStdioEnabled: false,
    avatarStyle: "organic",
    billingEnabled: false,
    ...overrides,
  };
}

function ConnectedInboxHeader({
  fallbackMe,
  hasSession = true,
}: {
  fallbackMe?: Pick<Me, "userId" | "name"> & { image?: Me["image"] };
  hasSession?: boolean;
}) {
  const cachedAccountMe = useCachedAccountMe();
  const profileMe = cachedAccountMe ?? fallbackMe;
  const { image } = useAccountAvatar(profileMe, hasSession);
  const initials = accountDisplay(profileMe ?? {}, "You").initial ?? "?";
  return (
    <InboxHeader
      initials={initials}
      avatar={image}
      activityMode={false}
      toggleActivityMode={vi.fn()}
      runCreateAction={vi.fn()}
      columnInsets={{ left: 0, right: 0 }}
    />
  );
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  queryClient.clear();
  mocks.fetchAccountAvatar.mockReset();
  mocks.push.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
  vi.unstubAllGlobals();
});

async function flushQueryNotifications() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

it("renders the avatar synced from me without an extra session fetch", () => {
  const image = "data:image/jpeg;base64,cGhvdG8x";
  const snapshot = captureAccountMeSnapshot();
  syncAccountMeCache(snapshot, makeMe({ image }));

  act(() => root.render(<ConnectedInboxHeader />));

  const accountButton = container.querySelector('[aria-label="Account"]')!;
  expect(accountButton.querySelector("img")?.getAttribute("src")).toBe(image);
  expect(mocks.fetchAccountAvatar).not.toHaveBeenCalled();
});

it("loads the saved avatar from the session endpoint when me omits image", async () => {
  const image = "data:image/jpeg;base64,bGVnYWN5";
  mocks.fetchAccountAvatar.mockResolvedValueOnce(image);

  await act(async () => {
    root.render(<ConnectedInboxHeader fallbackMe={{ userId: "user-1", name: "Sydney" }} />);
  });
  await flushQueryNotifications();

  expect(container.querySelector('[aria-label="Account"] img')?.getAttribute("src")).toBe(image);
  expect(mocks.fetchAccountAvatar).toHaveBeenCalledWith("user-1");
});

it("updates immediately after editing the avatar in settings and ignores stale in-flight polls", async () => {
  const initialImage = "data:image/jpeg;base64,b2xk";
  const editedImage = "data:image/jpeg;base64,bmV3";
  const remoteImage = "data:image/jpeg;base64,cmVtb3Rl";
  const meKey = accountRpcQuery("me").queryKey;

  const initialSnapshot = captureAccountMeSnapshot();
  syncAccountMeCache(initialSnapshot, makeMe({ image: initialImage }));
  act(() => root.render(<ConnectedInboxHeader />));
  expect(container.querySelector('[aria-label="Account"] img')?.getAttribute("src")).toBe(
    initialImage,
  );

  // Start an inbox poll before the user saves a new avatar in Account settings.
  const stalePollSnapshot = captureAccountMeSnapshot();

  queryClient.setQueryData<Me>(meKey, (current) =>
    current ? { ...current, image: editedImage } : current,
  );
  await flushQueryNotifications();
  expect(container.querySelector('[aria-label="Account"] img')?.getAttribute("src")).toBe(
    editedImage,
  );

  // The earlier poll resolves with the old avatar and must not overwrite the newer edit.
  syncAccountMeCache(stalePollSnapshot, makeMe({ image: initialImage }));
  await flushQueryNotifications();
  expect(container.querySelector('[aria-label="Account"] img')?.getAttribute("src")).toBe(
    editedImage,
  );

  // A fresh poll after the edit picks up changes made on another device.
  const freshPollSnapshot = captureAccountMeSnapshot();
  syncAccountMeCache(freshPollSnapshot, makeMe({ image: remoteImage }));
  await flushQueryNotifications();
  expect(container.querySelector('[aria-label="Account"] img')?.getAttribute("src")).toBe(
    remoteImage,
  );
});
