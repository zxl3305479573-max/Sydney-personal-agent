// @vitest-environment jsdom

import type {
  GithubConnectionStatus,
  GithubProfileOverview,
  GithubRepoSummary,
} from "@rakazo/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryUserProvider } from "../lib/query";
import type {
  GithubExploreSearchProps,
  GithubRepoDrawerProps,
  GithubRepoListProps,
} from "./github/types";

const githubRpc = vi.hoisted(() => ({
  status: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  profileOverview: vi.fn(),
  listMyRepos: vi.fn(),
  searchRepos: vi.fn(),
  repoDetail: vi.fn(),
}));

const botsRpc = vi.hoisted(() => ({
  list: vi.fn(),
}));

const rpcMock = vi.hoisted(() => ({
  github: githubRpc,
  bots: botsRpc,
}));

vi.mock("../lib/rpc", () => ({
  rpc: rpcMock,
  rpcForSpace: () => rpcMock,
  createSpaceRpc: () => rpcMock,
  selectedSpaceId: () => "space-1",
}));

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    i18n: { locale: "zh-CN" },
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((acc, part, idx) => acc + part + (values[idx] ?? ""), ""),
  }),
  Trans: ({ children }: { children?: ReactNode }) => children,
}));

vi.mock("./github/GithubRepoList", () => ({
  GithubRepoList: (props: GithubRepoListProps) => (
    <div
      data-testid="mock-github-repo-list"
      data-connected={String(props.connected)}
      data-hide-private={String(props.hidePrivate)}
    />
  ),
}));

vi.mock("./github/GithubExploreSearch", () => ({
  GithubExploreSearch: (props: GithubExploreSearchProps) => (
    <div data-testid="mock-github-explore-search" data-connected={String(props.connected)} />
  ),
}));

vi.mock("./github/GithubRepoDrawer", () => ({
  GithubRepoDrawer: (props: GithubRepoDrawerProps) => (
    <div
      data-testid="mock-github-repo-drawer"
      data-target={props.target ? `${props.target.owner}/${props.target.repo}` : ""}
      data-viewer={props.viewerLogin ?? ""}
    />
  ),
}));

import { GithubPage, parseRepoSearchParam } from "./GithubPage";

function sampleRepo(overrides: Partial<GithubRepoSummary> = {}): GithubRepoSummary {
  return {
    id: "repo-1",
    name: "sydney-agent",
    ownerLogin: "octocat",
    ownerAvatarUrl: "https://avatars.example.test/u/1",
    fullName: "octocat/sydney-agent",
    description: "Personal AI workbench",
    htmlUrl: "https://github.com/octocat/sydney-agent",
    homepageUrl: null,
    cloneUrl: "https://github.com/octocat/sydney-agent.git",
    sshUrl: "git@github.com:octocat/sydney-agent.git",
    isPrivate: false,
    isFork: false,
    isArchived: false,
    defaultBranch: "main",
    primaryLanguage: { name: "TypeScript", color: "#3178c6" },
    stargazerCount: 128,
    forkCount: 16,
    openIssuesCount: 3,
    topics: ["ai", "agent"],
    licenseSpdxId: "MIT",
    pushedAt: "2026-11-18T06:00:00.000Z",
    updatedAt: "2026-11-18T06:00:00.000Z",
    ...overrides,
  };
}

