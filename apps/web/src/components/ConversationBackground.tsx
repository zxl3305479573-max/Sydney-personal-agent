import { useState } from "react";
import {
  getSavedChatAppearance,
  loadChatAppearance,
  saveChatAppearance,
  useChatAppearance,
  validateBackgroundImage,
} from "../lib/chat-appearance";

export function ConversationBackgroundSettings({ chatKey }: { chatKey: string }) {
  const appearance = useChatAppearance();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function update(backgroundId: string, file?: File) {
    setBusy(true);
    setError("");
    try {
      await loadChatAppearance();
      if (file) await validateBackgroundImage(file);
      const saved = getSavedChatAppearance();
      if (file && saved.backgrounds.length >= 100) throw new Error("最多添加 100 张背景图片");
      const id = file ? crypto.randomUUID() : backgroundId;
      const chatBackgrounds = { ...saved.chatBackgrounds };
      if (id) chatBackgrounds[chatKey] = id;
      else delete chatBackgrounds[chatKey];
      await saveChatAppearance({
        ...saved,
        chatBackgrounds,
        backgrounds: file
          ? [
              ...saved.backgrounds,
              {
                id,
                name: file.name.slice(0, 80),
                image: file,
                fit: "cover",
                opacity: 100,
                overlay: 30,
              },
            ]
          : saved.backgrounds,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存背景失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-5 space-y-2" aria-label="当前对话背景">
      <label className="block font-medium" htmlFor="conversation-background">
        当前对话背景
      </label>
      <div className="flex flex-wrap gap-2">
        <select
          id="conversation-background"
          className="rounded-md border border-border bg-background px-2 py-2 text-foreground"
          value={appearance.chatBackgrounds?.[chatKey] ?? ""}
          disabled={busy}
          onChange={(event) => void update(event.target.value)}
        >
          <option value="">跟随全局背景</option>
          {appearance.backgrounds.map((background) => (
            <option key={background.id} value={background.id}>
              {background.name}
            </option>
          ))}
        </select>
        <label className="cursor-pointer rounded-md border border-border bg-background px-2 py-2">
          上传图片
          <input
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void update("", file);
            }}
          />
        </label>
      </div>
      <p className="text-sm text-muted-foreground">仅影响当前对话，保存在当前浏览器。</p>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
