import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  subscribeThread: vi.fn(),
  sessionGen: 1,
  apiBase: "https://api.example",
  getImageAsync: vi.fn(),
  pickFromLibrary: vi.fn(),
  listener: undefined as
    | undefined
    | ((event: { type: string; seq?: number; text?: string }) => void),
}));

vi.mock("./api", () => ({
  rpc: mocks.rpc,
  currentApiBase: () => mocks.apiBase,
  subscribeThread: mocks.subscribeThread,
  applyMobileThreadEvent: (
    snapshot: { messages: unknown[]; run: unknown } | null,
    event: { text?: string; seq?: number },
  ) =>
    snapshot && event.text
      ? {
          ...snapshot,
          run: null,
          messages: [
            {
              id: `msg-${event.seq ?? "next"}`,
              role: "bot",
              blocks: [{ kind: "text", text: event.text }],
            },
          ],
        }
      : snapshot,
}));
vi.mock("./session", () => ({
  currentSessionGeneration: () => mocks.sessionGen,
}));
vi.mock("./pick-attachments", () => ({
  pickFromLibrary: mocks.pickFromLibrary,
}));
vi.mock("expo-clipboard", () => ({
  getImageAsync: mocks.getImageAsync,
}));

import {
  buildCompanionCaptureUrl,
  parseClipboardImageDataUri,
  readClipboardScreenshot,
  sendCompanionCapture,
  waitForCompanionCaptureReply,
} from "./companion-capture";

const TINY_JPEG_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessionGen = 1;
  mocks.apiBase = "https://api.example";
  mocks.listener = undefined;
  mocks.subscribeThread.mockImplementation((_target, _cursor, listener, signal) => {
    mocks.listener = listener;
    return new Promise<void>((resolve) =>
      signal.addEventListener("abort", resolve, { once: true }),
    );
  });
});

describe("companion-capture (CMP-04)", () => {
  it("builds standard rakazo://companion-capture URLs and validates clipboard image URIs", () => {
    expect(buildCompanionCaptureUrl({ source: "clipboard", speak: true })).toBe(
      "rakazo://companion-capture?source=clipboard&speak=1",
    );
    expect(buildCompanionCaptureUrl({ botId: "bot-1", spaceId: "space-1", mode: "message" })).toBe(
      "rakazo://companion-capture?botId=bot-1&spaceId=space-1&mode=message",
    );

    const parsed = parseClipboardImageDataUri(`data:image/jpeg;base64,${TINY_JPEG_B64}`);
    expect(parsed).toMatchObject({
      mimeType: "image/jpeg",
      contentBase64: TINY_JPEG_B64,
    });
    expect(parsed!.size).toBeGreaterThan(0);

    // Rejects unsupported MIME, corrupt base64, and oversized payloads
    expect(parseClipboardImageDataUri("data:text/plain;base64,SGVsbG8=")).toBeNull();
    expect(parseClipboardImageDataUri("data:image/jpeg;base64,not-valid!")).toBeNull();
    expect(parseClipboardImageDataUri(`data:image/jpeg;base64,${TINY_JPEG_B64}`, 4)).toBeNull();
  });

  it("reads screenshot from clipboard via expo-clipboard", async () => {
    mocks.getImageAsync.mockResolvedValueOnce({
      data: `data:image/jpeg;base64,${TINY_JPEG_B64}`,
      size: { width: 1170, height: 2532 },
    });
    const shot = await readClipboardScreenshot();
    expect(shot?.mimeType).toBe("image/jpeg");
    expect(shot?.contentBase64).toBe(TINY_JPEG_B64);
  });

  it("uploads screenshot via artifacts/create and sends together with user text", async () => {
    mocks.rpc.mockImplementation(async (method: string) => {
      if (method === "threads/get") {
        return {
          botId: "bot-1",
          cursor: 5,
          run: null,
          messages: [{ id: "old-1", role: "bot", blocks: [{ kind: "text", text: "旧回复" }] }],
        };
      }
      if (method === "artifacts/create") return { id: "art-1" };
      if (method === "threads/send") return { seq: 6 };
      throw new Error(`unexpected ${method}`);
    });

    const shot = parseClipboardImageDataUri(`data:image/jpeg;base64,${TINY_JPEG_B64}`)!;
    const sent = await sendCompanionCapture({
      botId: "bot-1",
      text: "帮我翻译这段菜单",
      screenshot: shot,
      locale: "zh-CN",
      clientNonce: "nonce-1",
    });

    expect(sent).toEqual({
      artifactId: "art-1",
      messageText: "帮我翻译这段菜单",
      baselineMessageId: "old-1",
      cursor: 6,
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "artifacts/create",
      expect.objectContaining({
        botId: "bot-1",
        mimeType: "image/jpeg",
        contentBase64: TINY_JPEG_B64,
        clientNonce: "nonce-1:0",
      }),
      expect.objectContaining({ timeoutMs: 120_000 }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "threads/send",
      expect.objectContaining({
        botId: "bot-1",
        clientNonce: "nonce-1",
        text: "帮我翻译这段菜单",
        artifactIds: ["art-1"],
        imageHandling: "confirm",
      }),
    );
  });

  it("supports text-only quick send and fails closed when session changes mid-upload", async () => {
    mocks.rpc.mockImplementation(async (method: string) => {
      if (method === "threads/get") return { botId: "bot-1", cursor: 2, run: null, messages: [] };
      if (method === "threads/send") return { seq: 3 };
      return {};
    });

    const textOnly = await sendCompanionCapture({
      botId: "bot-1",
      text: "今晚帮我提醒开会",
      screenshot: null,
      locale: "zh-CN",
      clientNonce: "nonce-2",
    });
    expect(textOnly.artifactId).toBeUndefined();
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "artifacts/create",
      expect.anything(),
      expect.anything(),
    );

    mocks.rpc.mockImplementationOnce(async () => {
      mocks.sessionGen = 2;
      return { botId: "bot-1", cursor: 2, run: null, messages: [] };
    });
    await expect(
      sendCompanionCapture({
        botId: "bot-1",
        text: "测试越权",
        screenshot: null,
        locale: "zh-CN",
      }),
    ).rejects.toThrow("会话已切换");
  });

  it("waits for a new bot reply while ignoring historical baseline", async () => {
    mocks.rpc.mockResolvedValueOnce({
      botId: "bot-1",
      cursor: 6,
      run: { id: "run-1", status: "running" },
      messages: [{ id: "old-1", role: "bot", blocks: [{ kind: "text", text: "旧回复" }] }],
    });
    const onStatus = vi.fn();
    const controller = new AbortController();
    const waiting = waitForCompanionCaptureReply({
      botId: "bot-1",
      baselineMessageId: "old-1",
      initialCursor: 6,
      signal: controller.signal,
      onStatus,
    });
    await vi.waitFor(() => expect(mocks.listener).toBeDefined());
    expect(onStatus).toHaveBeenCalledWith("thinking");

    mocks.listener?.({ type: "thread.message.created", seq: 7, text: "这是截图里的英文菜单翻译" });
    expect(await waiting).toBe("这是截图里的英文菜单翻译");
  });
});
