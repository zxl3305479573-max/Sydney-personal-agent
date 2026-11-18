// @vitest-environment jsdom

import { RemoteImagesContext } from "@rakazo/chat-ui/web";
import type {
  Bot,
  GithubRepoDetail,
  GithubRepoPage,
  GithubRepoSummary,
  GithubSearchReposOutput,
} from "@rakazo/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const githubRpc = vi.hoisted(() => ({
  listMyRepos: vi.fn(),
  searchRepos: vi.fn(),
  repoDetail: vi.fn(),
}));

vi.mock("../../lib/rpc", () => ({
  rpc: { github: githubRpc },
  rpcForSpace: () => ({ github: githubRpc }),
  createSpaceRpc: () => ({ github: githubRpc }),
  selectedSpaceId: () => "space-1",
}));

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    i18n: { locale: "zh-CN" },
    t: (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce((acc, part, idx) => acc + part + String(values[idx] ?? ""), ""),
  }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));

import {
  COMPOSER_DRAFT_STORAGE_PREFIX,
  readComposerDraft,
  writeComposerDraft,
} from "../../lib/composer-draft";
import { GithubExploreSearch } from "./GithubExploreSearch";
import { GithubRepoDrawer } from "./GithubRepoDrawer";
import { GithubRepoList } from "./GithubRepoList";
import type { SelectedGithubRepo } from "./types";

function makeRepoSummary(overrides: Partial<GithubRepoSummary> = {}): GithubRepoSummary {
  const ownerLogin = overrides.ownerLogin ?? "sydney-labs";
  const name = overrides.name ?? "agent-core";
  return {
    id: overrides.id ?? `repo-${ownerLogin}-${name}`,
    name,
    ownerLogin,
    ownerAvatarUrl:
      overrides.ownerAvatarUrl !== undefined
        ? overrides.ownerAvatarUrl
        : "https://avatars.githubusercontent.com/u/1?v=4",
    fullName: overrides.fullName ?? `${ownerLogin}/${name}`,
    description:
      overrides.description !== undefined
        ? overrides.description
        : "Autonomous personal agent runtime in TypeScript",
    htmlUrl: overrides.htmlUrl ?? `https://github.com/${ownerLogin}/${name}`,
    homepageUrl: overrides.homepageUrl ?? null,
    cloneUrl: overrides.cloneUrl ?? `https://github.com/${ownerLogin}/${name}.git`,
    sshUrl: overrides.sshUrl ?? `git@github.com:${ownerLogin}/${name}.git`,
    isPrivate: overrides.isPrivate ?? false,
    isFork: overrides.isFork ?? false,
    isArchived: overrides.isArchived ?? false,
    defaultBranch: overrides.defaultBranch ?? "main",
    primaryLanguage:
      overrides.primaryLanguage !== undefined
        ? overrides.primaryLanguage
        : { name: "TypeScript", color: "#3178c6" },
    stargazerCount: overrides.stargazerCount ?? 1420,
    forkCount: overrides.forkCount ?? 128,
    openIssuesCount: overrides.openIssuesCount ?? 12,
    topics: overrides.topics ?? ["ai-agent", "mcp", "typescript"],
    licenseSpdxId: overrides.licenseSpdxId !== undefined ? overrides.licenseSpdxId : "Apache-2.0",
    pushedAt: overrides.pushedAt !== undefined ? overrides.pushedAt : "2026-11-15T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-11-16T10:00:00.000Z",
  };
}

function makeBot(id: string, name: string): Bot {
  return {
    id,
    spaceId: "space-1",
    name,
    title: "",
    description: "Code reviewer bot",
    instructions: "",
    color: "blue",
    notifyOnFinish: true,
    pinned: false,
    sectionId: null,
    archivedAt: null,
    unread: false,
    parentBotId: null,
    memoryScope: "isolated",
    threadId: `thread-${id}`,
    preview: "",
    status: "idle",
    runErrorId: null,
    computerMode: "team",
    updatedAt: "2026-11-18T00:00:00.000Z",
    createdAt: "2026-11-01T00:00:00.000Z",
    voiceId: null,
    autoSpeak: false,
    modelProvider: null,
    modelId: null,
    thinkingLevel: null,
    teamChatAmbientEnabled: false,
    teamChatRules: "",
    fleetManagement: true,
    disabledBuiltinTools: [],
    webhookConfigured: false,
    spawnKey: null,
  };
}

