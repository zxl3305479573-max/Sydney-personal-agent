import { expect, it } from "vitest";
import { isLoopGuardStopText } from "./loop-guard-message.js";

it("recognizes current and legacy stops without matching ordinary text", () => {
  expect(
    isLoopGuardStopText(
      "任务已停止：工具「Shell」连续 4 次使用相同输入，未能继续推进。此前的部分操作可能已经执行，请先检查结果，再决定是否回复说明下一步。",
    ),
  ).toBe(true);
  expect(
    isLoopGuardStopText(
      "I got stuck calling Shell with the same input 4 times in a row without making progress, so I stopped early. Try rephrasing this, or ask me to try a different approach.",
    ),
  ).toBe(true);
  expect(isLoopGuardStopText("任务已停止，请稍后重试。")).toBe(false);
});
