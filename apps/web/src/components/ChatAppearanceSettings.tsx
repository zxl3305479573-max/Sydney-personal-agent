import { SegmentedControl } from "@rakazo/ui-web";
import { useEffect, useRef, useState } from "react";
import type {
  BubbleSide,
  ChatAppearance,
  ChatBubbleStyle,
} from "../lib/chat-appearance";
import {
  cancelChatAppearancePreview,
  EMPTY_CHAT_APPEARANCE,
  getSavedChatAppearance,
  loadChatAppearance,
  newBubbleStyle,
  normalizeAppearance,
  previewChatAppearance,
  saveChatAppearance,
  useAppearanceImage,
  validateBackgroundImage,
} from "../lib/chat-appearance";
import { AppearanceColorPicker } from "./AppearanceColorPicker";
import { SettingsGroup } from "./SettingsRows";

const fieldClass =
  "rounded-md border border-border bg-background px-2 py-1 text-foreground";

function AppearancePreview({ appearance }: { appearance: ChatAppearance }) {
  const background =
    appearance.mode === "simple"
      ? undefined
      : appearance.backgrounds.find(
          (item) => item.id === appearance.backgroundId,
        );
  const bubble =
    appearance.mode === "simple"
      ? undefined
      : appearance.bubbles.find((item) => item.id === appearance.bubbleId);
  const userImage = useAppearanceImage(bubble?.user.image);
  const botImage = useAppearanceImage(bubble?.bot.image);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!background || typeof URL.createObjectURL !== "function") {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(background.image);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [background?.image]);
  const bubbleStyle = (side: BubbleSide | undefined, image: string | null) =>
    side
      ? {
          backgroundColor: `${side.background}${Math.round(side.opacity * 2.55)
            .toString(16)
            .padStart(2, "0")}`,
          color: side.foreground,
          borderRadius: side.radius,
          boxShadow: `inset 0 0 0 1px ${side.border}`,
          backgroundImage: image ? `url("${image}")` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : undefined;
  return (
    <section
      aria-label="聊天外观预览"
      className="relative overflow-hidden rounded-lg border border-border bg-background p-4"
    >
      {background && url ? (
        <div aria-hidden="true" className="absolute inset-0">
          <img
            alt=""
            src={url}
            className="size-full"
            style={{
              objectFit: background.fit,
              opacity: background.opacity / 100,
            }}
          />
          <div
            className="absolute inset-0 bg-black"
            style={{ opacity: background.overlay / 100 }}
          />
        </div>
      ) : null}
      <div className="relative flex flex-col gap-2">
        <span
          className="rk-chat-type self-end rounded-[20px] bg-chat-user px-4 py-2 text-chat-user-foreground"
          style={bubbleStyle(bubble?.user, userImage)}
        >
          你好，这是我的消息。
        </span>
        <span
          className="rk-chat-type self-start rounded-[20px] bg-muted px-4 py-2 text-foreground"
          style={bubbleStyle(bubble?.bot, botImage)}
        >
          你好，这是助手的回复。
        </span>
      </div>
    </section>
  );
}

function BubbleEditor({
  label,
  value,
  onChange,
  onError,
}: {
  label: string;
  value: BubbleSide;
  onChange: (value: BubbleSide) => void;
  onError: (message: string) => void;
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
      <legend className="px-1">{label}</legend>
      <label className={`${fieldClass} cursor-pointer`}>
        上传气泡图片
        <input
          className="sr-only"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file)
              void validateBackgroundImage(file)
                .then(() => {
                  onChange({ ...value, image: file });
                  onError("");
                })
                .catch((caught: unknown) =>
                  onError(
                    caught instanceof Error ? caught.message : "无法读取图片",
                  ),
                );
          }}
        />
      </label>
      {value.image ? (
        <button
          type="button"
          className={fieldClass}
          onClick={() => onChange({ ...value, image: undefined })}
        >
          移除气泡图片
        </button>
      ) : null}
      <AppearanceColorPicker
        label={`${label}背景`}
        value={value.background}
        onChange={(background) => onChange({ ...value, background })}
        contrastWith={value.opacity === 100 && !value.image ? value.foreground : undefined}
      />
      <AppearanceColorPicker
        label={`${label}文字`}
        value={value.foreground}
        onChange={(foreground) => onChange({ ...value, foreground })}
        contrastWith={value.opacity === 100 && !value.image ? value.background : undefined}
      />
      <AppearanceColorPicker
        label={`${label}边框`}
        value={value.border}
        onChange={(border) => onChange({ ...value, border })}
      />
      <label>
        不透明度{" "}
        <input
          type="range"
          min="20"
          max="100"
          value={value.opacity}
          onChange={(event) =>
            onChange({ ...value, opacity: Number(event.target.value) })
          }
        />{" "}
        {value.opacity}%
      </label>
      <label>
        圆角{" "}
        <input
          type="range"
          min="0"
          max="32"
          value={value.radius}
          onChange={(event) =>
            onChange({ ...value, radius: Number(event.target.value) })
          }
        />{" "}
        {value.radius}px
      </label>
    </fieldset>
  );
}