let queryClient: QueryClient;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.clear();
  githubRpc.listMyRepos.mockReset();
  githubRpc.searchRepos.mockReset();
  githubRpc.repoDetail.mockReset();

  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="current-pathname">{location.pathname}</output>;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderWithProviders(
  ui: ReactNode,
  options: { initialPath?: string; allowRemoteImages?: boolean } = {},
) {
  const { initialPath = "/app/github", allowRemoteImages = false } = options;
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <RemoteImagesContext.Provider value={allowRemoteImages}>
          <MemoryRouter initialEntries={[initialPath]}>
            {ui}
            <LocationProbe />
          </MemoryRouter>
        </RemoteImagesContext.Provider>
      </QueryClientProvider>,
    );
  });
  await settle();
}

async function setInputValue(element: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

async function setSelectValue(element: HTMLSelectElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

async function clickElement(element: HTMLElement) {
  await act(async () => {
    element.click();
  });
  await settle();
}

function findButtonByText(labelSubstring: string): HTMLButtonElement {
  const match = [...container.querySelectorAll("button")].find((btn) =>
    btn.textContent?.includes(labelSubstring),
  );
  if (!match) {
    throw new Error(`Button containing "${labelSubstring}" not found`);
  }
  return match;
}

describe("GithubRepoList", () => {
  it("renders disconnected empty state and invokes onRequestConnect", async () => {
    const onRequestConnect = vi.fn();
    await renderWithProviders(
      <GithubRepoList
        connected={false}
        hidePrivate={false}
        selectedRepo={null}
        onSelectRepo={vi.fn()}
        onRequestConnect={onRequestConnect}
      />,
    );

    expect(container.querySelector('[data-testid="github-repo-list-disconnected"]')).not.toBeNull();
    expect(githubRpc.listMyRepos).not.toHaveBeenCalled();

    await act(async () => {
      findButtonByText("连接 GitHub 账号").click();
    });
    expect(onRequestConnect).toHaveBeenCalledTimes(1);
  });

  it("loads connected repo cards, updates search/affiliation/sort queries, and selects a repo", async () => {
    const publicRepo = makeRepoSummary({
      id: "r-pub",
      ownerLogin: "alice",
      name: "public-kit",
      fullName: "alice/public-kit",
      isPrivate: false,
      stargazerCount: 350,
    });
    const privateRepo = makeRepoSummary({
      id: "r-priv",
      ownerLogin: "alice",
      name: "secret-vault",
      fullName: "alice/secret-vault",
      isPrivate: true,
      stargazerCount: 8,
    });

    const pageResponse: GithubRepoPage = {
      items: [publicRepo, privateRepo],
      page: 1,
      perPage: 24,
      hasNextPage: false,
      totalCount: 2,
      rateLimit: { limit: 5000, remaining: 4988, resetAt: null },
    };
    githubRpc.listMyRepos.mockResolvedValue(pageResponse);

    const onSelectRepo = vi.fn();
    await renderWithProviders(
      <GithubRepoList
        connected={true}
        hidePrivate={false}
        selectedRepo={{ owner: "alice", repo: "public-kit" }}
        onSelectRepo={onSelectRepo}
        onRequestConnect={vi.fn()}
      />,
    );

    await vi.waitFor(() => {
      expect(container.textContent).toContain("alice/public-kit");
      expect(container.textContent).toContain("alice/secret-vault");
    });

    expect(githubRpc.listMyRepos).toHaveBeenCalledWith(
      expect.objectContaining({
        affiliation: "all",
        visibility: "all",
        sort: "pushed",
        page: 1,
        perPage: 24,
      }),
      expect.anything(),
    );

    const selectedCard = container.querySelector('[data-testid="repo-card-alice/public-kit"]');
    expect(selectedCard?.getAttribute("data-selected")).toBe("true");

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="repo-card-alice/secret-vault"]')?.click();
    });
    expect(onSelectRepo).toHaveBeenCalledWith({
      owner: "alice",
      repo: "secret-vault",
      summary: privateRepo,
    });

    // Affiliation filter -> owner
    await clickElement(findButtonByText("我创建的"));
    expect(githubRpc.listMyRepos).toHaveBeenLastCalledWith(
      expect.objectContaining({ affiliation: "owner", page: 1 }),
      expect.anything(),
    );

    // Sort selector -> stars
    const sortSelect = container.querySelector<HTMLSelectElement>('select[aria-label="仓库排序"]')!;
    await setSelectValue(sortSelect, "stars");
    expect(githubRpc.listMyRepos).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "stars", page: 1 }),
      expect.anything(),
    );

    // Search input + form submit
    const searchInput = container.querySelector<HTMLInputElement>(
      'input[name="github-my-repos-search"]',
    )!;
    await setInputValue(searchInput, "vault");
    await act(async () => {
      searchInput.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true }));
    });
    await settle();
    expect(githubRpc.listMyRepos).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: "vault", page: 1 }),
      expect.anything(),
    );
  });

  it("disables private filter, downgrades private visibility to public, and hides private cards when hidePrivate is true", async () => {
    const publicRepo = makeRepoSummary({
      id: "r-pub",
      ownerLogin: "alice",
      name: "open-sdk",
      fullName: "alice/open-sdk",
      isPrivate: false,
    });
    const privateRepo = makeRepoSummary({
      id: "r-priv",
      ownerLogin: "alice",
      name: "private-notes",
      fullName: "alice/private-notes",
      isPrivate: true,
    });

    githubRpc.listMyRepos.mockResolvedValue({
      items: [publicRepo, privateRepo],
      page: 1,
      perPage: 24,
      hasNextPage: false,
      totalCount: 2,
      rateLimit: null,
    } satisfies GithubRepoPage);

    function PrivacyToggleHarness() {
      const [hidePrivate, setHidePrivate] = useState(false);
      return (
        <div>
          <button
            type="button"
            data-testid="toggle-hide-private"
            onClick={() => setHidePrivate((prev) => !prev)}
          >
            TogglePrivacy
          </button>
          <GithubRepoList
            connected={true}
            hidePrivate={hidePrivate}
            selectedRepo={null}
            onSelectRepo={vi.fn()}
            onRequestConnect={vi.fn()}
          />
        </div>
      );
    }

    await renderWithProviders(<PrivacyToggleHarness />);
    await vi.waitFor(() => {
      expect(container.textContent).toContain("alice/private-notes");
    });

    // Switch visibility to "private" while hidePrivate is false
    const privateFilterBtn = [...container.querySelectorAll("button")].find(
      (btn) => btn.textContent?.trim() === "私有",
    )!;
    expect(privateFilterBtn.disabled).toBe(false);
    await clickElement(privateFilterBtn);
    expect(githubRpc.listMyRepos).toHaveBeenLastCalledWith(
      expect.objectContaining({ visibility: "private" }),
      expect.anything(),
    );

    // Now turn hidePrivate ON -> effective visibility becomes "public", private pill disabled, private cards hidden
    await clickElement(
      container.querySelector<HTMLButtonElement>('[data-testid="toggle-hide-private"]')!,
    );

    expect(githubRpc.listMyRepos).toHaveBeenLastCalledWith(
      expect.objectContaining({ visibility: "public", page: 1 }),
      expect.anything(),
    );

    const updatedPrivateBtn = [...container.querySelectorAll("button")].find(
      (btn) => btn.textContent?.trim() === "私有",
    )!;
    expect(updatedPrivateBtn.disabled).toBe(true);
    expect(container.querySelector('[data-testid="private-repos-hidden-hint"]')).not.toBeNull();
    expect(container.textContent).toContain("alice/open-sdk");
    expect(container.textContent).not.toContain("alice/private-notes");
  });
});

