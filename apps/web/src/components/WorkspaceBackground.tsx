import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import type { ChatBackground } from "../lib/chat-appearance";
import { useAppearanceImage, useChatAppearance } from "../lib/chat-appearance";

export function ConversationBackgroundLayer({
  background,
}: {
  background: ChatBackground | undefined;
}) {
  const url = useAppearanceImage(background?.image);
  if (!background || !url) return null;
  return (
    <div
      aria-hidden="true"
      data-testid="conversation-background-layer"
      className="conversation-background"
      style={
        {
          "--workspace-background-image": `url("${url}")`,
          "--workspace-background-fit": background.fit,
          "--workspace-background-opacity": background.opacity / 100,
          "--workspace-background-overlay": (background.overlay * background.opacity) / 10_000,
        } as CSSProperties
      }
    >
      <img
        alt=""
        src={url}
        style={{ objectFit: background.fit, opacity: background.opacity / 100 }}
      />
      <div style={{ opacity: (background.overlay * background.opacity) / 10_000 }} />
    </div>
  );
}

export function WorkspaceBackground() {
  const appearance = useChatAppearance();
  const background =
    appearance.mode === "simple"
      ? undefined
      : appearance.backgrounds.find((item) => item.id === appearance.backgroundId);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!background?.image || typeof URL.createObjectURL !== "function") {
      setUrl(null);
      return;
    }
    try {
      const nextUrl = URL.createObjectURL(background.image);
      setUrl(nextUrl);
      return () => URL.revokeObjectURL(nextUrl);
    } catch {
      setUrl(null);
    }
  }, [background?.image]);

  useEffect(() => {
    const root = document.documentElement;
    if (!background || !url) return;
    root.dataset.workspaceBackground = "true";
    root.style.setProperty("--workspace-background-image", `url("${url}")`);
    root.style.setProperty("--workspace-background-fit", background.fit);
    root.style.setProperty("--workspace-background-opacity", String(background.opacity / 100));
    root.style.setProperty(
      "--workspace-background-overlay",
      String((background.overlay * background.opacity) / 10_000),
    );
    return () => {
      delete root.dataset.workspaceBackground;
      root.style.removeProperty("--workspace-background-image");
      root.style.removeProperty("--workspace-background-fit");
      root.style.removeProperty("--workspace-background-opacity");
      root.style.removeProperty("--workspace-background-overlay");
    };
  }, [background, url]);

  if (!background || !url) return null;
  return (
    <div data-testid="workspace-background" aria-hidden="true" className="workspace-background">
      <img
        alt=""
        src={url}
        style={{ objectFit: background.fit, opacity: background.opacity / 100 }}
      />
      <div style={{ opacity: (background.overlay * background.opacity) / 10_000 }} />
    </div>
  );
}
