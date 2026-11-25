import type {
  GithubConnectionStatus,
  GithubListMyReposInput,
  GithubProfileOverview,
  GithubRepoDetail,
  GithubRepoPage,
  GithubRepoSummary,
  GithubSearchReposInput,
  GithubSearchReposOutput,
} from "@rakazo/contracts";
import { GithubConnectInputSchema } from "@rakazo/contracts";
import { isRetryableError } from "@rakazo/core";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { captureApiRequestContext, isSpaceSelectionPending, rpc } from "./api";
import {
  integrationsCacheScope,
  persistedIntegrationsCacheScope,
  readGithubConnectionCache,
  writeGithubConnectionCache,
} from "./integrations-cache";
import { clearPageState, usePageState } from "./page-state";
import { projectScopeKey } from "./project-scope";
import { queryClient } from "./query";
import { errorText } from "./user-error";

export type GithubSection = "profile" | "repositories" | "explore";
export type GithubRepositoryFilters = Pick<
  GithubListMyReposInput,
  "affiliation" | "visibility" | "sort" | "language"
>;
export type GithubExploreFilters = Pick<
  GithubSearchReposInput,
  "sort" | "language" | "minStars" | "pushedWithinDays" | "topic"
>;

type GithubHomeSnapshot = {
  status: GithubConnectionStatus;
  overview: GithubProfileOverview | null;
};

function mergeRepos(
  existing: GithubRepoSummary[],
  incoming: GithubRepoSummary[],
): GithubRepoSummary[] {
  const seen = new Set(existing.map((repo) => repo.id));
  const merged = [...existing];
  for (const repo of incoming) {
    if (!seen.has(repo.id)) {
      seen.add(repo.id);
      merged.push(repo);
    }
  }
  return merged;
}

export function rememberGithubRepoPreview(scopeKey: string, repo: GithubRepoSummary) {
  queryClient.setQueryData(["github-repo-preview", scopeKey, repo.ownerLogin, repo.name], repo);
}

export function readGithubRepoPreview(
  scopeKey: string,
  owner: string,
  name: string,
): GithubRepoSummary | null {
  return (
    queryClient.getQueryData<GithubRepoSummary>(["github-repo-preview", scopeKey, owner, name]) ??
    null
  );
}

export function useGithubRepoDetail(
  scopeKey: string,
  owner: string,
  name: string,
  isPrivate: boolean,
) {
  const homeKey = useMemo(() => ["github-home", scopeKey], [scopeKey]);
  const [detail, setDetail] = usePageState<GithubRepoDetail | null>(
    scopeKey,
    ["github-content", "detail", owner, name],
    null,
  );
  const [loading, setLoading] = useState(!detail);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const request = useRef(0);
  const pullRequested = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!owner || !name || isSpaceSelectionPending()) return;
      const controller = new AbortController();
      const issued = ++request.current;
      const current = () =>
        !controller.signal.aborted &&
        issued === request.current &&
        scopeKey === projectScopeKey() &&
        !isSpaceSelectionPending();
      setLoading(true);
      setRefreshing(pullRequested.current);
      pullRequested.current = false;
      setError(null);
      void (async () => {
        try {
          const requestContext = await captureApiRequestContext();
          if (!current()) return;
          const options = {
            requestContext,
            signal: controller.signal,
            skipSpaceAuthRecovery: true,
          };
          const connection = await rpc("github/status", {}, options);
          if (!current()) return;
          const previous = queryClient.getQueryData<GithubHomeSnapshot>(homeKey);
          const changedConnection =
            previous &&
            (previous.status.status !== connection.status ||
              (previous.status.status === "connected" &&
                connection.status === "connected" &&
                (previous.status.githubUserId !== connection.githubUserId ||
                  previous.status.connectedAt !== connection.connectedAt)));
          if (changedConnection) {
            clearPageState(scopeKey, ["github-content"]);
            setDetail(null);
          }
          if (isPrivate && connection.status !== "connected") {
            setDetail(null);
            return;
          }
          const result = await rpc("github/repoDetail", { owner, repo: name }, options);
          if (current()) setDetail(result);
        } catch (cause) {
          if (current()) {
            if (!isRetryableError(cause)) setDetail(null);
            setError(errorText(cause));
          }
        } finally {
          if (current()) {
            setLoading(false);
            setRefreshing(false);
          }
        }
      })();
      return () => {
        controller.abort();
      };
    }, [homeKey, scopeKey, owner, name, isPrivate, revision]),
  );

  return {
    detail,
    loading,
    refreshing,
    error,
    refresh: () => setRevision((value) => value + 1),
    pullToRefresh: () => {
      pullRequested.current = true;
      setRefreshing(true);
      setRevision((value) => value + 1);
    },
  };
}