function sampleOverview(): GithubProfileOverview {
  return {
    profile: {
      githubUserId: "1",
      login: "octocat",
      name: "The Octocat",
      avatarUrl: "https://avatars.example.test/u/1",
      bio: "Building developer tools",
      company: "@github",
      location: "San Francisco",
      blogUrl: "https://github.blog",
      twitterUsername: null,
      htmlUrl: "https://github.com/octocat",
      followers: 420,
      following: 18,
      publicRepos: 26,
      totalPrivateRepos: 9,
      createdAt: "2018-01-01T00:00:00.000Z",
    },
    calendar: {
      year: null,
      from: "2025-11-18T00:00:00.000Z",
      to: "2026-11-18T00:00:00.000Z",
      availableYears: [2026, 2025],
      totalContributions: 512,
      totalCommitContributions: 410,
      totalPullRequestContributions: 72,
      totalIssueContributions: 30,
      totalPullRequestReviewContributions: 0,
      restrictedContributionsCount: 12,
      currentStreakDays: 7,
      longestStreakDays: 21,
      weeks: [
        {
          contributionDays: [
            {
              date: "2026-11-15",
              contributionCount: 4,
              contributionLevel: "SECOND_QUARTILE",
              weekday: 0,
            },
          ],
        },
      ],
    },
    pinnedRepos: [
      sampleRepo({
        id: "pub-1",
        name: "sydney-agent",
        fullName: "octocat/sydney-agent",
        isPrivate: false,
      }),
      sampleRepo({
        id: "priv-1",
        name: "secret-roadmap",
        fullName: "octocat/secret-roadmap",
        isPrivate: true,
      }),
    ],
    recentRepos: [],
    rateLimit: {
      limit: 5000,
      remaining: 4982,
      resetAt: "2026-11-18T08:00:00.000Z",
    },
  };
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let client: QueryClient;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  botsRpc.list.mockResolvedValue([]);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function renderPage(initialEntry = "/app/github") {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <QueryUserProvider value="user-1">
          <MemoryRouter initialEntries={[initialEntry]}>
            <GithubPage />
          </MemoryRouter>
        </QueryUserProvider>
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

it("validates ?repo= query parameters strictly", () => {
  expect(parseRepoSearchParam("octocat/Hello-World")).toEqual({
    owner: "octocat",
    repo: "Hello-World",
  });
  expect(parseRepoSearchParam("invalid-only-one-part")).toBeNull();
  expect(parseRepoSearchParam("owner/repo/extra")).toBeNull();
  expect(parseRepoSearchParam("owner/..")).toBeNull();
  expect(parseRepoSearchParam("-badowner/repo")).toBeNull();
});

it("shows disconnected onboarding card and jumps to explore tab", async () => {
  githubRpc.status.mockResolvedValue({ status: "disconnected" } satisfies GithubConnectionStatus);

  await renderPage();

  const onboarding = container.querySelector('[data-testid="github-onboarding-card"]');
  expect(onboarding).not.toBeNull();
  expect(onboarding?.textContent).toContain("连接 GitHub Token");
  expect(onboarding?.textContent).toContain("先去搜索开源项目");

  const exploreCta = container.querySelector<HTMLButtonElement>(
    '[data-testid="github-onboarding-explore-button"]',
  )!;
  await act(async () => {
    exploreCta.click();
  });

  const exploreView = container.querySelector('[data-testid="mock-github-explore-search"]');
  expect(exploreView).not.toBeNull();
  expect(exploreView?.getAttribute("data-connected")).toBe("false");
});

it("connects a PAT via password input, clears the input state, and never stores token in localStorage", async () => {
  const connectedStatus: GithubConnectionStatus = {
    status: "connected",
    authKind: "pat",
    githubUserId: "1",
    login: "octocat",
    displayName: "The Octocat",
    avatarUrl: null,
    htmlUrl: "https://github.com/octocat",
    scopes: ["read:user", "repo"],
    highRiskScopes: [],
    connectedAt: "2026-11-18T07:00:00.000Z",
    lastVerifiedAt: "2026-11-18T07:00:00.000Z",
    rateLimit: { limit: 5000, remaining: 4990, resetAt: null },
  };

  githubRpc.status
    .mockResolvedValueOnce({ status: "disconnected" } satisfies GithubConnectionStatus)
    .mockResolvedValue(connectedStatus);
  githubRpc.connect.mockResolvedValue(connectedStatus);
  githubRpc.profileOverview.mockResolvedValue(sampleOverview());

  await renderPage();

  const openConnectBtn = container.querySelector<HTMLButtonElement>(
    '[data-testid="github-onboarding-connect-button"]',
  )!;
  await act(async () => {
    openConnectBtn.click();
  });

  const patInput = document.querySelector<HTMLInputElement>("#github-pat-input")!;
  expect(patInput).not.toBeNull();
  expect(patInput.type).toBe("password");
  expect(patInput.autocomplete).toBe("off");

  const sampleToken = "github_pat_11ABCDEF0123456789secret";
  await act(async () => {
    setNativeInputValue(patInput, sampleToken);
  });

  const form = patInput.closest("form")!;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  expect(githubRpc.connect).toHaveBeenCalledWith({ token: sampleToken });
  expect(JSON.stringify(window.localStorage)).not.toContain(sampleToken);

  // Reopen Change Token dialog and confirm input is completely empty
  const changeTokenBtn = [...container.querySelectorAll("button")].find((btn) =>
    btn.textContent?.includes("更换 Token"),
  )!;
  await act(async () => {
    changeTokenBtn.click();
  });
  const reopenedInput = document.querySelector<HTMLInputElement>("#github-pat-input")!;
  expect(reopenedInput.value).toBe("");
});

it("displays prominent security warning banner for high-risk scopes, masks private stats on hidePrivate, and switches tabs", async () => {
  const connectedWithHighRisk: GithubConnectionStatus = {
    status: "connected",
    authKind: "pat",
    githubUserId: "1",
    login: "octocat",
    displayName: "The Octocat",
    avatarUrl: "https://avatars.example.test/u/1",
    htmlUrl: "https://github.com/octocat",
    scopes: ["repo", "delete_repo", "admin:org"],
    highRiskScopes: ["delete_repo", "admin:org"],
    connectedAt: "2026-11-18T07:00:00.000Z",
    lastVerifiedAt: "2026-11-18T07:00:00.000Z",
    rateLimit: { limit: 5000, remaining: 4982, resetAt: "2026-11-18T08:00:00.000Z" },
  };

  githubRpc.status.mockResolvedValue(connectedWithHighRisk);
  githubRpc.profileOverview.mockResolvedValue(sampleOverview());

  await renderPage("/app/github?repo=octocat/sydney-agent");

  await vi.waitFor(() => {
    expect(container.querySelector('[data-testid="github-profile-overview"]')).not.toBeNull();
  });

  // High-risk scope security banner
  const securityBanner = container.querySelector('[data-testid="github-high-risk-banner"]');
  expect(securityBanner).not.toBeNull();
  expect(securityBanner?.textContent).toContain("delete_repo");
  expect(securityBanner?.textContent).toContain("admin:org");

  // Connection pill + quota
  const pill = container.querySelector('[data-testid="github-connection-pill"]');
  expect(pill?.textContent).toContain("@octocat");
  expect(pill?.textContent).toContain("4982/5000");

  // Drawer receives validated ?repo= target
  expect(
    container.querySelector('[data-testid="mock-github-repo-drawer"]')?.getAttribute("data-target"),
  ).toBe("octocat/sydney-agent");

  // Initially private stats & private repo card are visible
  expect(
    container.querySelector('[data-testid="github-private-repos-stat"]')?.textContent,
  ).toContain("9");
  expect(container.querySelector('[data-testid="github-overview-repos"]')?.textContent).toContain(
    "octocat/secret-roadmap",
  );

  // Toggle hidePrivate -> masks private repo count and filters private repo card
  const hidePrivateBtn = container.querySelector<HTMLButtonElement>(
    '[data-testid="github-hide-private-toggle"]',
  )!;
  expect(hidePrivateBtn.getAttribute("aria-pressed")).toBe("false");
  await act(async () => {
    hidePrivateBtn.click();
  });
  expect(hidePrivateBtn.getAttribute("aria-pressed")).toBe("true");
  expect(
    container.querySelector('[data-testid="github-private-repos-stat"]')?.textContent,
  ).toContain("已隐藏");
  expect(
    container.querySelector('[data-testid="github-overview-repos"]')?.textContent,
  ).not.toContain("octocat/secret-roadmap");
  expect(container.querySelector('[data-testid="github-overview-repos"]')?.textContent).toContain(
    "octocat/sydney-agent",
  );

  // Switch to Repositories tab and verify hidePrivate prop propagates
  const reposTabBtn = [...container.querySelectorAll('[data-slot="segmented-control-item"]')].find(
    (btn) => btn.textContent?.includes("远端项目"),
  ) as HTMLButtonElement;
  await act(async () => {
    reposTabBtn.click();
  });

  const repoList = container.querySelector('[data-testid="mock-github-repo-list"]');
  expect(repoList).not.toBeNull();
  expect(repoList?.getAttribute("data-connected")).toBe("true");
  expect(repoList?.getAttribute("data-hide-private")).toBe("true");
});

it("shows reconnect banner when token status is invalid and opens repo drawer from overview card", async () => {
  githubRpc.status.mockResolvedValueOnce({
    status: "invalid",
    authKind: "pat",
    login: "octocat",
    displayName: "The Octocat",
    avatarUrl: null,
    connectedAt: "2026-11-18T07:00:00.000Z",
    message: "Bad credentials (401)",
  } satisfies GithubConnectionStatus);

  await renderPage();

  const invalidBanner = container.querySelector('[data-testid="github-invalid-banner"]');
  expect(invalidBanner).not.toBeNull();
  expect(invalidBanner?.textContent).toContain("@octocat");
  expect(invalidBanner?.textContent).toContain("Bad credentials (401)");

  // Now render connected state with RemoteImagesContext default (false) -> shows initials fallback "TO"
  await act(async () => root.unmount());
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  githubRpc.status.mockResolvedValue({
    status: "connected",
    authKind: "pat",
    githubUserId: "1",
    login: "octocat",
    displayName: "The Octocat",
    avatarUrl: "https://avatars.example.test/u/1",
    htmlUrl: "https://github.com/octocat",
    scopes: ["read:user"],
    highRiskScopes: [],
    connectedAt: "2026-11-18T07:00:00.000Z",
    lastVerifiedAt: "2026-11-18T07:00:00.000Z",
    rateLimit: null,
  } satisfies GithubConnectionStatus);
  githubRpc.profileOverview.mockResolvedValue(sampleOverview());

  await renderPage();
  await vi.waitFor(() => {
    expect(container.querySelector('[data-testid="github-profile-overview"]')).not.toBeNull();
  });

  // RemoteImagesContext defaults to false -> initials fallback rendered instead of <img>
  const avatarBox = container.querySelector('[data-testid="github-profile-avatar"]')!;
  expect(avatarBox.querySelector("img")).toBeNull();
  expect(avatarBox.textContent).toBe("TO");

  // Click a pinned repo card -> selects repo into GithubRepoDrawer
  const repoCard = [
    ...container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="github-overview-repos"] button',
    ),
  ].find((btn) => btn.textContent?.includes("octocat/sydney-agent"))!;
  await act(async () => {
    repoCard.click();
  });

  expect(
    container.querySelector('[data-testid="mock-github-repo-drawer"]')?.getAttribute("data-target"),
  ).toBe("octocat/sydney-agent");
});