describe("GithubExploreSearch", () => {
  it("shows anonymous quota banner when disconnected, updates language/minStars/sort filters, and calls onSelectRepo", async () => {
    const rustRepo = makeRepoSummary({
      id: "oss-1",
      ownerLogin: "tokio-rs",
      name: "tokio",
      fullName: "tokio-rs/tokio",
      primaryLanguage: { name: "Rust", color: "#dea584" },
      stargazerCount: 28400,
      licenseSpdxId: "MIT",
    });

    const searchOutput: GithubSearchReposOutput = {
      items: [rustRepo],
      totalCount: 1,
      incompleteResults: false,
      authenticated: false,
      effectiveQuery: "stars:>=1000 language:Rust",
      page: 1,
      perPage: 20,
      hasNextPage: false,
      rateLimit: { limit: 10, remaining: 9, resetAt: null },
    };
    githubRpc.searchRepos.mockResolvedValue(searchOutput);

    const onRequestConnect = vi.fn();
    const onSelectRepo = vi.fn();

    await renderWithProviders(
      <GithubExploreSearch
        connected={false}
        selectedRepo={null}
        onSelectRepo={onSelectRepo}
        onRequestConnect={onRequestConnect}
      />,
      { allowRemoteImages: false },
    );

    // Anonymous banner shown & connect button works
    const banner = container.querySelector('[data-testid="github-explore-anonymous-banner"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("当前使用 GitHub 公开匿名检索配额");

    await act(async () => {
      findButtonByText("连接 GitHub").click();
    });
    expect(onRequestConnect).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => {
      expect(container.textContent).toContain("tokio-rs/tokio");
    });

    // RemoteImagesContext=false -> initial fallback rendered instead of external <img>
    const exploreCard = container.querySelector('[data-testid="explore-card-tokio-rs/tokio"]')!;
    expect(exploreCard.querySelector("img")).toBeNull();
    expect(exploreCard.textContent).toContain("T");

    // Language filter -> Rust
    await clickElement(findButtonByText("Rust"));
    expect(githubRpc.searchRepos).toHaveBeenLastCalledWith(
      expect.objectContaining({ language: "Rust", page: 1 }),
      expect.anything(),
    );

    // Min stars filter -> 1k+
    await clickElement(findButtonByText("1k+"));
    expect(githubRpc.searchRepos).toHaveBeenLastCalledWith(
      expect.objectContaining({ language: "Rust", minStars: 1000, page: 1 }),
      expect.anything(),
    );

    // Sort selector -> stars
    const sortSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="开源搜索排序"]',
    )!;
    await setSelectValue(sortSelect, "stars");
    expect(githubRpc.searchRepos).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "stars", page: 1 }),
      expect.anything(),
    );

    // Clicking result card -> onSelectRepo
    const latestExploreCard = container.querySelector<HTMLButtonElement>(
      '[data-testid="explore-card-tokio-rs/tokio"]',
    )!;
    await clickElement(latestExploreCard);
    expect(onSelectRepo).toHaveBeenCalledWith({
      owner: "tokio-rs",
      repo: "tokio",
      summary: rustRepo,
    });
  });
});

