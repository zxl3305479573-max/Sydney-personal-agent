import type {
  PersonalityAttributeCategory,
  PersonalityPreset,
  PersonalitySelection,
} from "@rakazo/contracts";
import {
  BOT_INSTRUCTIONS_MAX_LENGTH,
  PERSONALITY_CATALOG,
  personalityCatalogLabel,
  renderPersonalitySelections,
} from "@rakazo/contracts";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { captureApiRequestContext, rpc } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { errorText } from "../lib/user-error";

const categories: readonly [PersonalityAttributeCategory, string, string][] = [
  ["personality", "性格", "Personality"],
  ["speech", "语气", "Speech"],
  ["archetype", "角色", "Role"],
  ["hobby", "兴趣", "Interests"],
];
const weights: readonly [PersonalitySelection["weight"], string, string][] = [
  ["mild", "轻度", "Mild"],
  ["moderate", "适度", "Moderate"],
  ["strong", "明显", "Strong"],
];

export function PersonalPersonalityLibrary({
  current,
  disabled,
  selectedId,
  onSelect,
  onSaved,
  onRemoved,
  onBusyChange,
}: {
  current: () => boolean;
  disabled: boolean;
  selectedId?: string;
  onSelect: (item: PersonalityPreset) => void;
  onSaved: (item: PersonalityPreset) => void;
  onRemoved: (id: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const tokens = useMobileTokens();
  const { locale } = useI18n();
  const text = (chinese: string, english: string) => locale.startsWith("zh") ? chinese : english;
  const [items, setItems] = useState<PersonalityPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [category, setCategory] = useState<PersonalityAttributeCategory>("personality");
  const [search, setSearch] = useState("");
  const [selections, setSelections] = useState<PersonalitySelection[]>([]);
  const mounted = useRef(false);
  const working = useRef(false);
  const readVersion = useRef(0);
  const label = (item: (typeof PERSONALITY_CATALOG)[number]) =>
    personalityCatalogLabel(item, locale.startsWith("zh") ? "zh-CN" : "en");

  async function refresh() {
    if (!current()) {
      setLoading(false);
      setError(text("工作区已改变，请关闭后重新打开。", "The workspace changed. Close and reopen."));
      return;
    }
    const version = ++readVersion.current;
    setLoading(true);
    setError(null);
    try {
      const requestContext = await captureApiRequestContext();
      if (!current()) {
        if (mounted.current && readVersion.current === version)
          setError(text("工作区已改变，请关闭后重新打开。", "The workspace changed. Close and reopen."));
        return;
      }
      const next = await rpc("personalities/list", undefined, {
        requestContext,
        skipSpaceAuthRecovery: true,
      });
      if (mounted.current && readVersion.current === version) {
        if (current()) setItems(next);
        else setError(text("工作区已改变，请关闭后重新打开。", "The workspace changed. Close and reopen."));
      }
    } catch (cause) {
      if (mounted.current && current() && readVersion.current === version)
        setError(errorText(cause, text("人格库加载失败", "Could not load personalities")));
    } finally {
      if (mounted.current && readVersion.current === version) setLoading(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; readVersion.current += 1; };
  }, []);

  function resetEditor() {
    setEditing(null);
    setShowEditor(false);
    setName("");
    setDescription("");
    setInstructions("");
    setSelections([]);
    setSearch("");
    setCategory("personality");
  }

  function edit(item?: PersonalityPreset) {
    setEditing(item?.id ?? null);
    setName(item?.name ?? "");
    setDescription(item?.description ?? "");
    setInstructions(item?.customInstructions ?? "");
    setSelections(item?.selections ?? []);
    setSearch("");
    setShowEditor(true);
    setError(null);
  }

  let generated = "";
  let invalid = false;
  try {
    generated = renderPersonalitySelections(selections);
  } catch {
    invalid = true;
  }
  const combinedLength = [generated, instructions.trim()].filter(Boolean).join("\n\n").length;
  const canSave =
    name.trim().length > 0 &&
    combinedLength > 0 &&
    combinedLength <= BOT_INSTRUCTIONS_MAX_LENGTH &&
    !invalid;

  async function save() {
    if (working.current || disabled || !canSave || !current()) return;
    readVersion.current += 1;
    setLoading(false);
    working.current = true;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    try {
      const requestContext = await captureApiRequestContext();
      if (!current()) return;
      const options = { requestContext, skipSpaceAuthRecovery: true };
      const value = {
        name: name.trim(),
        description: description.trim(),
        instructions: instructions.trim(),
        selections,
      };
      const saved = editing
        ? await rpc("personalities/update", { ...value, personalityId: editing }, options)
        : await rpc("personalities/create", value, options);
      if (!mounted.current) return;
      if (!current()) {
        setError(text("工作区已改变，保存结果可能已生效；请关闭后重新查看。", "The workspace changed. The save may have completed; close and check again."));
        return;
      }
      setItems((old) => [saved, ...old.filter((item) => item.id !== saved.id)]);
      onSaved(saved);
      resetEditor();
    } catch (cause) {
      if (mounted.current)
        setError(current()
          ? errorText(cause, text("无法保存人格，请重新加载确认结果。", "Could not save personality. Reload to check the result."))
          : text("工作区已改变，保存结果可能已生效；请关闭后重新查看。", "The workspace changed. The save may have completed; close and check again."));
    } finally {
      working.current = false;
      if (mounted.current) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  }

  async function remove(item: PersonalityPreset) {
    if (working.current || disabled || !current()) return;
    readVersion.current += 1;
    setLoading(false);
    working.current = true;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    try {
      const requestContext = await captureApiRequestContext();
      if (!current()) return;
      await rpc("personalities/remove", { personalityId: item.id }, {
        requestContext,
        skipSpaceAuthRecovery: true,
      });
      if (!mounted.current) return;
      if (!current()) {
        setError(text("工作区已改变，删除结果可能已生效；请关闭后重新查看。", "The workspace changed. The deletion may have completed; close and check again."));
        return;
      }
      setItems((old) => old.filter((entry) => entry.id !== item.id));
      if (editing === item.id) resetEditor();
      onRemoved(item.id);
    } catch (cause) {
      if (mounted.current)
        setError(current()
          ? errorText(cause, text("无法删除人格，请重新加载确认结果。", "Could not delete personality. Reload to check the result."))
          : text("工作区已改变，删除结果可能已生效；请关闭后重新查看。", "The workspace changed. The deletion may have completed; close and check again."));
    } finally {
      working.current = false;
      if (mounted.current) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  }

  function confirmRemove(item: PersonalityPreset) {
    Alert.alert(
      text(`删除人格“${item.name}”？`, `Delete "${item.name}"?`),
      text("已使用该人格的 Bot 不受影响。", "Existing bots will not change."),
      [
        { text: text("取消", "Cancel"), style: "cancel" },
        { text: text("删除", "Delete"), style: "destructive", onPress: () => void remove(item) },
      ],
    );
  }

  const inputStyle = {
    color: tokens.foreground,
    borderColor: tokens.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  };
  const action = (title: string, onPress: () => void, inactive = false) => (
    <Pressable accessibilityRole="button" disabled={disabled || busy || inactive}
      onPress={onPress} style={{ paddingVertical: 8, paddingHorizontal: 10 }}>
      <Text style={{ color: inactive ? tokens.mutedForeground : tokens.foreground }}>{title}</Text>
    </Pressable>
  );
  const matches = PERSONALITY_CATALOG.filter((item) =>
    item.category === category &&
    `${label(item)} ${item.name} ${item.slug} ${item.id} ${item.description}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <View style={{ gap: 10, borderWidth: 1, borderColor: tokens.border, borderRadius: 16, padding: 12 }}>
      {loading ? <Text style={{ color: tokens.mutedForeground }}>{text("正在加载…", "Loading…")}</Text> : null}
      {error ? (
        <View>
          <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>{error}</Text>
          {action(text("重试加载", "Retry loading"), () => void refresh())}
        </View>
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <Text style={{ color: tokens.mutedForeground }}>{text("暂无已保存人格", "No saved personalities")}</Text>
      ) : null}
      {items.map((item) => (
        <View key={item.id} style={{ borderBottomWidth: 1, borderColor: tokens.border, paddingBottom: 8 }}>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: selectedId === item.id }}
            disabled={disabled || busy} onPress={() => onSelect(item)} style={{ paddingVertical: 8 }}>
            <Text style={{ color: tokens.foreground, fontWeight: "600" }}>{item.name}{selectedId === item.id ? " ✓" : ""}</Text>
            {item.description ? <Text style={{ color: tokens.mutedForeground }}>{item.description}</Text> : null}
          </Pressable>
          <View style={{ flexDirection: "row" }}>
            {action(text("编辑", "Edit"), () => edit(item))}
            {action(text("删除", "Delete"), () => confirmRemove(item))}
          </View>
        </View>
      ))}
      {!showEditor ? action(text("创建人格", "Create personality"), () => edit()) : (
        <View style={{ gap: 10 }}>
          <Text style={{ color: tokens.foreground, fontWeight: "600" }}>
            {editing ? text("编辑人格", "Edit personality") : text("创建人格", "Create personality")}
          </Text>
          <TextInput accessibilityLabel={text("名称", "Name")} placeholder={text("名称", "Name")}
            placeholderTextColor={tokens.mutedForeground} editable={!busy && !disabled}
            value={name} onChangeText={setName} maxLength={80} style={inputStyle} />
          <TextInput accessibilityLabel={text("描述", "Description")} placeholder={text("描述", "Description")}
            placeholderTextColor={tokens.mutedForeground} editable={!busy && !disabled}
            value={description} onChangeText={setDescription} maxLength={500} style={inputStyle} />
          <Text style={{ color: tokens.foreground }}>{text("属性分类", "Attribute category")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {categories.map(([value, chinese, english]) => (
              <View key={value}>{action(`${text(chinese, english)}${category === value ? " ✓" : ""}`, () => setCategory(value))}</View>
            ))}
          </View>
          <TextInput accessibilityLabel={text("搜索属性", "Search attributes")}
            placeholder={text("搜索属性", "Search attributes")} placeholderTextColor={tokens.mutedForeground}
            editable={!busy && !disabled} value={search} onChangeText={setSearch} style={inputStyle} />
          {matches.slice(0, 40).map((item) => {
            const chosen = selections.some((selection) => selection.attributeId === item.id);
            return (
              <View key={item.id}>
                {action(`${label(item)}${chosen ? " ✓" : ""}`, () => {
                  if (chosen) setSelections((old) => old.filter((selection) => selection.attributeId !== item.id));
                  else if (selections.length < 12)
                    setSelections((old) => [...old, { attributeId: item.id, weight: "moderate" }]);
                }, !chosen && selections.length >= 12)}
              </View>
            );
          })}
          {matches.length > 40 ? <Text style={{ color: tokens.mutedForeground }}>{text("输入关键词查看其他属性", "Search to find more attributes")}</Text> : null}
          {selections.map((selection) => {
            const item = PERSONALITY_CATALOG.find((entry) => entry.id === selection.attributeId);
            return (
              <View key={selection.attributeId}>
                <Text style={{ color: tokens.foreground }}>{item ? label(item) : selection.attributeId}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {weights.map(([weight, chinese, english]) => (
                    <View key={weight}>{action(`${text(chinese, english)}${weight === selection.weight ? " ✓" : ""}`, () =>
                      setSelections((old) => old.map((entry) => entry.attributeId === selection.attributeId ? { ...entry, weight } : entry)))}</View>
                  ))}
                  {action(text("移除", "Remove"), () => setSelections((old) => old.filter((entry) => entry.attributeId !== selection.attributeId)))}
                </View>
              </View>
            );
          })}
          {invalid ? <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>{text("属性存在冲突，请调整选择。", "These attributes conflict. Adjust your selection.")}</Text> : null}
          {combinedLength > BOT_INSTRUCTIONS_MAX_LENGTH ? <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>{text("人格内容过长。", "Personality instructions are too long.")}</Text> : null}
          <TextInput accessibilityLabel={text("自定义表达风格", "Custom speaking style")}
            placeholder={text("自定义表达风格", "Custom speaking style")} placeholderTextColor={tokens.mutedForeground}
            editable={!busy && !disabled} multiline value={instructions} onChangeText={setInstructions}
            maxLength={BOT_INSTRUCTIONS_MAX_LENGTH} style={[inputStyle, { minHeight: 90, textAlignVertical: "top" }]} />
          <View style={{ flexDirection: "row" }}>
            {action(text("保存", "Save"), () => void save(), !canSave)}
            {action(text("取消", "Cancel"), resetEditor)}
          </View>
          <Text style={{ color: tokens.mutedForeground }}>{text("人格调整表达风格；编辑或删除不会改变已有 Bot。", "Personalities adjust speaking style; changes do not affect existing bots.")}</Text>
        </View>
      )}
    </View>
  );
}
