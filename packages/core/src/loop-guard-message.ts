const legacyPattern =
  /^I got stuck calling .+ with (?:(?:nearly )?the same input|too many actions) \d+ times in a row without making progress, so I stopped early\. Try rephrasing this, or ask me to try a different approach\.$/;

const currentPattern =
  /^任务已停止：工具「[^\r\n]+」连续 \d+ 次(?:使用相同输入|使用相似输入|提交过多操作)，未能继续推进。此前的部分操作可能已经执行，请先检查结果，再决定是否回复说明下一步。$/;

export function isLoopGuardStopText(text: string): boolean {
  return legacyPattern.test(text) || currentPattern.test(text);
}