describe("GithubRepoDrawer", () => {
  it("renders untrusted README safely without executing scripts, displays commits/releases & owner webhook hint, and hands off prompt to Bot composer draft", async () => {
    const ownedRepo = makeRepoSummary({
      ownerLogin: "sydney-dev",
      name: "personal-agent",
      fullName: "sydney-dev/personal-agent",
      description: "Privacy-first personal AI workbench",
      primaryLanguage: { name: "TypeScript", color: "#3178c6" },
    });

    const maliciousReadme = [
      "# Sydney Personal Agent",
      "",
      "<script>alert(1)</script>",
      '<img src="x" onerror="alert(2)" />',
      "",
      "- Safe [Documentation](https://docs.example.com/guide) link",
      "- Blocked [XSS Link](javascript:alert(3)) payload",
      "",
      "```ts",
      "const safe = true;",
      "```",
    ].join("\n");

    const detailResponse: GithubRepoDetail = {
      repo: ownedRepo,
      readme: {
        path: "README.md",
        content: maliciousReadme,
        truncated: true,
      },
      recentCommits: [
        {
          sha: "9f8e7d6c5b4a3210",
          shortSha: "9f8e7d6",
          message: "feat(github): add repo inspector drawer\n\nDetailed commit body",
          authorName: "Sydney Dev",
          authorLogin: "sydney-dev",
          committedAt: "2026-11-18T06:00:00.000Z",
          htmlUrl: "https://github.com/sydney-dev/personal-agent/commit/9f8e7d6c5b4a3210",
        },
      ],
      latestRelease: {
        tagName: "v0.9.0",
        name: "Sydney 0.9 Preview",
        publishedAt: "2026-11-17T12:00:00.000Z",
        prerelease: false,
        body: "## Highlights\n- Added GitHub module",
        truncated: false,
        htmlUrl: "https://github.com/sydney-dev/personal-agent/releases/tag/v0.9.0",
      },
      isViewerOwner: true,
      rateLimit: { limit: 5000, remaining: 4990, resetAt: null },
    };

    githubRpc.repoDetail.mockResolvedValue(detailResponse);

    const botAlpha = makeBot("bot-alpha", "ArchitectBot");
    const botBeta = makeBot("bot-beta", "ReviewerBot");
    writeComposerDraft("bot:bot-beta", "Existing note:");

    const onClose = vi.fn();
    const target: SelectedGithubRepo = {
      owner: "sydney-dev",
      repo: "personal-agent",
      summary: ownedRepo,
    };

    await renderWithProviders(
      <GithubRepoDrawer
        target={target}
        connected={true}
        viewerLogin="sydney-dev"
        bots={[botAlpha, botBeta]}
        onClose={onClose}
      />,
    );

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="repo-drawer-readme"]')).not.toBeNull();
    });

    const readmeContainer = container.querySelector('[data-testid="repo-drawer-readme"]')!;
    // Strictly zero executable <script> or untrusted <img> elements
    expect(readmeContainer.querySelectorAll("script")).toHaveLength(0);
    expect(readmeContainer.querySelectorAll("img")).toHaveLength(0);
    // Raw <script>alert(1)</script> rendered purely as inert text
    expect(readmeContainer.textContent).toContain("<script>alert(1)</script>");
    // Safe https link allowed, javascript: link stripped to inert text
    const links = [...readmeContainer.querySelectorAll("a")];
    expect(links.some((a) => a.getAttribute("href") === "https://docs.example.com/guide")).toBe(
      true,
    );
    expect(
      links.some((a) => (a.getAttribute("href") ?? "").toLowerCase().startsWith("javascript:")),
    ).toBe(false);
    expect(readmeContainer.textContent).toContain("XSS Link");

    // Switch to Recent Commits sub-tab
    await act(async () => {
      findButtonByText("近期提交").click();
    });
    const commitsSection = container.querySelector('[data-testid="repo-drawer-commits"]')!;
    expect(commitsSection.textContent).toContain("9f8e7d6");
    expect(commitsSection.textContent).toContain("feat(github): add repo inspector drawer");
    expect(commitsSection.textContent).not.toContain("Detailed commit body");

    // Switch to Releases & Webhook sub-tab -> verifies release + owner webhook helper
    await act(async () => {
      findButtonByText("版本与联动").click();
    });
    const releasesSection = container.querySelector('[data-testid="repo-drawer-releases"]')!;
    expect(releasesSection.textContent).toContain("v0.9.0");
    expect(releasesSection.textContent).toContain("Sydney 0.9 Preview");

    const webhookHelper = container.querySelector('[data-testid="repo-webhook-helper"]');
    expect(webhookHelper).not.toBeNull();
    expect(webhookHelper?.textContent).toContain("/api/v1/bots/<botId>/github");
    expect(webhookHelper?.textContent).toContain("/api/v1/bots/bot-alpha/github");

    // Select bot-beta & "总结近期提交与演进", then click "交给 Bot 分析"
    const botSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="选择分析 Bot"]',
    )!;
    await setSelectValue(botSelect, "bot-beta");

    const templateSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="选择分析模板"]',
    )!;
    await setSelectValue(templateSelect, "commits");

    const handoffButton = container
      .querySelector('[data-testid="repo-bot-handoff"]')!
      .querySelector("button")!;
    await act(async () => {
      handoffButton.click();
    });

    const savedDraft = window.localStorage.getItem(`${COMPOSER_DRAFT_STORAGE_PREFIX}bot:bot-beta`);
    expect(savedDraft).not.toBeNull();
    expect(readComposerDraft("bot:bot-beta")).toContain("Existing note:");
    expect(readComposerDraft("bot:bot-beta")).toContain("sydney-dev/personal-agent");
    expect(readComposerDraft("bot:bot-beta")).toContain(
      "https://github.com/sydney-dev/personal-agent",
    );
    expect(readComposerDraft("bot:bot-beta")).toContain("github_read_repo");
    expect(readComposerDraft("bot:bot-beta")).toContain("近期提交与演进");

    expect(container.querySelector('[data-testid="current-pathname"]')?.textContent).toBe(
      "/app/bot-beta",
    );

    // Escape key invokes onClose
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows empty-bots guidance link to /app when no bots exist in space", async () => {
    const repo = makeRepoSummary({ ownerLogin: "octocat", name: "hello-world" });
    githubRpc.repoDetail.mockResolvedValue({
      repo,
      readme: null,
      recentCommits: [],
      latestRelease: null,
      isViewerOwner: false,
      rateLimit: null,
    } satisfies GithubRepoDetail);

    await renderWithProviders(
      <GithubRepoDrawer
        target={{ owner: "octocat", repo: "hello-world", summary: repo }}
        connected={false}
        viewerLogin={null}
        bots={[]}
        onClose={vi.fn()}
      />,
    );

    await vi.waitFor(() => {
      expect(container.textContent).toContain("该仓库暂无 README");
    });

    const handoffSection = container.querySelector('[data-testid="repo-bot-handoff"]')!;
    expect(handoffSection.textContent).toContain("当前空间暂无可用 Bot，请先返回首页创建 Bot");
    const homeLink = handoffSection.querySelector('a[href="/app"]');
    expect(homeLink).not.toBeNull();
  });
});
