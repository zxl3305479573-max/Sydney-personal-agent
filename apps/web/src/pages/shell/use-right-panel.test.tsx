// @vitest-environment jsdom

import type { Routine } from "@rakazo/contracts";
import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { rightPanelStorageKey, writeRightPanelState } from "../../lib/right-panel-state";
import { useRightPanel, useRightPanelRestore } from "./use-right-panel";

it("refreshes a restored computer only after its panel is visible", async () => {
  const savedKey = rightPanelStorageKey("user", "space", "bot", "bot-computer");
  writeRightPanelState(savedKey, "computer");
  const searchParams = new URLSearchParams();
  const routines: Routine[] = [];
  const visible = vi.fn();
  const refreshRestoredComputer = vi.fn((botId: string) => {
    expect(visible).toHaveBeenLastCalledWith(botId, "computer");
  });

  function Harness({ botId }: { botId: string }) {
    const rightPanel = useRightPanel({ searchParams, setSearchParams: vi.fn() });
    useLayoutEffect(() => {
      visible(botId, rightPanel.panel);
    }, [botId, rightPanel.panel]);
    useRightPanelRestore({
      rightPanel,
      userId: "user",
      spaceId: "space",
      inGroup: false,
      panelTarget: botId,
      activeId: botId,
      routines,
      routinesBotId: null,
      searchParams,
      editingRoutineId: undefined,
      restoreRoutine: vi.fn(),
      leaveRoutine: vi.fn(),
      refreshRestoredComputer,
    });
    return null;
  }

  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Harness botId="bot-computer" />));
    await act(async () => root.render(<Harness botId="bot-computer" />));
    await act(async () => root.render(<Harness botId="bot-other" />));
    expect(refreshRestoredComputer).toHaveBeenCalledExactlyOnceWith("bot-computer");
  } finally {
    act(() => root.unmount());
    localStorage.removeItem(savedKey);
    localStorage.removeItem(rightPanelStorageKey("user", "space", "bot", "bot-other"));
  }
});
