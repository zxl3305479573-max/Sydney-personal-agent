import { ATTACHMENT_MAX_BYTES } from "@rakazo/contracts";
import { isRetryableError, isRunWaitingOnUser, isRunWorking, newClientId } from "@rakazo/core";
import type { MobileMessage, MobileSnapshot } from "./api";
import { applyMobileThreadEvent, currentApiBase, rpc, subscribeThread } from "./api";
import { currentSessionGeneration } from "./session";

export type CapturedScreenshot = {
  name: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  contentBase64: string;
  size: number;
  previewUri: string;
};

export type CompanionCaptureUrlOptions = {
  botId?: string;
  spaceId?: string | null;
  source?: "clipboard";
  speak?: boolean;
  mode?: "capture" | "message";
  prompt?: string;
};

const UPLOAD_TIMEOUT_MS = 120_000;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export function defaultCapturePrompt(locale: string): string {
  if (locale === "zh-TW") return "請幫我看看這張截圖的內容。";
  if (locale.startsWith("zh")) return "请帮我看看这张截图的内容。";
  return "Please take a look at this screenshot.";
}

export function quickCapturePrompts(locale: string): readonly string[] {
  if (locale === "zh-TW") {
    return ["幫我總結重點", "翻譯成中文", "解釋這裡是什麼意思", "幫我起草回覆"];
  }
  if (locale.startsWith("zh")) {
    return ["帮我总结重点", "翻译成中文", "解释这里是什么意思", "帮我起草回复"];
  }
  return ["Summarize this", "Translate to Chinese", "Explain what this means", "Draft a reply"];
}

export function buildCompanionCaptureUrl(options: CompanionCaptureUrlOptions = {}): string {
  const params = new URLSearchParams();
  if (options.botId?.trim()) params.set("botId", options.botId.trim());
  if (options.spaceId?.trim()) params.set("spaceId", options.spaceId.trim());
  if (options.source) params.set("source", options.source);
  if (options.speak) params.set("speak", "1");
  if (options.mode) params.set("mode", options.mode);
  if (options.prompt?.trim()) params.set("prompt", options.prompt.trim());
  const qs = params.toString();
  return qs ? `rakazo://companion-capture?${qs}` : "rakazo://companion-capture";
}

