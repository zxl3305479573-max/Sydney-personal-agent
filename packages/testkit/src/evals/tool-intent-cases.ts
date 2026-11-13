export type ToolIntentCase = {
  id: string;
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  expected: "no_tools" | "tools_needed";
};

export const TOOL_INTENT_CASES: ToolIntentCase[] = [
  { id: "greeting", message: "你好，很高兴认识你。", history: [], expected: "no_tools" },
  { id: "explain", message: "请解释什么是递归。", history: [], expected: "no_tools" },
  {
    id: "polish",
    message: "请润色这句话：今天的会议很顺利。",
    history: [],
    expected: "no_tools",
  },
  {
    id: "weather",
    message: "请上网查一下上海现在的天气。",
    history: [],
    expected: "tools_needed",
  },
  {
    id: "file",
    message: "请在工作区创建 hello.txt，内容写你好。",
    history: [],
    expected: "tools_needed",
  },
  {
    id: "computer",
    message: "请看看电脑屏幕上现在显示什么。",
    history: [],
    expected: "tools_needed",
  },
  {
    id: "continue-project",
    message: "继续修改刚才的项目文件。",
    history: [
      { role: "user", content: "帮我修改工作区的项目文件。" },
      { role: "assistant", content: "我会检查项目后开始修改。" },
    ],
    expected: "tools_needed",
  },
  {
    id: "continue-ambiguous",
    message: "继续",
    history: [
      { role: "user", content: "请修改工作区的项目文件。" },
      { role: "assistant", content: "我会接着检查并修改文件。" },
    ],
    expected: "tools_needed",
  },
];
