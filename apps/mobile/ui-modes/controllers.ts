import type { ComputerMode, ComputerReleaseReason, SpaceBot, SpaceGroup } from "@rakazo/contracts";
import type { ReactNode } from "react";
import type { MobileBot, MobileGroup, MobileMe, MobileMessage, MobileSnapshot } from "../lib/api";
import type { ComputerStatus } from "../lib/computer";
import type { CreateAction } from "../lib/create-chooser";
import type { InboxItem } from "../lib/inbox-spaces";
import type { useThreadAttachments } from "../lib/thread-attachments";
import type { useThreadPaging } from "../lib/thread-paging";
import type { useThreadSend } from "../lib/thread-send";
import type { LoadFailureKind } from "../lib/user-error";

export type InboxUiModeController = {
  items: readonly InboxItem[];
  me: Pick<MobileMe, "userId" | "spaceId" | "name"> | null;
  embedded: boolean;
  sharing: boolean;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  loadFailure: { kind: LoadFailureKind; message: string } | null;
  spaceBusy: boolean;
  spaceRecoveryId: string | null;
  refresh: () => Promise<void>;
  openBot: (bot: MobileBot | SpaceBot) => void;
  openGroup: (group: MobileGroup | SpaceGroup) => void;
  create: (action: CreateAction) => void;
  selectSpace: (spaceId: string) => Promise<void>;
};

export type ThreadUiModeController = {
  botId: string | undefined;
  groupId: string | undefined;
  userId: string;
  displayName: string;
  readOnly: boolean;
  snapshot: MobileSnapshot | null;
  messages: readonly MobileMessage[];
  error: string | null;
  showingSaved: boolean;
  working: boolean;
  composer: ReturnType<typeof useThreadSend>;
  attachments: ReturnType<typeof useThreadAttachments>;
  paging: Pick<
    ReturnType<typeof useThreadPaging>,
    "loadingOlder" | "loadingNewer" | "loadOlderMessages"
  >;
  showLatest: () => void;
  openBot: (id: string, name: string) => void;
  openComputer: (id: string, name: string) => void;
};

export type ComputerUiModeController = {
  botId: string | undefined;
  name: string;
  computer: ComputerStatus | null;
  screen: {
    previewUrl: string | null;
    workspaceUrl: string | null;
    visible: boolean;
    placeholder: string;
    error: string | null;
    native: boolean;
  };
  keyboardBar: ReactNode;
  booting: boolean;
  switching: boolean;
  releasing: boolean;
  hasControl: boolean;
  open: boolean;
  error: string | null;
  screenError: string | null;
  nativeInputError: string | null;
  nativeGeometry: { width: number; height: number } | null;
  openComputer: (options: { takeControl: boolean }) => Promise<void>;
  closeComputer: () => void;
  releaseComputer: (reason?: ComputerReleaseReason) => Promise<void>;
  setComputerMode: (mode: ComputerMode) => Promise<void>;
  reloadScreen: () => Promise<void>;
};
