import { describe, expect, it } from "vitest";
import { activeRunsForThread, previewFromBlocks, primaryActiveRun } from "./thread-listing.js";

describe("previewFromBlocks", () => {
  it("preserves literal URL paths in autolinks", () => {
    expect(previewFromBlocks([{ kind: "text", text: "Open <https://example.test/_draft_>" }])).toBe(
      "Open https://example.test/_draft_",
    );
  });
  it("preserves filenames while removing surrounding Markdown", () => {
    expect(previewFromBlocks([{ kind: "text", text: "Saved **monthly_sales_report.csv**" }])).toBe(
      "Saved monthly_sales_report.csv",
    );
  });
  it("returns the first text block with Markdown stripped", () => {
    expect(
      previewFromBlocks([
        { kind: "steps", steps: [{ label: "Read file", count: 1 }] },
        { kind: "text", text: "Created **Projects-CoS** as a **Project**" },
      ]),
    ).toBe("Created Projects-CoS as a Project");
  });

  it("returns empty when there is no text block", () => {
    expect(previewFromBlocks([{ kind: "steps", steps: [] }])).toBe("");
    expect(previewFromBlocks(undefined)).toBe("");
  });
});

describe("primaryActiveRun", () => {
  it.each([
    [["queued", "running"], "running"],
    [["queued"], "queued"],
    [["queued", "waiting_input"], "waiting_input"],
    [["queued", "leased"], "leased"],
    [["queued", "leased", "running"], "running"],
    [["running", "waiting_input"], "running"],
    [["running", "waiting_takeover"], "waiting_takeover"],
    [["leased", "waiting_input"], "leased"],
    [["leased", "waiting_takeover"], "waiting_takeover"],
    [[], undefined],
  ])("prioritizes %j as %s", (statuses, expected) => {
    const runs = statuses.map((status) => ({ status }));
    expect(primaryActiveRun(runs)?.status).toBe(expected);
    expect(primaryActiveRun([...runs].reverse())?.status).toBe(expected);
  });
});

describe("activeRunsForThread", () => {
  it("isolates a bot's DM status from waiting_input runs in other threads such as groups", () => {
    const runs = [
      { status: "waiting_input", threadId: "group-thread-1" },
      { status: "queued", threadId: "dm-thread-1" },
    ];
    expect(primaryActiveRun(activeRunsForThread(runs, "dm-thread-1"))?.status).toBe("queued");
    expect(
      primaryActiveRun(
        activeRunsForThread(
          [{ status: "waiting_input", threadId: "group-thread-1" }],
          "dm-thread-1",
        ),
      ),
    ).toBeUndefined();
    const withoutThread: Array<{ status: string; threadId?: string }> = [{ status: "running" }];
    expect(primaryActiveRun(activeRunsForThread(withoutThread, "dm-thread-1"))?.status).toBe(
      "running",
    );
  });
});