export function useGithub(scopeKey: string) {
  const homeKey = useMemo(() => ["github-home", scopeKey], [scopeKey]);
  const [section, setSection] = usePageState<GithubSection>(
    scopeKey,
    ["github-view", "section"],
    "profile",
  );
  const [status, setStatus] = useState<GithubConnectionStatus | null>(
    () => queryClient.getQueryData<GithubHomeSnapshot>(homeKey)?.status ?? null,
  );
  const [selectedRepo, setSelectedRepo] = usePageState<GithubRepoSummary | null>(
    scopeKey,
    ["github-view", "selectedRepo"],
    null,
  );
  const [year, setYear] = usePageState<number | undefined>(
    scopeKey,
    ["github-view", "year"],
    undefined,
  );
  const [query, setQuery] = usePageState(scopeKey, ["github-view", "query"], "");
  const [page, setPage] = usePageState(scopeKey, ["github-view", "page"], 1);
  const [hidePrivate, setHidePrivateValue] = usePageState(
    scopeKey,
    ["github-view", "hidePrivate"],
    false,
  );
  const [repositoryFilters, setRepositoryFilters] = usePageState<GithubRepositoryFilters>(
    scopeKey,
    ["github-view", "repositoryFilters"],
    {
      affiliation: "all",
      visibility: "all",
      sort: "pushed",
    },
  );
  const [exploreFilters, setExploreFilters] = usePageState<GithubExploreFilters>(
    scopeKey,
    ["github-view", "exploreFilters"],
    {
      sort: "best-match",
    },
  );
  const [overview, setOverview] = usePageState<GithubProfileOverview | null>(
    scopeKey,
    ["github-content", "profile", year],
    year === undefined
      ? (queryClient.getQueryData<GithubHomeSnapshot>(homeKey)?.overview ?? null)
      : null,
    true,
  );
  const [repositories, setRepositories] = usePageState<GithubRepoPage | null>(
    scopeKey,
    ["github-content", "repositories", query, page, hidePrivate, repositoryFilters],
    null,
    true,
  );
  const [search, setSearch] = usePageState<GithubSearchReposOutput | null>(
    scopeKey,
    ["github-content", "explore", query, page, hidePrivate, exploreFilters],
    null,
    true,
  );
  const [detail, setDetail] = usePageState<GithubRepoDetail | null>(
    scopeKey,
    ["github-content", "detail", selectedRepo?.ownerLogin, selectedRepo?.name],
    null,
  );
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const focused = useRef(false);
  const request = useRef(0);
  const mutation = useRef(false);
  const pullRequested = useRef(false);
  const loadMoreInFlight = useRef(false);
  const inScope = () => scopeKey === projectScopeKey() && !isSpaceSelectionPending();
  const live = () => focused.current && inScope();

  useFocusEffect(
    useCallback(() => {
      if (isSpaceSelectionPending()) return;
      focused.current = true;
      const controller = new AbortController();
      const issued = ++request.current;
      const current = () =>
        !controller.signal.aborted &&
        issued === request.current &&
        scopeKey === projectScopeKey() &&
        !isSpaceSelectionPending();
      setLoading(true);
      setRefreshing(pullRequested.current);
      pullRequested.current = false;
      setBusy(mutation.current);
      setError(null);
      void (async () => {
        try {
          const cachedScope = await persistedIntegrationsCacheScope();
          if (!current()) return;
          if (cachedScope) {
            const cached = readGithubConnectionCache(cachedScope);
            if (cached) setStatus((previous) => previous ?? cached);
          }
          const requestContext = await captureApiRequestContext();
          if (!current()) return;
          const options = {
            requestContext,
            signal: controller.signal,
            skipSpaceAuthRecovery: true,
          };
          const connection = await rpc("github/status", {}, options);
          if (!current()) return;
          const previous = queryClient.getQueryData<GithubHomeSnapshot>(homeKey);
          const changedConnection =
            previous &&
            (previous.status.status !== connection.status ||
              (previous.status.status === "connected" &&
                connection.status === "connected" &&
                (previous.status.githubUserId !== connection.githubUserId ||
                  previous.status.connectedAt !== connection.connectedAt)));
          const clearPersonalData =
            connection.status !== "connected" ||
            (previous?.status.status === "connected" &&
              (previous.status.githubUserId !== connection.githubUserId ||
                previous.status.connectedAt !== connection.connectedAt));
          queryClient.setQueryData<GithubHomeSnapshot>(homeKey, {
            status: connection,
            overview: clearPersonalData ? null : (previous?.overview ?? null),
          });
          setStatus(connection);
          if (changedConnection) {
            clearPageState(scopeKey, ["github-content"]);
            setOverview(null);
            setRepositories(null);
            setSearch(null);
            setDetail(null);
            setSelectedRepo(null);
          }
          if (cachedScope) {
            writeGithubConnectionCache(cachedScope, connection);
          } else {
            void integrationsCacheScope()
              .then((scope) => {
                if (current()) writeGithubConnectionCache(scope, connection);
              })
              .catch(() => undefined);
          }
          if (clearPersonalData) {
            setOverview(null);
            setRepositories(null);
            if (selectedRepo?.isPrivate) {
              setDetail(null);
              setSelectedRepo(null);
              return;
            }
          }
          if (changedConnection && selectedRepo) return;
          if (selectedRepo) {
            const result = await rpc(
              "github/repoDetail",
              { owner: selectedRepo.ownerLogin, repo: selectedRepo.name },
              options,
            );
            if (current()) setDetail(result);
          } else if (section === "explore") {
            const result = await rpc(
              "github/searchRepos",
              { ...exploreFilters, query, page, perPage: 20 },
              options,
            );
            if (current()) setSearch(result);
          } else if (connection.status === "connected" && section === "profile") {
            const result = await rpc("github/profileOverview", { year }, options);
            if (!current()) return;
            if (year === undefined) {
              queryClient.setQueryData<GithubHomeSnapshot>(homeKey, {
                status: connection,
                overview: result,
              });
            }
            setOverview(result);
          } else if (connection.status === "connected") {
            const result = await rpc(
              "github/listMyRepos",
              {
                query,
                page,
                perPage: 24,
                ...repositoryFilters,
                visibility: hidePrivate ? "public" : repositoryFilters.visibility,
              },
              options,
            );
            if (current()) setRepositories(result);
          }
        } catch (cause) {
          if (current()) {
            if (selectedRepo && !isRetryableError(cause)) setDetail(null);
            setError(errorText(cause));
          }
        } finally {
          if (current()) {
            setLoading(false);
            setRefreshing(false);
          }
        }
      })();
      return () => {
        focused.current = false;
        controller.abort();
      };
    }, [
      homeKey,
      scopeKey,
      section,
      selectedRepo,
      year,
      query,
      page,
      hidePrivate,
      repositoryFilters,
      exploreFilters,
      revision,
    ]),
  );

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || loadMoreInFlight.current || !live()) return;
    if (section === "explore") {
      if (!search?.hasNextPage) return;
      const nextPage = (search.page ?? page) + 1;
      const issued = request.current;
      loadMoreInFlight.current = true;
      setLoadingMore(true);
      try {
        const requestContext = await captureApiRequestContext();
        if (!live() || issued !== request.current) return;
        const result = await rpc(
          "github/searchRepos",
          { ...exploreFilters, query, page: nextPage, perPage: 20 },
          { requestContext, skipSpaceAuthRecovery: true },
        );
        if (!live() || issued !== request.current) return;
        setSearch((previous) => ({
          ...result,
          items: mergeRepos(previous?.items ?? [], result.items),
        }));
      } catch (cause) {
        if (live() && issued === request.current) setError(errorText(cause));
      } finally {
        loadMoreInFlight.current = false;
        if (live()) setLoadingMore(false);
      }
      return;
    }
    if (section === "repositories" && status?.status === "connected") {
      if (!repositories?.hasNextPage) return;
      const nextPage = (repositories.page ?? page) + 1;
      const issued = request.current;
      loadMoreInFlight.current = true;
      setLoadingMore(true);
      try {
        const requestContext = await captureApiRequestContext();
        if (!live() || issued !== request.current) return;
        const result = await rpc(
          "github/listMyRepos",
          {
            query,
            page: nextPage,
            perPage: 24,
            ...repositoryFilters,
            visibility: hidePrivate ? "public" : repositoryFilters.visibility,
          },
          { requestContext, skipSpaceAuthRecovery: true },
        );
        if (!live() || issued !== request.current) return;
        setRepositories((previous) => ({
          ...result,
          items: mergeRepos(previous?.items ?? [], result.items),
        }));
      } catch (cause) {
        if (live() && issued === request.current) setError(errorText(cause));
      } finally {
        loadMoreInFlight.current = false;
        if (live()) setLoadingMore(false);
      }
    }
  }, [
    loading,
    loadingMore,
    section,
    search,
    repositories,
    status?.status,
    exploreFilters,
    repositoryFilters,
    query,
    page,
    hidePrivate,
    setSearch,
    setRepositories,
  ]);

  async function changeConnection(token?: string) {
    if (!live() || mutation.current) return;
    mutation.current = true;
    const issued = ++request.current;
    setBusy(true);
    setError(null);
    try {
      const parsed =
        token === undefined ? undefined : GithubConnectInputSchema.safeParse({ token });
      if (parsed && !parsed.success) throw new Error(parsed.error.issues[0]?.message);
      const input = parsed?.success ? parsed.data : undefined;
      const requestContext = await captureApiRequestContext();
      if (!live()) return;
      const options = { requestContext, skipSpaceAuthRecovery: true };
      const connection = input
        ? await rpc("github/connect", input, options)
        : await rpc("github/disconnect", undefined, options);
      if (!inScope()) return;
      queryClient.setQueryData<GithubHomeSnapshot>(homeKey, { status: connection, overview: null });
      clearPageState(scopeKey, ["github-content"]);
      clearPageState(scopeKey, ["github-view", "selectedRepo"]);
      if (inScope()) {
        setStatus(connection);
        setOverview(null);
        setRepositories(null);
        setSearch(null);
        setDetail(null);
        setSelectedRepo(null);
        setPage(1);
      }
      const cachedScope = await persistedIntegrationsCacheScope();
      if (cachedScope && inScope()) writeGithubConnectionCache(cachedScope, connection);
      if (live()) setRevision((value) => value + 1);
    } catch (cause) {
      if (live() && issued === request.current) setError(errorText(cause));
    } finally {
      mutation.current = false;
      if (live()) {
        setBusy(false);
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  function selectSection(value: GithubSection) {
    setSection(value);
    setQuery("");
    setPage(1);
    setSelectedRepo(null);
  }

  function selectRepo(repo: GithubRepoSummary | null) {
    setSelectedRepo(repo);
  }

  function setHidePrivate(value: boolean) {
    setHidePrivateValue(value);
    setPage(1);
    if (value && selectedRepo?.isPrivate) selectRepo(null);
  }

  const visible = (items: GithubRepoSummary[]) =>
    hidePrivate ? items.filter((repo) => !repo.isPrivate) : items;

  return {
    section,
    selectSection,
    status,
    overview,
    repositories,
    search,
    detail,
    selectedRepo,
    selectRepo,
    year,
    selectYear: setYear,
    page,
    query,
    selectPage: setPage,
    loadMore,
    loadingMore,
    setQuery: (value: string) => {
      setQuery(value.trim());
      setPage(1);
    },
    hidePrivate,
    setHidePrivate,
    repositoryFilters,
    exploreFilters,
    filterRepositories: (value: Partial<GithubRepositoryFilters>) => {
      setRepositoryFilters((current) => ({ ...current, ...value }));
      setPage(1);
    },
    filterExplore: (value: Partial<GithubExploreFilters>) => {
      setExploreFilters((current) => ({ ...current, ...value }));
      setPage(1);
    },
    visible,
    loading,
    refreshing,
    busy,
    error,
    refresh: () => setRevision((value) => value + 1),
    pullToRefresh: () => {
      pullRequested.current = true;
      setRefreshing(true);
      setRevision((value) => value + 1);
    },
    connect: (token: string) => changeConnection(token),
    disconnect: () => changeConnection(),
  };
}
