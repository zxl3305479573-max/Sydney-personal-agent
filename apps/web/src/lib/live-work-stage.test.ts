import { expect, it } from "vitest";
import { liveWorkStage } from "./live-work-stage";

it("uses the last actual tool step and ignores completed messages", () => {
  expect(liveWorkStage([])).toBe("preparing");
  expect(
    liveWorkStage([
      { id: "old", blocks: [{ kind: "steps", steps: [{ label: "Shell", count: 1 }] }] },
    ]),
  ).toBe("preparing");
  expect(
    liveWorkStage([
      {
        id: "progress:1",
        blocks: [{ kind: "steps", steps: [{ label: "Web search", count: 1 }] }],
      },
    ]),
  ).toBe("web");
  expect(
    liveWorkStage([
      {
        id: "progress:1",
        blocks: [
          {
            kind: "steps",
            steps: [
              { label: "Web search", count: 1 },
              { label: "Shell", count: 2 },
            ],
          },
        ],
      },
    ]),
  ).toBe("computer");
});
