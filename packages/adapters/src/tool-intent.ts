export type ToolIntent = "no_tools" | "tools_needed" | "uncertain";

export type ToolIntentInput = {
  message: string;
  history: ReadonlyArray<{ role: "user" | "assistant"; content: string }>;
  contextComplete: boolean;
};

export type ToolIntentClassifier = (
  input: ToolIntentInput,
  signal: AbortSignal,
) => Promise<unknown>;

export function toolIntentCandidate(options: {
  enabled: boolean;
  trigger: string;
  sourceRole?: string;
  group: boolean;
  voiceCall: boolean;
  scripted: boolean;
  hasCheckpoint: boolean;
  hasAttachments: boolean;
  hasPriorContext: boolean;
  hasCustomInstructions: boolean;
  message: string;
}): { message: string } | undefined {
  if (
    !options.enabled ||
    options.trigger !== "user" ||
    options.sourceRole !== "user" ||
    options.group ||
    options.voiceCall ||
    options.scripted ||
    options.hasCheckpoint ||
    options.hasAttachments ||
    options.hasPriorContext ||
    options.hasCustomInstructions ||
    !options.message.trim()
  )
    return undefined;
  return { message: options.message };
}

const MAX_INPUT_BYTES = 12_000;
const DEFAULT_TIMEOUT_MS = 2_000;

export async function classifyToolIntent(
  input: ToolIntentInput,
  classifier: ToolIntentClassifier,
  signal: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ToolIntent> {
  if (
    signal.aborted ||
    !input.contextComplete ||
    !input.message.trim() ||
    new TextEncoder().encode(JSON.stringify(input)).byteLength > MAX_INPUT_BYTES
  )
    return "uncertain";

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    const interrupted = new Promise<"uncertain">((resolve) => {
      const stop = () => {
        controller.abort();
        resolve("uncertain");
      };
      onAbort = stop;
      signal.addEventListener("abort", stop, { once: true });
      timer = setTimeout(stop, timeoutMs);
      if (signal.aborted) stop();
    });
    const result = await Promise.race([
      Promise.resolve().then(() => classifier(input, controller.signal)),
      interrupted,
    ]);
    return result === "no_tools" || result === "tools_needed" ? result : "uncertain";
  } catch {
    return "uncertain";
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (onAbort) signal.removeEventListener("abort", onAbort);
    controller.abort();
  }
}
