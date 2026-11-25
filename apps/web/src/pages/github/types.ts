import type { Bot, GithubRepoSummary } from "@rakazo/contracts";

export type GithubModuleTab = "overview" | "repos" | "explore";

export interface SelectedGithubRepo {
  owner: string;
  repo: string;
  summary?: GithubRepoSummary;
}

export interface GithubRepoListProps {
  connected: boolean;
  hidePrivate: boolean;
  selectedRepo: SelectedGithubRepo | null;
  onSelectRepo: (target: SelectedGithubRepo) => void;
  onRequestConnect: () => void;
}

export interface GithubExploreSearchProps {
  connected: boolean;
  selectedRepo: SelectedGithubRepo | null;
  onSelectRepo: (target: SelectedGithubRepo) => void;
  onRequestConnect: () => void;
}

export interface GithubRepoDrawerProps {
  target: SelectedGithubRepo | null;
  connected: boolean;
  viewerLogin: string | null;
  bots: readonly Bot[];
  onClose: () => void;
}