export function estimateBase64Bytes(base64: string): number {
  const clean = base64.replace(/\s+/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

export function parseClipboardImageDataUri(
  dataUri: string | null | undefined,
  maxBytes = ATTACHMENT_MAX_BYTES,
): CapturedScreenshot | null {
  if (typeof dataUri !== "string") return null;
  const trimmed = dataUri.trim();
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(trimmed);
  if (!match?.[1] || !match[2]) return null;
  const mimeType = match[1].toLowerCase() as CapturedScreenshot["mimeType"];
  const contentBase64 = match[2].replace(/\s+/g, "");
  if (!contentBase64 || contentBase64.length % 4 !== 0 || !BASE64_PATTERN.test(contentBase64)) {
    return null;
  }
  const size = estimateBase64Bytes(contentBase64);
  if (size <= 0 || size > maxBytes) return null;
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  return {
    name: `screenshot-${Date.now()}.${ext}`,
    mimeType,
    contentBase64,
    size,
    previewUri: `data:${mimeType};base64,${contentBase64}`,
  };
}

export async function readClipboardScreenshot(
  maxBytes = ATTACHMENT_MAX_BYTES,
): Promise<CapturedScreenshot | null> {
  try {
    const Clipboard = await import("expo-clipboard");
    const image = await Clipboard.getImageAsync({ format: "jpeg", jpegQuality: 0.85 });
    if (!image?.data) return null;
    return parseClipboardImageDataUri(image.data, maxBytes);
  } catch {
    return null;
  }
}

export async function pickScreenshotFromLibrary(
  maxBytes = ATTACHMENT_MAX_BYTES,
): Promise<CapturedScreenshot | null> {
  const { pickFromLibrary } = await import("./pick-attachments");
  const result = await pickFromLibrary(0, maxBytes, 1);
  const first = result.attachments[0];
  if (!first?.mimeType.startsWith("image/") || !first.contentBase64) return null;
  const mimeType: CapturedScreenshot["mimeType"] =
    first.mimeType === "image/png"
      ? "image/png"
      : first.mimeType === "image/webp"
        ? "image/webp"
        : "image/jpeg";
  return {
    name: first.name,
    mimeType,
    contentBase64: first.contentBase64,
    size: estimateBase64Bytes(first.contentBase64),
    previewUri: first.previewUri ?? `data:${mimeType};base64,${first.contentBase64}`,
  };
}

export function latestBotReplyFromSnapshot(
  messages: readonly MobileMessage[],
): { id: string; text: string } | null {
  const message = [...messages].reverse().find((entry) => entry.role === "bot");
  if (!message) return null;
  const text = message.blocks
    .filter((block) => block.kind === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  return text ? { id: message.id, text } : null;
}

export async function sendCompanionCapture(input: {
  botId: string;
  text: string;
  screenshot: CapturedScreenshot | null;
  locale: string;
  clientNonce?: string;
}): Promise<{
  artifactId?: string;
  messageText: string;
  baselineMessageId: string | null;
  cursor: number;
}> {
  const trimmed = input.text.trim();
  if (!trimmed && !input.screenshot) {
    throw new Error("请输入内容或添加一张截屏。");
  }
  const generation = currentSessionGeneration();
  const apiBase = currentApiBase();
  const isScopeCurrent = () =>
    generation === currentSessionGeneration() && apiBase === currentApiBase();

  let baselineMessageId: string | null = null;
  let cursor = -1;
  try {
    const pre = await rpc("threads/get", { botId: input.botId });
    baselineMessageId = latestBotReplyFromSnapshot(pre.messages)?.id ?? null;
    cursor = pre.cursor ?? -1;
  } catch {
    // Proceeding without pre-snapshot still delivers the message cleanly.
  }
  if (!isScopeCurrent()) {
    throw new Error("会话已切换，请重新发送。");
  }

  const nonce = input.clientNonce ?? newClientId();
  let artifactId: string | undefined;
  if (input.screenshot) {
    const artifact = await rpc(
      "artifacts/create",
      {
        botId: input.botId,
        name: input.screenshot.name,
        mimeType: input.screenshot.mimeType,
        contentBase64: input.screenshot.contentBase64,
        clientNonce: `${nonce}:0`,
      },
      { timeoutMs: UPLOAD_TIMEOUT_MS },
    );
    artifactId = artifact.id;
    if (!isScopeCurrent()) {
      throw new Error("会话已切换，请重新发送。");
    }
  }

  const messageText = trimmed || defaultCapturePrompt(input.locale);
  const sent = await rpc("threads/send", {
    botId: input.botId,
    clientNonce: nonce,
    text: messageText,
    imageHandling: "confirm",
    ...(artifactId ? { artifactIds: [artifactId] } : {}),
  });

  return {
    artifactId,
    messageText,
    baselineMessageId,
    cursor: Math.max(cursor, sent.seq ?? -1),
  };
}

export async function waitForCompanionCaptureReply(input: {
  botId: string;
  baselineMessageId: string | null;
  initialCursor: number;
  signal: AbortSignal;
  onStatus?: (phase: "thinking" | "waiting_input") => void;
}): Promise<string | null> {
  const generation = currentSessionGeneration();
  const apiBase = currentApiBase();
  const active = () =>
    !input.signal.aborted &&
    generation === currentSessionGeneration() &&
    apiBase === currentApiBase();

  let snapshot: MobileSnapshot | null = null;

  const extractCompletedReply = (snap: MobileSnapshot | null): string | null => {
    if (!snap) return null;
    const status = snap.run?.status;
    if (isRunWaitingOnUser(status)) {
      input.onStatus?.("waiting_input");
      return null;
    }
    if (isRunWorking(status)) {
      input.onStatus?.("thinking");
      return null;
    }
    const latest = latestBotReplyFromSnapshot(snap.messages);
    if (latest && latest.id !== input.baselineMessageId) {
      return latest.text;
    }
    return null;
  };

  while (active()) {
    try {
      snapshot = await rpc("threads/get", { botId: input.botId }, { signal: input.signal });
      if (!active()) return null;
      const immediate = extractCompletedReply(snapshot);
      if (immediate) return immediate;

      let resolvedReply: string | null = null;
      const streamAbort = new AbortController();
      const onOuterAbort = () => streamAbort.abort();
      input.signal.addEventListener("abort", onOuterAbort, { once: true });
      try {
        let cursor = Math.max(input.initialCursor, snapshot.cursor ?? -1);
        await subscribeThread(
          { botId: input.botId },
          cursor,
          (event) => {
            if (!active()) return;
            cursor = Math.max(cursor, event.seq ?? -1);
            snapshot = applyMobileThreadEvent(snapshot, event);
            const ready = extractCompletedReply(snapshot);
            if (ready) {
              resolvedReply = ready;
              streamAbort.abort();
            }
          },
          streamAbort.signal,
        );
      } finally {
        input.signal.removeEventListener("abort", onOuterAbort);
      }
      if (resolvedReply) return resolvedReply;
    } catch (error) {
      if (!active() || !isRetryableError(error)) return null;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1_200);
        input.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    }
  }
  return null;
}
