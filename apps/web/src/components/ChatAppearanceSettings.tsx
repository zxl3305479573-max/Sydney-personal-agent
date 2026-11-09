import { useEffect, useRef, useState } from "react";
import type { ChatAppearance } from "../lib/chat-appearance";
import {
  cancelChatAppearancePreview,
  DEFAULT_TEXT_COLOR_PICKER_VALUE,
  EMPTY_CHAT_APPEARANCE,
  getSavedChatAppearance,
  loadChatAppearance,
  normalizeAppearance,
  previewChatAppearance,
  saveChatAppearance,
  useAppearanceImage,
  validateBackgroundImage,
} from "../lib/chat-appearance";
import { AppearanceColorPicker } from "./AppearanceColorPicker";
import { SettingsGroup } from "./SettingsRows";

const fieldClass = "rounded-md border border-border bg-background px-2 py-1 text-foreground";

export function ChatAppearanceSettings() {
  const [draft, setDraft] = useState<ChatAppearance>(EMPTY_CHAT_APPEARANCE);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const mounted = useRef(false);
  const background =
    draft.mode === "simple"
      ? undefined
      : draft.backgrounds.find((item) => item.id === draft.backgroundId);
  const selectedBackground = draft.backgrounds.find((item) => item.id === draft.backgroundId);
  const backgroundUrl = useAppearanceImage(background?.image);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    void loadChatAppearance()
      .then(() => {
        if (active) setDraft(getSavedChatAppearance());
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof Error && caught.message === "已保存的聊天外观数据无效"
              ? "已保存的聊天外观数据无效，当前显示默认外观；保存将覆盖损坏的数据。"
              : "无法读取浏览器本地存储，请检查浏览器设置。",
          );
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
      mounted.current = false;
      cancelChatAppearancePreview();
    };
  }, []);

  function change(next: ChatAppearance) {
    const normalized = normalizeAppearance(next);
    setDraft(normalized);
    setMessage("");
    previewChatAppearance(normalized);
  }

  async function addBackground(file: File) {
    try {
      if (draft.backgrounds.length >= 100) throw new Error("最多添加 100 张背景图片");
      await validateBackgroundImage(file);
      if (!mounted.current) return;
      const id = crypto.randomUUID();
      change({
        ...draft,
        mode: "custom",
        backgrounds: [
          ...draft.backgrounds,
          {
            id,
            name: file.name.slice(0, 80),
            image: file,
            fit: "cover",
            opacity: 100,
            overlay: 30,
          },
        ],
        backgroundId: id,
      });
      setError("");
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error ? caught.message : "无法读取图片");
    }
  }

  async function save() {
    setSaving(true);
    try {
      await saveChatAppearance(draft);
      setError("");
      setMessage("聊天外观已保存到当前浏览器。");
    } catch {
      setError("保存失败：浏览器存储不可用或空间不足，当前预览尚未保存。");
    } finally {
      setSaving(false);
    }
  }

  function updateBackground(values: Partial<NonNullable<typeof selectedBackground>>) {
    if (!selectedBackground) return;
    change({
      ...draft,
      mode: "custom",
      backgrounds: draft.backgrounds.map((item) =>
        item.id === selectedBackground.id ? { ...item, ...values } : item,
      ),
    });
  }

  return (
    <SettingsGroup title="聊天外观">
      <div className="space-y-4 p-4 text-sm" data-testid="chat-appearance-settings">
        <p className="text-muted-foreground">背景图片和文字颜色只保存在当前浏览器。</p>
        <section
          aria-label="聊天外观预览"
          className="relative overflow-hidden rounded-lg border border-border bg-background p-4"
        >
          {background && backgroundUrl ? (
            <div aria-hidden="true" className="absolute inset-0">
              <img
                alt=""
                src={backgroundUrl}
                className="size-full"
                style={{ objectFit: background.fit, opacity: background.opacity / 100 }}
              />
              <div
                className="absolute inset-0 bg-black"
                style={{ opacity: (background.overlay * background.opacity) / 10_000 }}
              />
            </div>
          ) : null}
          <div className="relative flex flex-col gap-2">
            <span
              className="rk-chat-type self-end text-foreground"
              style={{ color: draft.userTextColor ?? undefined }}
            >
              你好，这是我的消息。
            </span>
            <span
              className="rk-chat-type self-start text-foreground"
              style={{ color: draft.botTextColor ?? undefined }}
            >
              你好，这是助手的回复。
            </span>
          </div>
        </section>
        <fieldset disabled={!ready || saving} className="space-y-4">
          <div className="space-y-2">
            <label className="block font-medium" htmlFor="chat-background">
              全局背景
            </label>
            <div className="flex flex-wrap gap-2">
              <select
                id="chat-background"
                className={fieldClass}
                value={draft.mode === "simple" ? "" : (draft.backgroundId ?? "")}
                onChange={(event) =>
                  change({ ...draft, mode: "custom", backgroundId: event.target.value || null })
                }
              >
                <option value="">默认背景</option>
                {draft.backgrounds.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <label className={`${fieldClass} cursor-pointer`}>
                添加图片
                <input
                  className="sr-only"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void addBackground(file);
                  }}
                />
              </label>
              {background ? (
                <button
                  type="button"
                  className={fieldClass}
                  onClick={() =>
                    change({
                      ...draft,
                      backgrounds: draft.backgrounds.filter((item) => item.id !== background.id),
                      backgroundId: null,
                    })
                  }
                >
                  删除背景
                </button>
              ) : null}
            </div>
            {background ? (
              <div className="flex flex-wrap items-center gap-3">
                <label>
                  显示方式{" "}
                  <select
                    className={fieldClass}
                    value={background.fit}
                    onChange={(event) =>
                      updateBackground({ fit: event.target.value as "cover" | "contain" })
                    }
                  >
                    <option value="cover">填满</option>
                    <option value="contain">完整显示</option>
                  </select>
                </label>
                <label>
                  背景透明度{" "}
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={100 - background.opacity}
                    onChange={(event) =>
                      updateBackground({ opacity: 100 - Number(event.target.value) })
                    }
                  />{" "}
                  {100 - background.opacity}%
                </label>
                <label>
                  暗色遮罩{" "}
                  <input
                    type="range"
                    min="0"
                    max="80"
                    value={background.overlay}
                    onChange={(event) => updateBackground({ overlay: Number(event.target.value) })}
                  />{" "}
                  {background.overlay}%
                </label>
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <p className="font-medium">文字颜色</p>
            <div className="flex flex-wrap items-center gap-3">
              <AppearanceColorPicker
                label="我的文字"
                value={draft.userTextColor ?? DEFAULT_TEXT_COLOR_PICKER_VALUE}
                onChange={(userTextColor) => change({ ...draft, userTextColor })}
              />
              <button
                type="button"
                className={fieldClass}
                onClick={() => change({ ...draft, userTextColor: null })}
              >
                我的文字恢复默认
              </button>
              <AppearanceColorPicker
                label="助手文字"
                value={draft.botTextColor ?? DEFAULT_TEXT_COLOR_PICKER_VALUE}
                onChange={(botTextColor) => change({ ...draft, botTextColor })}
              />
              <button
                type="button"
                className={fieldClass}
                onClick={() => change({ ...draft, botTextColor: null })}
              >
                助手文字恢复默认
              </button>
            </div>
            <p className="text-muted-foreground">请检查文字与背景的对比度，确保消息清晰可读。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={fieldClass} onClick={() => void save()}>
              保存外观
            </button>
            <button
              type="button"
              className={fieldClass}
              onClick={() => {
                cancelChatAppearancePreview();
                setDraft(getSavedChatAppearance());
                setMessage("");
              }}
            >
              取消预览
            </button>
            <button
              type="button"
              className={fieldClass}
              onClick={() =>
                change({
                  ...draft,
                  mode: "custom",
                  backgroundId: null,
                  userTextColor: null,
                  botTextColor: null,
                })
              }
            >
              恢复默认
            </button>
          </div>
        </fieldset>
        {message ? <p role="status">{message}</p> : null}
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </SettingsGroup>
  );
}