export function ChatAppearanceSettings() {
  const [draft, setDraft] = useState<ChatAppearance>(EMPTY_CHAT_APPEARANCE);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [combinationName, setCombinationName] = useState("");
  const mounted = useRef(false);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    void loadChatAppearance()
      .then(() => {
        if (active) {
          setDraft(getSavedChatAppearance());
          setReady(true);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error &&
              caught.message === "已保存的聊天外观数据无效"
              ? "已保存的聊天外观数据无效，当前显示默认外观；保存将覆盖损坏的数据。"
              : "无法读取浏览器本地存储，请检查浏览器设置。",
          );
          setReady(true);
        }
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

  const background = draft.backgrounds.find(
    (item) => item.id === draft.backgroundId,
  );
  const bubble = draft.bubbles.find((item) => item.id === draft.bubbleId);
  function changeBubble(next: ChatBubbleStyle) {
    change({
      ...draft,
      bubbles: draft.bubbles.map((item) => (item.id === next.id ? next : item)),
    });
  }

  async function addBackground(file: File) {
    try {
      if (draft.backgrounds.length >= 100)
        throw new Error("最多添加 100 张背景图片");
      await validateBackgroundImage(file);
      if (!mounted.current) return;
      const id = crypto.randomUUID();
      change({
        ...draft,
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
      if (mounted.current)
        setError(caught instanceof Error ? caught.message : "无法读取图片");
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

  return (
    <SettingsGroup title="聊天外观">
      <div
        className="space-y-4 p-4 text-sm"
        data-testid="chat-appearance-settings"
      >
        <p className="text-muted-foreground">
          背景和气泡可以分别搭配；图片只保存在当前浏览器。
        </p>
        <AppearancePreview appearance={draft} />
        <fieldset disabled={!ready || saving} className="space-y-4">
          <div className="space-y-2">
            <p className="font-medium">外观模式</p>
            <SegmentedControl
              label="外观模式"
              value={
                draft.mode === "custom" ||
                (!draft.mode && !!(draft.backgroundId || draft.bubbleId))
                  ? "custom"
                  : "simple"
              }
              onValueChange={(mode) =>
                change({ ...draft, mode: mode === "custom" ? "custom" : "simple" })
              }
              options={[
                { value: "simple", label: "简洁默认" },
                { value: "custom", label: "自定义" },
              ]}
            />
            <p className="text-muted-foreground">
              切换至简洁默认会保留自定义素材和搭配。更改后请保存外观。
            </p>
          </div>
          <div className="space-y-2">
            <label className="block font-medium" htmlFor="chat-background">
              聊天背景
            </label>
            <div className="flex flex-wrap gap-2">
              <select
                id="chat-background"
                className={fieldClass}
                value={draft.backgroundId ?? ""}
                onChange={(event) =>
                  change({ ...draft, backgroundId: event.target.value || null })
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
                      backgrounds: draft.backgrounds.filter(
                        (item) => item.id !== background.id,
                      ),
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
                      change({
                        ...draft,
                        backgrounds: draft.backgrounds.map((item) =>
                          item.id === background.id
                            ? {
                                ...item,
                                fit: event.target.value as "cover" | "contain",
                              }
                            : item,
                        ),
                      })
                    }
                  >
                    <option value="cover">填满</option>
                    <option value="contain">完整显示</option>
                  </select>
                </label>
                <label>
                  图片不透明度{" "}
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={background.opacity}
                    onChange={(event) =>
                      change({
                        ...draft,
                        backgrounds: draft.backgrounds.map((item) =>
                          item.id === background.id
                            ? { ...item, opacity: Number(event.target.value) }
                            : item,
                        ),
                      })
                    }
                  />{" "}
                  {background.opacity}%
                </label>
                <label>
                  暗色遮罩{" "}
                  <input
                    type="range"
                    min="0"
                    max="80"
                    value={background.overlay}
                    onChange={(event) =>
                      change({
                        ...draft,
                        backgrounds: draft.backgrounds.map((item) =>
                          item.id === background.id
                            ? { ...item, overlay: Number(event.target.value) }
                            : item,
                        ),
                      })
                    }
                  />{" "}
                  {background.overlay}%
                </label>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="block font-medium" htmlFor="chat-bubble-style">
              气泡样式
            </label>
            <div className="flex flex-wrap gap-2">
              <select
                id="chat-bubble-style"
                className={fieldClass}
                value={draft.bubbleId ?? ""}
                onChange={(event) =>
                  change({ ...draft, bubbleId: event.target.value || null })
                }
              >
                <option value="">默认气泡</option>
                {draft.bubbles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={fieldClass}
                disabled={draft.bubbles.length >= 100}
                onClick={() => {
                  const item = newBubbleStyle();
                  change({
                    ...draft,
                    bubbles: [...draft.bubbles, item],
                    bubbleId: item.id,
                  });
                }}
              >
                添加样式
              </button>
              {bubble ? (
                <button
                  type="button"
                  className={fieldClass}
                  onClick={() =>
                    change({
                      ...draft,
                      bubbles: draft.bubbles.filter(
                        (item) => item.id !== bubble.id,
                      ),
                      bubbleId: null,
                    })
                  }
                >
                  删除样式
                </button>
              ) : null}
            </div>
            {bubble ? (
              <>
                <label className="block">
                  样式名称{" "}
                  <input
                    className={fieldClass}
                    maxLength={80}
                    value={bubble.name}
                    onChange={(event) =>
                      changeBubble({ ...bubble, name: event.target.value })
                    }
                  />
                </label>
                <BubbleEditor
                  label="我的气泡"
                  value={bubble.user}
                  onChange={(user) => changeBubble({ ...bubble, user })}
                  onError={setError}
                />
                <BubbleEditor
                  label="助手气泡"
                  value={bubble.bot}
                  onChange={(bot) => changeBubble({ ...bubble, bot })}
                  onError={setError}
                />
                <p className="text-muted-foreground">
                  请检查文字和背景的对比度，确保消息清晰可读。
                </p>
              </>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="block font-medium" htmlFor="chat-combination">
              外观搭配
            </label>
            <div className="flex flex-wrap gap-2">
              <select
                id="chat-combination"
                className={fieldClass}
                value=""
                onChange={(event) => {
                  const item = draft.combinations.find(
                    (entry) => entry.id === event.target.value,
                  );
                  if (item)
                    change({
                      ...draft,
                      backgroundId: item.backgroundId,
                      bubbleId: item.bubbleId,
                    });
                }}
              >
                <option value="">选择已保存的搭配</option>
                {draft.combinations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <input
                aria-label="搭配名称"
                className={fieldClass}
                value={combinationName}
                maxLength={80}
                placeholder="搭配名称"
                onChange={(event) => setCombinationName(event.target.value)}
              />
              <button
                type="button"
                className={fieldClass}
                disabled={
                  !combinationName.trim() || draft.combinations.length >= 100
                }
                onClick={() => {
                  change({
                    ...draft,
                    combinations: [
                      ...draft.combinations,
                      {
                        id: crypto.randomUUID(),
                        name: combinationName.trim(),
                        backgroundId: draft.backgroundId,
                        bubbleId: draft.bubbleId,
                      },
                    ],
                  });
                  setCombinationName("");
                }}
              >
                保存当前搭配
              </button>
            </div>
            {draft.combinations.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <input
                  aria-label={`重命名搭配 ${item.name}`}
                  className={fieldClass}
                  maxLength={80}
                  value={item.name}
                  onChange={(event) =>
                    change({
                      ...draft,
                      combinations: draft.combinations.map((entry) =>
                        entry.id === item.id
                          ? { ...entry, name: event.target.value }
                          : entry,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className={fieldClass}
                  onClick={() =>
                    change({
                      ...draft,
                      combinations: draft.combinations.filter(
                        (entry) => entry.id !== item.id,
                      ),
                    })
                  }
                >
                  删除搭配
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={fieldClass}
              onClick={() => void save()}
            >
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
              onClick={() => change({ ...draft, mode: "simple" })}
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
