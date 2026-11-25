import type { ModelCallObserver } from "@rakazo/adapter-kit";
import { describe, expect, it, vi } from "vitest";
import { composeSubagentCallObserver } from "./pi-runtime-subagent.js";

const sampleCall = {
  runId: "run-1",
  operationKind: "subagent" as const,
  provider: "openai",
  modelId: "gpt-4o-mini",
  inputTokensEstimate: 500,
  maxOutputTokens: 256,
};

describe("composeSubagentCallObserver", () => {
  it("runs the parent managed observer before the model observer and propagates lifecycle callbacks", async () => {
    const order: string[] = [];
    const hostObserver: ModelCallObserver = {
      beforeCall: vi.fn(async () => {
        order.push("host:before");
        return "host-res-1";
      }),
      onRequestId: vi.fn(async () => {
        order.push("host:reqId");
      }),
      afterCall: vi.fn(async () => {
        order.push("host:after");
      }),
    };
    const modelObserver: ModelCallObserver = {
      beforeCall: vi.fn(async () => {
        order.push("model:before");
        return "model-res-1";
      }),
      onRequestId: vi.fn(async () => {
        order.push("model:reqId");
      }),
      afterCall: vi.fn(async () => {
        order.push("model:after");
      }),
    };

    const composed = composeSubagentCallObserver(hostObserver, modelObserver)!;
    const reservationId = await composed.beforeCall(sampleCall);
    await composed.onRequestId?.(reservationId, "prov-req-9");
    await composed.afterCall(reservationId, null);

    expect(order).toEqual([
      "host:before",
      "model:before",
      "host:reqId",
      "model:reqId",
      "model:after",
      "host:after",
    ]);
    expect(hostObserver.onRequestId).toHaveBeenCalledWith("host-res-1", "prov-req-9");
    expect(modelObserver.onRequestId).toHaveBeenCalledWith("model-res-1", "prov-req-9");
    expect(hostObserver.afterCall).toHaveBeenCalledWith("host-res-1", null);
    expect(modelObserver.afterCall).toHaveBeenCalledWith("model-res-1", null);
  });

  it("blocks the model observer when the parent managed budget gate rejects", async () => {
    const hostObserver: ModelCallObserver = {
      beforeCall: vi.fn(async () => {
        throw new Error("task_token_budget_exceeded");
      }),
      afterCall: vi.fn(),
    };
    const modelObserver: ModelCallObserver = {
      beforeCall: vi.fn(async () => "model-res-1"),
      afterCall: vi.fn(),
    };

    const composed = composeSubagentCallObserver(hostObserver, modelObserver)!;
    await expect(composed.beforeCall(sampleCall)).rejects.toThrow("task_token_budget_exceeded");
    expect(modelObserver.beforeCall).not.toHaveBeenCalled();
  });

  it("releases the parent reservation if the model observer fails in beforeCall", async () => {
    const hostObserver: ModelCallObserver = {
      beforeCall: vi.fn(async () => "host-res-1"),
      afterCall: vi.fn(),
    };
    const modelObserver: ModelCallObserver = {
      beforeCall: vi.fn(async () => {
        throw new Error("billing_limit");
      }),
      afterCall: vi.fn(),
    };

    const composed = composeSubagentCallObserver(hostObserver, modelObserver)!;
    await expect(composed.beforeCall(sampleCall)).rejects.toThrow("billing_limit");
    expect(hostObserver.afterCall).toHaveBeenCalledWith("host-res-1", null);
  });

  it("avoids duplicate calls when host and model share the same observer instance", () => {
    const shared: ModelCallObserver = {
      beforeCall: vi.fn(async () => "shared-1"),
      afterCall: vi.fn(),
    };
    expect(composeSubagentCallObserver(shared, shared)).toBe(shared);
    expect(composeSubagentCallObserver(undefined, shared)).toBe(shared);
    expect(composeSubagentCallObserver(shared, undefined)).toBe(shared);
    expect(composeSubagentCallObserver(undefined, undefined)).toBeUndefined();
  });
});
