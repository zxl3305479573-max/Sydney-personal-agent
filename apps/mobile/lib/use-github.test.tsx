// @vitest-environment jsdom
import type { GithubRepoDetail, GithubRepoSummary } from "@rakazo/contracts";
import type { EffectCallback } from "react";
import { act, useEffect } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  scope: "server-user-space-a",
  focused: true,
  pending: false,
  rpc: vi.fn(),
  capture: vi.fn(),
  readConnection: vi.fn(),
  writeConnection: vi.fn(),
}));

vi.mock("expo-router", () => ({
  useFocusEffect: (callback: EffectCallback) => {
    useEffect(() => (runtime.focused ? callback() : undefined), [callback, runtime.focused]);
  },
}));
vi.mock("./api", () => ({
  captureApiRequestContext: runtime.capture,
  isSpaceSelectionPending: () => runtime.pending,
  rpc: runtime.rpc,
}));
vi.mock("./project-scope", () => ({ projectScopeKey: () => runtime.scope }));
vi.mock("./integrations-cache", () => ({
  persistedIntegrationsCacheScope: async () => ({ userId: "user-a" }),
  integrationsCacheScope: async () => ({ userId: "user-a" }),
  readGithubConnectionCache: runtime.readConnection,
  writeGithubConnectionCache: runtime.writeConnection,
}));
vi.mock("./user-error", () => ({ errorText: (error: Error) => error.message }));

import { useGithub } from "./use-github";

