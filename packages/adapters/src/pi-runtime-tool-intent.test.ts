import type { AssistantMessage, Context, Model } from "@earendil-works/pi-ai";
import { AssistantMessageEventStream } from "@earendil-works/pi-ai/utils/event-stream";
import type { AgentRunRequest } from "@rakazo/adapter-kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock("@earendil-works/pi-ai/providers/all", () => ({
  builtinModels: () => ({
    getModel: () => model,
    streamSimple: (...args: unknown[]) => provider.stream(...args),
  }),
}));
vi.mock("./pi-local-provider.js", () => ({ registerLocalProvider: (models: unknown) => models }));
vi.mock("./pi-openai-compatible-provider.js", () => ({
  OPENAI_COMPATIBLE_PROVIDER_ID: "openai-compatible",
  registerOpenAiCompatibleCatalog: (models: unknown) => models,
  registerOpenAiCompatibleRuntime: (models: unknown) => models,
}));

import { PiAgentRuntime } from "./pi-runtime.js";

const model: Model<"anthropic-messages"> = {
  provider: "anthropic",
  id: "intent-test",
  name: "intent-test",
  api: "anthropic-messages",
  baseUrl: "https://models.invalid",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 100_000,
  maxTokens: 4096,
};

function response(text: string, call = false) {
  const message: AssistantMessage = {
    role: "assistant",
    content: call
      ? [{ type: "toolCall", id: "call", name: "read_file", arguments: {} }]
      : [{ type: "text", text }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 10,
      output: 2,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 12,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: call ? "toolUse" : "stop",
    timestamp: Date.now(),
  };
  const stream = new AssistantMessageEventStream();
  stream.push({ type: "start", partial: { ...message, content: [] } });
  if (call && message.content[0]?.type === "toolCall") {
    stream.push({ type: "toolcall_start", contentIndex: 0, partial: message });
    stream.push({
      type: "toolcall_end",
      contentIndex: 0,
      toolCall: message.content[0],
      partial: message,
    });
  }
  stream.push({ type: "done", reason: call ? "toolUse" : "stop", message });
  stream.end(message);
  return stream;
}

function declaredTools(context: Context) {
  return context.messages.flatMap((message) =>
    message.role === "system" ? (message.toolsAdded ?? []).map((item) => item.name) : [],
  );
}

const tool = {
  name: "read_file",
  description: "Read a file",
  inputSchema: { type: "object", properties: {} },
};
const context = {
  operationId: "intent-test",
  traceId: "intent-test",
  spaceId: "space",
  userId: "user",
  signal: new AbortController().signal,
};
const request: AgentRunRequest = {
  botId: "bot",
  threadId: "thread",
  runId: "intent-test",
  prompt: "你好",
  instructions: "Answer the user.",
  history: [],
  tools: [tool],
  model: { provider: model.provider, id: model.id },
};

async function run(input: AgentRunRequest) {
  const events = [];
  for await (const event of new PiAgentRuntime().run(input, context)) events.push(event);
  return events;
}

beforeEach(() => provider.stream.mockReset());

describe("Pi tool intent routing", () => {
  it("runs the isolated tool-free entry without declaring or executing supplied tools", async () => {
    const seen: Context[] = [];
    const executeTool = vi.fn();
    provider.stream.mockImplementation((_model: unknown, value: Context) => {
      seen.push(structuredClone(value));
      return response("陪伴回应");
    });
    const runtime = new PiAgentRuntime();
    const events = [];
    for await (const event of runtime.runWithoutTools({
      ...request, executeTool, toolIntentCandidate: { message: "hello" },
    }, context)) events.push(event);
    expect(seen).toHaveLength(1);
    expect(declaredTools(seen[0]!)).toEqual([]);
    expect(executeTool).not.toHaveBeenCalled();
    expect(events.some((event) => event.type === "done")).toBe(true);
  });

  it("refuses steering, checkpoints, and scripts in the tool-free entry", () => {
    const runtime = new PiAgentRuntime();
    expect(() => runtime.runWithoutTools({ ...request, claimSteering: async () => [] }))
      .toThrow("tool-free");
    expect(() => runtime.runWithoutTools({ ...request, turnCheckpoint: "checkpoint" }))
      .toThrow("tool-free");
    expect(() => runtime.runWithoutTools({ ...request, resumeFromCheckpoint: "checkpoint" }))
      .toThrow("tool-free");
    expect(() => runtime.runWithoutTools({ ...request, script: [] })).toThrow("tool-free");
    expect(() => new PiAgentRuntime({ sessionRoot: "unused" }).runWithoutTools(request)).toThrow("tool-free");
  });

  it("does not execute an unsolicited tool call returned by the model", async () => {
    const executeTool = vi.fn();
    let calls = 0;
    provider.stream.mockImplementation(() => response("ignored", ++calls === 1));
    const runtime = new PiAgentRuntime();
    for await (const _event of runtime.runWithoutTools({ ...request, executeTool }, context)) {
      if (calls > 3) throw new Error("Unexpected repeated model calls");
    }
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("keeps the original tool list when the candidate is absent", async () => {
    const seen: Context[] = [];
    provider.stream.mockImplementation((_model: unknown, value: Context) => {
      seen.push(structuredClone(value));
      return response("你好");
    });
    await run(request);
    expect(seen).toHaveLength(1);
    expect(declaredTools(seen[0]!)).toContain("read_file");
  });

  it.each([false, true])(
    "restores tools for steering after a normal reply or unexpected tool call (%s)",
    async (unexpectedToolCall) => {
      const seen: Context[] = [];
      provider.stream.mockImplementation((_model: unknown, value: Context) => {
        seen.push(structuredClone(value));
        return response(
          seen.length === 1 ? "no_tools" : "你好",
          unexpectedToolCall && seen.length === 2,
        );
      });
      let claims = 0;
      const executeTool = vi.fn(async () => "unexpected");
      const observeTools = vi.fn();
      await run({
        ...request,
        toolIntentCandidate: { message: "你好" },
        executeTool,
        onInitialToolList: observeTools,
        claimSteering: async () => {
          claims += 1;
          return claims === 2
            ? [{ id: "steering", messageId: "new", text: "读取文件", origin: "user" }]
            : [];
        },
      });
      expect(seen.length).toBeGreaterThanOrEqual(3);
      expect(declaredTools(seen[0]!)).toEqual([]);
      expect(declaredTools(seen[1]!)).toEqual([]);
      expect(declaredTools(seen[2]!)).toContain("read_file");
      expect(executeTool).not.toHaveBeenCalled();
      expect(observeTools).toHaveBeenCalledWith({ count: 0, bytes: 2 });
    },
  );

  it("keeps tools when classification is uncertain", async () => {
    const seen: Context[] = [];
    provider.stream.mockImplementation((_model: unknown, value: Context) => {
      seen.push(structuredClone(value));
      return response(seen.length === 1 ? "uncertain" : "你好");
    });
    await run({ ...request, toolIntentCandidate: { message: "你好" } });
    expect(seen).toHaveLength(2);
    expect(declaredTools(seen[1]!)).toContain("read_file");
  });

  it("skips classification when a new instruction already arrived", async () => {
    const seen: Context[] = [];
    provider.stream.mockImplementation((_model: unknown, value: Context) => {
      seen.push(structuredClone(value));
      return response("你好");
    });
    await run({
      ...request,
      toolIntentCandidate: { message: "你好" },
      claimSteering: async () => [
        { id: "steering", messageId: "new", text: "读取文件", origin: "user" },
      ],
    });
    expect(seen).toHaveLength(1);
    expect(declaredTools(seen[0]!)).toContain("read_file");
  });
});
