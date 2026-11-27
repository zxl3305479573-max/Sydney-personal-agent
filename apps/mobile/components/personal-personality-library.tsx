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
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { captureApiRequestContext, rpc } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { native, useMobileTokens } from "../lib/native";
import { errorText } from "../lib/user-error";
import { GlassSurface } from "./glass-surface";
import { MotionPressable } from "./motion-pressable";
import { NativeActionButton } from "./native-action-button";
import { NativeSymbol } from "./native-symbol";
import { Checkmark } from "./row-accessories";
import { SegmentedPills } from "./segmented-pills";

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
  selectedInstructions,
  onSelect,
  onSaved,
  onRemoved,
  onBusyChange,
}: {
  current: () => boolean;
  disabled: boolean;
  selectedId?: string;
  selectedInstructions?: string;
  onSelect: (item: PersonalityPreset) => void;
  onSaved: (item: PersonalityPreset, previous?: PersonalityPreset) => void;
  onRemoved: (id: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const tokens = useMobileTokens();
  const { locale } = useI18n();
  const text = (chinese: string, english: string) => (locale.startsWith("zh") ? chinese : english);
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
      setError(
        text("工作区已改变，请关闭后重新打开。", "The workspace changed. Close and reopen."),
      );
      return;
    }
    const version = ++readVersion.current;
    setLoading(true);
    setError(null);
    try {
      const requestContext = await captureApiRequestContext();
      if (!current()) {
        if (mounted.current && readVersion.current === version)
          setError(
            text("工作区已改变，请关闭后重新打开。", "The workspace changed. Close and reopen."),
          );
        return;
      }
      const next = await rpc("personalities/list", undefined, {
        requestContext,
        skipSpaceAuthRecovery: true,
      });
      if (mounted.current && readVersion.current === version) {
        if (current()) setItems(next);
        else
          setError(
            text("工作区已改变，请关闭后重新打开。", "The workspace changed. Close and reopen."),
          );
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
    return () => {
      mounted.current = false;
      readVersion.current += 1;
    };
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
        setError(
          text(
            "工作区已改变，保存结果可能已生效；请关闭后重新查看。",
            "The workspace changed. The save may have completed; close and check again.",
          ),
        );
        return;
      }
      setItems((old) => [saved, ...old.filter((item) => item.id !== saved.id)]);
      onSaved(
        saved,
        items.find((item) => item.id === saved.id),
      );
      resetEditor();
    } catch (cause) {
      if (mounted.current)
        setError(
          current()
            ? errorText(
                cause,
                text(
                  "无法保存人格，请重新加载确认结果。",
                  "Could not save personality. Reload to check the result.",
                ),
              )
            : text(
                "工作区已改变，保存结果可能已生效；请关闭后重新查看。",
                "The workspace changed. The save may have completed; close and check again.",
              ),
        );
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
      await rpc(
        "personalities/remove",
        { personalityId: item.id },
        {
          requestContext,
          skipSpaceAuthRecovery: true,
        },
      );
      if (!mounted.current) return;
      if (!current()) {
        setError(
          text(
            "工作区已改变，删除结果可能已生效；请关闭后重新查看。",
            "The workspace changed. The deletion may have completed; close and check again.",
          ),
        );
        return;
      }
      setItems((old) => old.filter((entry) => entry.id !== item.id));
      if (editing === item.id) resetEditor();
      onRemoved(item.id);
    } catch (cause) {
      if (mounted.current)
        setError(
          current()
            ? errorText(
                cause,
                text(
                  "无法删除人格，请重新加载确认结果。",
                  "Could not delete personality. Reload to check the result.",
                ),
              )
            : text(
                "工作区已改变，删除结果可能已生效；请关闭后重新查看。",
                "The workspace changed. The deletion may have completed; close and check again.",
              ),
        );
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
    backgroundColor: tokens.card,
    borderColor: tokens.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  };
  const pillAction = (
    title: string,
    onPress: () => void,
    destructive = false,
    inactive = false,
  ) => (
    <MotionPressable
      preset="control"
      accessibilityRole="button"
      disabled={disabled || busy || inactive}
      onPress={onPress}
      style={{
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: native.fill,
        opacity: disabled || busy || inactive ? 0.5 : 1,
      }}
    >
      <Text
        style={{
          color: destructive ? tokens.destructive : tokens.foreground,
          fontSize: 13,
          fontWeight: "500",
        }}
      >
        {title}
      </Text>
    </MotionPressable>
  );
  const matches = PERSONALITY_CATALOG.filter(
    (item) =>
      item.category === category &&
      `${label(item)} ${item.name} ${item.slug} ${item.id} ${item.description}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );

  return (
    <GlassSurface
      shape="roundedRectangle"
      cornerRadius={16}
      style={{ borderRadius: 16, padding: 14, gap: 12 }}
      fallbackStyle={{
        backgroundColor: tokens.card,
        borderWidth: 1,
        borderColor: tokens.border,
      }}
    >
      {loading ? (
        <View style={{ paddingVertical: 12, alignItems: "center", gap: 6 }}>
          <ActivityIndicator size="small" color={tokens.mutedForeground} />
          <Text style={{ color: tokens.mutedForeground, fontSize: 13 }}>
            {text("正在加载…", "Loading…")}
          </Text>
        </View>
      ) : null}
      {error ? (
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>
            {error}
          </Text>
          <View style={{ alignSelf: "flex-start" }}>
            {pillAction(text("重试加载", "Retry loading"), () => void refresh())}
          </View>
        </View>
      ) : null}
      {!loading && !error && items.length === 0 && !showEditor ? (
        <Text style={{ color: tokens.mutedForeground, fontSize: 14 }}>
          {text("暂无已保存人格", "No saved personalities")}
        </Text>
      ) : null}
      {items.map((item, index) => {
        const isSelected = selectedId === item.id || selectedInstructions === item.instructions;
        return (
          <View
            key={item.id}
            style={{
              borderBottomWidth: index < items.length - 1 ? StyleSheet.hairlineWidth : 0,
              borderColor: tokens.border,
              paddingBottom: index < items.length - 1 ? 10 : 4,
              gap: 8,
            }}
          >
            <MotionPressable
              preset="row"
              highlightColor={native.fillPressed}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              disabled={disabled || busy}
              onPress={() => onSelect(item)}
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={{ color: tokens.foreground, fontWeight: "600", fontSize: 15 }}>
                  {item.name}
                </Text>
                {item.description ? (
                  <Text style={{ color: tokens.mutedForeground, fontSize: 13 }}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
              {isSelected ? <Checkmark /> : null}
            </MotionPressable>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {pillAction(text("编辑", "Edit"), () => edit(item))}
              {pillAction(text("删除", "Delete"), () => confirmRemove(item), true)}
            </View>
          </View>
        );
      })}

      {!showEditor ? (
        <NativeActionButton
          label={text("创建人格", "Create personality")}
          prominence="secondary"
          fill={false}
          disabled={disabled || busy}
          onPress={() => edit()}
        />
      ) : (
        <View style={{ gap: 12, paddingTop: 4 }}>
          <Text style={{ color: tokens.foreground, fontWeight: "600", fontSize: 16 }}>
            {editing
              ? text("编辑人格", "Edit personality")
              : text("创建人格", "Create personality")}
          </Text>
          <TextInput
            accessibilityLabel={text("名称", "Name")}
            placeholder={text("名称", "Name")}
            placeholderTextColor={tokens.mutedForeground}
            editable={!busy && !disabled}
            value={name}
            onChangeText={setName}
            maxLength={80}
            style={inputStyle}
          />
          <TextInput
            accessibilityLabel={text("描述", "Description")}
            placeholder={text("描述（可选）", "Description (optional)")}
            placeholderTextColor={tokens.mutedForeground}
            editable={!busy && !disabled}
            value={description}
            onChangeText={setDescription}
            maxLength={500}
            style={inputStyle}
          />

          <View style={{ gap: 8 }}>
            <Text style={{ color: tokens.foreground, fontWeight: "500", fontSize: 14 }}>
              {text("属性分类", "Attribute category")}
            </Text>
            <SegmentedPills
              accessibilityLabel={text("属性分类", "Attribute category")}
              value={category}
              disabled={disabled || busy}
              onChange={setCategory}
              options={categories.map(([value, chinese, english]) => ({
                value,
                label: text(chinese, english),
              }))}
            />
          </View>

          <TextInput
            accessibilityLabel={text("搜索属性", "Search attributes")}
            placeholder={text("搜索属性", "Search attributes")}
            placeholderTextColor={tokens.mutedForeground}
            editable={!busy && !disabled}
            value={search}
            onChangeText={setSearch}
            style={inputStyle}
          />

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {matches.slice(0, 40).map((item) => {
              const chosen = selections.some((selection) => selection.attributeId === item.id);
              const capped = !chosen && selections.length >= 12;
              return (
                <MotionPressable
                  key={item.id}
                  preset="control"
                  accessibilityRole="button"
                  accessibilityState={{ selected: chosen, disabled: disabled || busy || capped }}
                  disabled={disabled || busy || capped}
                  onPress={() => {
                    if (chosen)
                      setSelections((old) =>
                        old.filter((selection) => selection.attributeId !== item.id),
                      );
                    else if (selections.length < 12)
                      setSelections((old) => [
                        ...old,
                        { attributeId: item.id, weight: "moderate" },
                      ]);
                  }}
                  style={{
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: chosen ? tokens.primary : tokens.border,
                    backgroundColor: chosen ? native.fill : "transparent",
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    opacity: disabled || busy || capped ? 0.45 : 1,
                  }}
                >
                  <Text
                    style={{
                      color: chosen ? tokens.primary : tokens.foreground,
                      fontSize: 13,
                      fontWeight: chosen ? "600" : "400",
                    }}
                  >
                    {label(item)}
                  </Text>
                </MotionPressable>
              );
            })}
          </View>
          {matches.length > 40 ? (
            <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
              {text("输入关键词查看其他属性", "Search to find more attributes")}
            </Text>
          ) : null}

          {selections.length > 0 ? (
            <View style={{ gap: 10 }}>
              {selections.map((selection) => {
                const item = PERSONALITY_CATALOG.find(
                  (entry) => entry.id === selection.attributeId,
                );
                return (
                  <View
                    key={selection.attributeId}
                    style={{
                      gap: 8,
                      padding: 10,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: tokens.border,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text style={{ color: tokens.foreground, fontWeight: "600", fontSize: 14 }}>
                        {item ? label(item) : selection.attributeId}
                      </Text>
                      <MotionPressable
                        preset="icon"
                        accessibilityRole="button"
                        accessibilityLabel={text("移除", "Remove")}
                        disabled={disabled || busy}
                        hitSlop={6}
                        onPress={() =>
                          setSelections((old) =>
                            old.filter((entry) => entry.attributeId !== selection.attributeId),
                          )
                        }
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 13,
                          backgroundColor: native.fill,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <NativeSymbol
                          ios="xmark"
                          android="close"
                          size={12}
                          color={tokens.mutedForeground}
                        />
                      </MotionPressable>
                    </View>
                    <SegmentedPills
                      accessibilityLabel={item ? label(item) : selection.attributeId}
                      value={selection.weight}
                      disabled={disabled || busy}
                      onChange={(weight) =>
                        setSelections((old) =>
                          old.map((entry) =>
                            entry.attributeId === selection.attributeId
                              ? { ...entry, weight }
                              : entry,
                          ),
                        )
                      }
                      options={weights.map(([weight, chinese, english]) => ({
                        value: weight,
                        label: text(chinese, english),
                      }))}
                    />
                  </View>
                );
              })}
            </View>
          ) : null}

          {invalid ? (
            <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>
              {text(
                "属性存在冲突，请调整选择。",
                "These attributes conflict. Adjust your selection.",
              )}
            </Text>
          ) : null}
          {combinedLength > BOT_INSTRUCTIONS_MAX_LENGTH ? (
            <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>
              {text("人格内容过长。", "Personality instructions are too long.")}
            </Text>
          ) : null}
          <TextInput
            accessibilityLabel={text("自定义表达风格", "Custom speaking style")}
            placeholder={text("自定义表达风格", "Custom speaking style")}
            placeholderTextColor={tokens.mutedForeground}
            editable={!busy && !disabled}
            multiline
            value={instructions}
            onChangeText={setInstructions}
            maxLength={BOT_INSTRUCTIONS_MAX_LENGTH}
            style={[inputStyle, { minHeight: 88, textAlignVertical: "top" }]}
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <NativeActionButton
                label={text("保存", "Save")}
                disabled={!canSave || disabled}
                busy={busy}
                onPress={() => void save()}
              />
            </View>
            <View style={{ flex: 1 }}>
              <NativeActionButton
                label={text("取消", "Cancel")}
                prominence="secondary"
                fill={false}
                disabled={busy || disabled}
                onPress={resetEditor}
              />
            </View>
          </View>
          <Text style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 17 }}>
            {text(
              "人格调整表达风格；编辑或删除不会改变已有 Bot。",
              "Personalities adjust speaking style; changes do not affect existing bots.",
            )}
          </Text>
        </View>
      )}
    </GlassSurface>
  );
}
