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
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { captureApiRequestContext, isSpaceSelectionPending, rpc } from "./api";
import {
  integrationsCacheScope,
  persistedIntegrationsCacheScope,
  readGithubConnectionCache,
  writeGithubConnectionCache,
} from "./integrations-cache";
import { projectScopeKey } from "./project-scope";
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

export function useGithub(scopeKey: string) {
  const [section, setSection] = useState<GithubSection>("profile");
  const [status, setStatus] = useState<GithubConnectionStatus | null>(null);
  const [overview, setOverview] = useState<GithubProfileOverview | null>(null);
  const [repositories, setRepositories] = useState<GithubRepoPage | null>(null);
  const [search, setSearch] = useState<GithubSearchReposOutput | null>(null);
  const [detail, setDetail] = useState<GithubRepoDetail | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<GithubRepoSummary | null>(null);
  const [year, setYear] = useState<number | undefined>();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [hidePrivate, setHidePrivateValue] = useState(false);
  const [repositoryFilters, setRepositoryFilters] = useState<GithubRepositoryFilters>({
    affiliation: "all",
    visibility: "all",
    sort: "pushed",
  });
  const [exploreFilters, setExploreFilters] = useState<GithubExploreFilters>({
    sort: "best-match",
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const focused = useRef(false);
  const request = useRef(0);
  const mutation = useRef(false);
  const pullRequested = useRef(false);
  const live = () =>
    focused.current && scopeKey === projectScopeKey() && !isSpaceSelectionPending();

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
          setStatus(connection);
          if (cachedScope) {
            writeGithubConnectionCache(cachedScope, connection);
          } else {
            void integrationsCacheScope()
              .then((scope) => {
                if (current()) writeGithubConnectionCache(scope, connection);
              })
              .catch(() => undefined);
          }
          if (connection.status !== "connected") {
            setOverview(null);
            setRepositories(null);
            if (selectedRepo?.isPrivate) {
              setDetail(null);
              setSelectedRepo(null);
              return;
            }
          }
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
            if (current()) setOverview(result);
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
          if (current()) setError(errorText(cause));
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
      if (!live()) return;
      setStatus(connection);
      const cachedScope = await persistedIntegrationsCacheScope();
      if (!live()) return;
      if (cachedScope) writeGithubConnectionCache(cachedScope, connection);
      setOverview(null);
      setRepositories(null);
      setSearch(null);
      setDetail(null);
      setSelectedRepo(null);
      setPage(1);
      setRevision((value) => value + 1);
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
    setDetail(null);
  }

  function selectRepo(repo: GithubRepoSummary | null) {
    setDetail(null);
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
    selectPage: setPage,
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
