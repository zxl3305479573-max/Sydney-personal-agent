import { useLingui } from "@lingui/react/macro";
import type { PersonalityPreset, PersonalitySelection } from "@rakazo/contracts";
import {
  BOT_INSTRUCTIONS_MAX_LENGTH,
  PERSONALITY_CATALOG,
  renderPersonalitySelections,
} from "@rakazo/contracts";
import { useState } from "react";
import { personalityCatalogLabel } from "../lib/personality-catalog-zh";
import { rpc } from "../lib/rpc";
import { errorText } from "../lib/user-error";

export function PersonalPersonalityLibrary({
  onApply,
  disabled,
}: {
  onApply: (instructions: string, name: string) => void;
  disabled?: boolean;
}) {
  const { i18n } = useLingui();
  const chinese = i18n.locale !== "en";
  const label = (item: (typeof PERSONALITY_CATALOG)[number]) =>
    personalityCatalogLabel(item, chinese ? "zh-CN" : "en");
  const text = (zh: string, en: string) => (chinese ? zh : en);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PersonalityPreset[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [selections, setSelections] = useState<PersonalitySelection[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("personality");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    setError("");
    try {
      setItems(await rpc.personalities.list());
    } catch (failure) {
      setError(errorText(failure, text("人格库加载失败", "Could not load personalities")));
    }
  }
  function clear() {
    setEditing(null);
    setName("");
    setDescription("");
    setInstructions("");
    setSelections([]);
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const input = { name, description, instructions, selections };
      if (editing) await rpc.personalities.update({ ...input, personalityId: editing });
      else await rpc.personalities.create(input);
      clear();
      await refresh();
    } catch (failure) {
      setError(
        errorText(failure, text("保存失败，请检查名称和属性", "Could not save personality")),
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(item: PersonalityPreset) {
    if (
      !window.confirm(
        text(
          `删除人格“${item.name}”？已使用的 Bot 不受影响。`,
          `Delete "${item.name}"? Existing bots will not change.`,
        ),
      )
    )
      return;
    setBusy(true);
    try {
      await rpc.personalities.remove({ personalityId: item.id });
      if (editing === item.id) clear();
      await refresh();
    } catch (failure) {
      setError(errorText(failure, text("删除失败", "Could not delete personality")));
    } finally {
      setBusy(false);
    }
  }
  let preview = "";
  let invalidSelection = false;
  try {
    renderPersonalitySelections(selections);
    preview = selections
      .map((selection) => {
        const item = PERSONALITY_CATALOG.find((entry) => entry.id === selection.attributeId);
        const weights = {
          mild: text("轻度", "Mild"),
          moderate: text("适度", "Moderate"),
          strong: text("明显", "Strong"),
        };
        return `${item ? label(item) : selection.attributeId} · ${weights[selection.weight]}`;
      })
      .join("\n");
  } catch {
    invalidSelection = true;
    preview = text(
      "选择的属性存在冲突，请调整后保存。",
      "These attributes conflict. Adjust your selection.",
    );
  }
  const matches = PERSONALITY_CATALOG.filter(
    (item) =>
      item.category === category &&
      `${label(item)} ${item.name} ${item.slug} ${item.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-2 text-sm">
      <button
        type="button"
        className="rounded-lg border px-3 py-2"
        disabled={disabled}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void refresh();
        }}
      >
        {text("我的人格库", "My personalities")}
      </button>
      {open && (
        <div className="space-y-3 rounded-xl border p-3">
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => onApply(item.instructions, item.name)}
                className="rounded-lg border px-2 py-1"
              >
                {item.name}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditing(item.id);
                  setName(item.name);
                  setDescription(item.description);
                  setInstructions(item.customInstructions);
                  setSelections(item.selections);
                }}
              >
                {text("编辑", "Edit")}
              </button>
              <button type="button" disabled={busy} onClick={() => void remove(item)}>
                {text("删除", "Delete")}
              </button>
            </div>
          ))}
          <p>
            {editing
              ? text("编辑人格", "Edit personality")
              : text("创建人格", "Create personality")}
          </p>
          <label className="block">
            {text("名称", "Name")}
            <input
              className="w-full rounded-lg border bg-transparent p-2"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="block">
            {text("描述", "Description")}
            <input
              className="w-full rounded-lg border bg-transparent p-2"
              value={description}
              maxLength={500}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label className="block">
            {text("Hersona 属性分类", "Hersona category")}
            <select
              className="w-full rounded-lg border bg-background p-2"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="personality">{text("性格", "Personality")}</option>
              <option value="speech">{text("语气", "Speech")}</option>
              <option value="archetype">{text("角色", "Role")}</option>
              <option value="hobby">{text("兴趣", "Interests")}</option>
            </select>
          </label>
          <input
            aria-label={text("搜索属性", "Search attributes")}
            placeholder={text("搜索属性", "Search attributes")}
            className="w-full rounded-lg border bg-transparent p-2"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            aria-label={text("添加属性", "Add attribute")}
            className="w-full rounded-lg border bg-background p-2"
            value=""
            onChange={(event) => {
              if (
                event.target.value &&
                selections.length < 12 &&
                !selections.some((item) => item.attributeId === event.target.value)
              )
                setSelections([
                  ...selections,
                  { attributeId: event.target.value, weight: "moderate" },
                ]);
            }}
          >
            <option value="">
              {text("选择属性（最多 12 项）", "Choose an attribute (up to 12)")}
            </option>
            {matches.map((item) => (
              <option key={item.id} value={item.id} title={chinese ? undefined : item.description}>
                {label(item)}
              </option>
            ))}
          </select>
          {selections.map((selection) => (
            <div key={selection.attributeId} className="flex items-center gap-2">
              <span>
                {(() => {
                  const item = PERSONALITY_CATALOG.find(
                    (entry) => entry.id === selection.attributeId,
                  );
                  return item ? label(item) : selection.attributeId;
                })()}
              </span>
              <select
                aria-label={text("属性强度", "Intensity")}
                className="rounded border bg-background"
                value={selection.weight}
                onChange={(event) =>
                  setSelections(
                    selections.map((item) =>
                      item.attributeId === selection.attributeId
                        ? { ...item, weight: event.target.value as PersonalitySelection["weight"] }
                        : item,
                    ),
                  )
                }
              >
                <option value="mild">{text("轻度", "Mild")}</option>
                <option value="moderate">{text("适度", "Moderate")}</option>
                <option value="strong">{text("明显", "Strong")}</option>
              </select>
              <button
                type="button"
                onClick={() =>
                  setSelections(
                    selections.filter((item) => item.attributeId !== selection.attributeId),
                  )
                }
              >
                {text("移除", "Remove")}
              </button>
            </div>
          ))}
          {preview && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs">{preview}</pre>
          )}
          <label className="block">
            {text("自定义表达风格", "Custom speaking style")}
            <textarea
              className="min-h-20 w-full rounded-lg border bg-transparent p-2"
              value={instructions}
              maxLength={BOT_INSTRUCTIONS_MAX_LENGTH}
              onChange={(event) => setInstructions(event.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg border px-3 py-1"
              disabled={
                busy ||
                invalidSelection ||
                !name.trim() ||
                (!selections.length && !instructions.trim())
              }
              onClick={() => void save()}
            >
              {text("保存", "Save")}
            </button>
            {editing && (
              <button type="button" onClick={clear}>
                {text("取消编辑", "Cancel edit")}
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {text(
              "人格只调整表达风格，不改变小伙伴的职责；编辑或删除模板不会改变已应用的人格。",
              "Personalities adjust speaking style without changing duties. Editing or deleting a template does not change existing bots.",
            )}
          </p>
        </div>
      )}
    </div>
  );
}