const repo = {
  id: "repo-1",
  name: "agent",
  ownerLogin: "example",
  fullName: "example/agent",
  isPrivate: false,
} as GithubRepoSummary;
const connected = { status: "connected", login: "example", highRiskScopes: [] };
const repoPage = { items: [repo], page: 1, hasNextPage: false };
const overview = { profile: { login: "example" } };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("mobile GitHub requests", () => {
  let root: Root;
  let state: ReturnType<typeof useGithub>;
  const context = { apiBase: "https://example.test", headers: { "x-rakazo-space-id": "space-a" } };

  function Probe() {
    state = useGithub(runtime.scope);
    return null;
  }

  async function render() {
    await act(async () => root.render(<Probe key={runtime.scope} />));
  }

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    runtime.scope = "server-user-space-a";
    runtime.focused = true;
    runtime.pending = false;
    runtime.capture.mockReset().mockResolvedValue(context);
    runtime.readConnection.mockReset().mockReturnValue(null);
    runtime.writeConnection.mockReset();
    runtime.rpc.mockReset().mockImplementation(async (procedure: string) => {
      if (procedure === "github/status") return { status: "disconnected" };
      if (procedure === "github/profileOverview") return overview;
      if (procedure === "github/repoDetail") return { repo, readme: null };
      return repoPage;
    });
    root = createRoot(document.createElement("div"));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  it("allows disconnected public search and pins it to the captured server and space", async () => {
    await render();
    await act(async () => state.selectSection("explore"));
    await act(async () => state.setQuery("  agent  "));
    expect(runtime.rpc).toHaveBeenLastCalledWith(
      "github/searchRepos",
      { query: "agent", page: 1, perPage: 20, sort: "best-match" },
      expect.objectContaining({ requestContext: context, skipSpaceAuthRecovery: true }),
    );
    expect(state.search?.items).toEqual([repo]);
    expect(state.status?.status).toBe("disconnected");
  });

  it("validates PATs before sending and refreshes connection state after connect and disconnect", async () => {
    let isConnected = false;
    runtime.rpc.mockImplementation(async (procedure: string) => {
      if (procedure === "github/connect") {
        isConnected = true;
        return connected;
      }
      if (procedure === "github/disconnect") {
        isConnected = false;
        return { status: "disconnected" };
      }
      if (procedure === "github/status")
        return isConnected ? connected : { status: "disconnected" };
      return overview;
    });
    await render();
    await act(async () => state.connect("bad"));
    expect(runtime.rpc.mock.calls.some(([method]) => method === "github/connect")).toBe(false);
    expect(state.error).toContain("Personal Access Token");
    await act(async () => state.connect("  test-read-only-token  "));
    expect(runtime.rpc).toHaveBeenCalledWith(
      "github/connect",
      { token: "test-read-only-token" },
      expect.objectContaining({ requestContext: context }),
    );
    expect(state.status?.status).toBe("connected");
    expect(state.overview).toEqual(overview);
    await act(async () => state.disconnect());
    expect(state.status?.status).toBe("disconnected");
    expect(state.overview).toBeNull();
    expect(state.repositories).toBeNull();
  });

  it("does not issue a write after the server or account changed during context capture", async () => {
    await render();
    const waiting = deferred<typeof context>();
    runtime.capture.mockReturnValueOnce(waiting.promise);
    let connecting: Promise<void>;
    await act(async () => {
      connecting = state.connect("test-read-only-token");
    });
    runtime.scope = "server-user-space-b";
    await act(async () => {
      waiting.resolve(context);
      await connecting!;
    });
    expect(runtime.rpc.mock.calls.some(([method]) => method === "github/connect")).toBe(false);
  });

  it("discards a previous account's response after a scope change", async () => {
    const waiting = deferred<typeof connected>();
    runtime.rpc.mockReturnValueOnce(waiting.promise);
    await render();
    runtime.scope = "server-user-space-b";
    await render();
    await act(async () => waiting.resolve(connected));
    expect(state.status?.status).toBe("disconnected");
    expect(state.overview).toBeNull();
  });

  it("uses the scoped saved connection while the server refreshes", async () => {
    const waiting = deferred<{ status: "disconnected" }>();
    runtime.readConnection.mockReturnValueOnce(connected);
    runtime.rpc.mockReturnValueOnce(waiting.promise);
    await render();
    expect(state.status).toEqual(connected);
    await act(async () => waiting.resolve({ status: "disconnected" }));
    expect(state.status?.status).toBe("disconnected");
    expect(runtime.writeConnection).toHaveBeenCalledWith(
      { userId: "user-a" },
      { status: "disconnected" },
    );
  });

  it("cancels the read and ignores its late result after the route loses focus", async () => {
    const waiting = deferred<typeof connected>();
    runtime.rpc.mockReturnValueOnce(waiting.promise);
    await render();
    const options = runtime.rpc.mock.calls[0]![2];
    runtime.focused = false;
    await render();
    expect(options.signal.aborted).toBe(true);
    await act(async () => waiting.resolve(connected));
    expect(state.status).toBeNull();
  });

  it("hides private cards immediately and closes a private detail when privacy is enabled", async () => {
    const privateRepo = { ...repo, id: "private", name: "private", isPrivate: true };
    runtime.rpc.mockImplementation(async (procedure: string) => {
      if (procedure === "github/status") return connected;
      if (procedure === "github/repoDetail") return { repo: privateRepo };
      return { ...repoPage, items: [repo, privateRepo] };
    });
    await render();
    await act(async () => state.selectSection("repositories"));
    expect(state.visible(state.repositories!.items)).toHaveLength(2);
    await act(async () => state.selectRepo(privateRepo));
    expect(state.detail?.repo.isPrivate).toBe(true);
    await act(async () => state.setHidePrivate(true));
    expect(state.selectedRepo).toBeNull();
    expect(state.detail).toBeNull();
    expect(state.visible(state.repositories!.items)).toEqual([repo]);
    expect(runtime.rpc).toHaveBeenLastCalledWith(
      "github/listMyRepos",
      expect.objectContaining({ visibility: "public" }),
      expect.anything(),
    );
  });

  it("clears cached private repositories when the server reports a revoked connection", async () => {
    let valid = true;
    runtime.rpc.mockImplementation(async (procedure: string) => {
      if (procedure === "github/status")
        return valid ? connected : { status: "invalid", message: "Token revoked" };
      return repoPage;
    });
    await render();
    await act(async () => state.selectSection("repositories"));
    expect(state.repositories?.items).toHaveLength(1);
    valid = false;
    await act(async () => state.refresh());
    expect(state.status?.status).toBe("invalid");
    expect(state.repositories).toBeNull();
  });

  it("does not let an older repository preview replace the current one", async () => {
    const waiting = deferred<GithubRepoDetail>();
    runtime.rpc.mockImplementation(async (procedure: string, input?: { repo?: string }) => {
      if (procedure === "github/status") return connected;
      if (procedure === "github/repoDetail")
        return input?.repo === "agent" ? waiting.promise : { repo: { ...repo, name: "next" } };
      return overview;
    });
    await render();
    await act(async () => state.selectRepo(repo));
    await act(async () => state.selectRepo({ ...repo, name: "next" }));
    await act(async () => waiting.resolve({ repo } as GithubRepoDetail));
    expect(state.detail?.repo.name).toBe("next");
  });

  it("reports read failures and retries without creating or disconnecting an account", async () => {
    runtime.rpc.mockRejectedValueOnce(new Error("Network unavailable"));
    await render();
    expect(state.error).toBe("Network unavailable");
    await act(async () => state.refresh());
    expect(state.error).toBeNull();
    expect(state.status?.status).toBe("disconnected");
    expect(runtime.rpc.mock.calls.every(([method]) => method === "github/status")).toBe(true);
  });

  it("retains the current results during background reads and tracks pulls separately", async () => {
    const filtered = deferred<typeof repoPage>();
    const pulled = deferred<typeof repoPage>();
    const filteredPage = { ...repoPage, items: [] };
    runtime.rpc.mockImplementation(async (procedure: string) =>
      procedure === "github/status" ? connected : repoPage,
    );
    await render();
    await act(async () => state.selectSection("repositories"));
    runtime.rpc
      .mockResolvedValueOnce(connected)
      .mockReturnValueOnce(filtered.promise)
      .mockResolvedValueOnce(connected)
      .mockReturnValueOnce(pulled.promise);

    await act(async () => state.filterRepositories({ language: "TypeScript" }));
    expect(state.loading).toBe(true);
    expect(state.refreshing).toBe(false);
    expect(state.repositories).toEqual(repoPage);
    await act(async () => filtered.resolve(filteredPage));
    expect(state.repositories).toEqual(filteredPage);

    await act(async () => state.pullToRefresh());
    expect(state.refreshing).toBe(true);
    expect(state.repositories).toEqual(filteredPage);
    await act(async () => pulled.resolve(repoPage));
    expect(state.refreshing).toBe(false);
    expect(state.repositories).toEqual(repoPage);
  });

  it("applies repository and public-search filters and resets pagination", async () => {
    runtime.rpc.mockImplementation(async (procedure: string) =>
      procedure === "github/status" ? connected : repoPage,
    );
    await render();
    await act(async () => state.selectSection("repositories"));
    await act(async () => state.selectPage(3));
    await act(async () =>
      state.filterRepositories({
        affiliation: "owner",
        visibility: "private",
        language: "TypeScript",
        sort: "stars",
      }),
    );
    expect(state.page).toBe(1);
    expect(runtime.rpc).toHaveBeenLastCalledWith(
      "github/listMyRepos",
      expect.objectContaining({
        affiliation: "owner",
        visibility: "private",
        language: "TypeScript",
        sort: "stars",
        page: 1,
      }),
      expect.anything(),
    );
    await act(async () => state.selectSection("explore"));
    await act(async () =>
      state.filterExplore({
        minStars: 1000,
        language: "Rust",
        topic: "cli",
        pushedWithinDays: 30,
        sort: "updated",
      }),
    );
    expect(runtime.rpc).toHaveBeenLastCalledWith(
      "github/searchRepos",
      expect.objectContaining({
        minStars: 1000,
        language: "Rust",
        topic: "cli",
        pushedWithinDays: 30,
        sort: "updated",
        page: 1,
      }),
      expect.anything(),
    );
  });
});
