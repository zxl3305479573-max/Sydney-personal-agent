import { expect, it } from "vitest";
import {
  combinePersonalityInstructions,
  replaceBotDuties,
  splitPersonalityInstructions,
} from "./bot-personality.js";

it("preserves the existing personality when duties are rewritten", () => {
  const current = combinePersonalityInstructions("旧职责", "温柔、耐心");
  const replacement = combinePersonalityInstructions("审核合同", "替换人格");
  expect(splitPersonalityInstructions(replaceBotDuties(current, replacement))).toEqual({
    duties: "审核合同",
    personality: "温柔、耐心",
  });
  expect(replaceBotDuties("旧职责", "新职责")).toBe("新职责");
});
