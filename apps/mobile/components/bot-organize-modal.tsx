import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ViewStyle } from "react-native";
import {
  findNodeHandle,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  KeyboardControllerNative,
  KeyboardEvents,
  KeyboardAvoidingView as SheetKeyboardAvoidingView,
} from "react-native-keyboard-controller";
import type { MobileBot, MobileBotSection } from "../lib/api";
import { mobileTokens } from "../lib/appearance";
import { confirmDeleteSection } from "../lib/confirm-delete-section";
import { useI18n } from "../lib/i18n";
import { native, useThemedStyles } from "../lib/native";
import { errorText } from "../lib/user-error";
import { MotionPressable } from "./motion-pressable";
import { NativeActionButton } from "./native-action-button";
import { NativeSheet, useNativeSheet } from "./native-sheet";
import { NativeSymbol } from "./native-symbol";

export type BotOrganizationUpdate = {
  pinned?: boolean;
  sectionId?: string | null;
  notifyOnFinish?: boolean;
};

export function BotOrganizeModal({
  bot,
  sections,
  onClose,
  onUpdate,
  onCreateSection,
  onRenameSection,
  onDeleteSection,
}: {
  bot: Pick<MobileBot, "name" | "pinned" | "sectionId"> &
    Partial<Pick<MobileBot, "notifyOnFinish">>;
  sections: MobileBotSection[];
  onClose: () => void;
  onUpdate: (update: BotOrganizationUpdate) => Promise<void>;
  onCreateSection: (name: string) => Promise<void>;
  onRenameSection: (sectionId: string, name: string) => Promise<void>;
  onDeleteSection: (sectionId: string) => Promise<void>;
}) {
  const Sheet = useNativeSheet();
  const styles = useThemedStyles(createBotOrganizeStyles);
  const { t } = useI18n();
  const currentSection = sections.find((section) => section.id === bot.sectionId) ?? null;
  const [mode, setMode] = useState<"idle" | "create" | "rename">("idle");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(request: () => Promise<void>, fallback = t("Could not update chat")) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await request();
      onClose();
    } catch (err) {
      setError(errorText(err, fallback));
      setSaving(false);
    }
  }

  function startCreate() {
    setMode("create");
    setName("");
    setError(null);
  }

  function startRename() {
    if (!currentSection) return;
    setMode("rename");
    setName(currentSection.name);
    setError(null);
  }

  function confirmDelete() {
    if (!currentSection) return;
    confirmDeleteSection(
      currentSection,
      t,
      () => void save(() => onDeleteSection(currentSection.id), t("Could not delete section")),
    );
  }

  if (Sheet === undefined) return null;

  const content = (
    <View
      style={
        Sheet
          ? styles.nativeSheet
          : Platform.OS === "ios"
            ? [styles.nativeSheet, styles.formSheetContent]
            : styles.sheet
      }
    >
      {!Sheet ? <View style={styles.grabber} /> : null}
      <Text style={styles.title} numberOfLines={1}>
        {bot.name}
      </Text>
      <View style={Sheet ? styles.nativeCardGroup : styles.cardGroup}>
        <MotionPressable
          preset="row"
          highlightColor={styles.pressed.backgroundColor}
          accessibilityRole="button"
          disabled={saving}
          onPress={() => void save(() => onUpdate({ pinned: !bot.pinned }))}
          style={styles.action}
        >
          <NativeSymbol
            ios={bot.pinned ? "pin.slash" : "pin"}
            android={bot.pinned ? "pin-outline" : "pin"}
            size={18}
          />
          <Text style={styles.actionLabel}>{bot.pinned ? t("Unpin") : t("Pin")}</Text>
        </MotionPressable>
        {typeof bot.notifyOnFinish === "boolean" ? (
          <MotionPressable
            preset="row"
            highlightColor={styles.pressed.backgroundColor}
            accessibilityRole="button"
            disabled={saving}
            onPress={() => void save(() => onUpdate({ notifyOnFinish: !bot.notifyOnFinish }))}
            style={styles.action}
          >
            <NativeSymbol
              ios={bot.notifyOnFinish ? "bell.slash" : "bell"}
              android={bot.notifyOnFinish ? "notifications-off-outline" : "notifications-outline"}
              size={18}
            />
            <Text style={styles.actionLabel}>
              {bot.notifyOnFinish ? t("Silence notifications") : t("Resume notifications")}
            </Text>
          </MotionPressable>
        ) : null}
      </View>
      <Text style={styles.sectionLabel}>{t("Move to")}</Text>
      <ScrollView
        style={[styles.sectionOptions, Sheet ? styles.nativeCardGroup : styles.cardGroup]}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={Sheet ? true : undefined}
      >
        {sections.map((section) => (
          <SectionOption
            key={section.id}
            label={section.name}
            selected={bot.sectionId === section.id}
            disabled={saving || bot.sectionId === section.id}
            onPress={() => void save(() => onUpdate({ sectionId: section.id }))}
          />
        ))}
        <SectionOption
          label={t("Unassigned")}
          selected={bot.sectionId === null}
          disabled={saving || bot.sectionId === null}
          onPress={() => void save(() => onUpdate({ sectionId: null }))}
        />
      </ScrollView>
      {mode === "create" || mode === "rename" ? (
        <View style={styles.newSectionRow}>
          <TextInput
            autoFocus
            value={name}
            onChangeText={setName}
            maxLength={60}
            placeholder={t("Section name")}
            placeholderTextColor={native.secondaryLabel}
            style={[styles.newSectionInput, Sheet ? styles.nativeSheetInput : null]}
          />
          <NativeActionButton
            label={mode === "rename" ? t("Save") : t("Create")}
            accessibilityLabel={mode === "rename" ? t("Save section name") : t("Create section")}
            fill={false}
            style={{ alignSelf: "center" }}
            disabled={
              saving || !name.trim() || (mode === "rename" && name.trim() === currentSection?.name)
            }
            onPress={() => {
              const trimmed = name.trim();
              if (mode === "rename" && currentSection) {
                void save(() => onRenameSection(currentSection.id, trimmed));
                return;
              }
              void save(() => onCreateSection(trimmed));
            }}
          />
        </View>
      ) : (
        <View style={[Sheet ? styles.nativeCardGroup : styles.cardGroup, { marginTop: 8 }]}>
          <MotionPressable
            preset="row"
            highlightColor={styles.pressed.backgroundColor}
            disabled={saving}
            onPress={startCreate}
            style={styles.action}
          >
            <NativeSymbol ios="folder.badge.plus" android="folder-outline" size={18} />
            <Text style={styles.actionLabel}>{t("New section")}</Text>
          </MotionPressable>
          {currentSection ? (
            <MotionPressable
              preset="row"
              highlightColor={styles.pressed.backgroundColor}
              disabled={saving}
              onPress={startRename}
              style={styles.action}
            >
              <NativeSymbol ios="pencil" android="pencil-outline" size={18} />
              <Text style={styles.actionLabel}>{t("Rename section")}</Text>
            </MotionPressable>
          ) : null}
          {currentSection ? (
            <MotionPressable
              preset="row"
              highlightColor={styles.pressed.backgroundColor}
              accessibilityRole="button"
              disabled={saving}
              onPress={confirmDelete}
              style={styles.action}
            >
              <NativeSymbol
                ios="trash"
                android="trash-outline"
                size={18}
                color={mobileTokens().destructive}
              />
              <Text style={[styles.actionLabel, styles.destructive]}>{t("Delete section")}</Text>
            </MotionPressable>
          ) : null}
        </View>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <NativeActionButton
        label={t("Cancel")}
        prominence="secondary"
        fill
        style={styles.cancel}
        onPress={onClose}
      />
    </View>
  );
  if (Sheet) {
    return (
      <NativeSheet Sheet={Sheet} onClose={onClose} label={bot.name}>
        {content}
      </NativeSheet>
    );
  }
  if (Platform.OS === "ios") {
    return (
      <Modal
        animationType="slide"
        presentationStyle="formSheet"
        allowSwipeDismissal
        onRequestClose={onClose}
      >
        <FormSheetKeyboardAvoidingView style={styles.formSheet}>
          {content}
        </FormSheetKeyboardAvoidingView>
      </Modal>
    );
  }
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay}>
        <Pressable
          accessibilityLabel={t("Close chat organization")}
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        {content}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// The sheet starts below the top of the screen; offsetting by its window position keeps Cancel
// above the keyboard. The measurement fails while the sheet is still being presented, so it is
// repeated whenever the keyboard is about to show. React Native's `measureInWindow` cannot replace
// it: on the New Architecture it ignores the form sheet's own position.
function FormSheetKeyboardAvoidingView({
  style,
  children,
}: {
  style: ViewStyle;
  children: ReactNode;
}) {
  const ref = useRef<View>(null);
  const [offset, setOffset] = useState(0);
  const measure = useCallback(() => {
    const tag = findNodeHandle(ref.current);
    if (tag === null) return;
    KeyboardControllerNative.viewPositionInWindow(tag).then(
      ({ y }) => setOffset(y),
      () => {},
    );
  }, []);
  useEffect(() => {
    const subscription = KeyboardEvents.addListener("keyboardWillShow", measure);
    return () => subscription.remove();
  }, [measure]);
  return (
    <SheetKeyboardAvoidingView
      ref={ref}
      behavior="padding"
      keyboardVerticalOffset={offset}
      onLayout={measure}
      style={style}
    >
      {children}
    </SheetKeyboardAvoidingView>
  );
}

function SectionOption({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(createBotOrganizeStyles);
  return (
    <MotionPressable
      preset="row"
      highlightColor={styles.pressed.backgroundColor}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.sectionOption}
    >
      <NativeSymbol ios="folder" android="folder-outline" size={18} />
      <Text style={styles.actionLabel} numberOfLines={1}>
        {label}
      </Text>
      {selected ? <NativeSymbol ios="checkmark" android="checkmark" size={17} /> : null}
    </MotionPressable>
  );
}

function createBotOrganizeStyles() {
  const tokens = mobileTokens();
  const bg = tokens?.background;
  const isLight =
    typeof bg === "string" && /^#[\da-f]{6}/i.test(bg)
      ? Number.parseInt(bg.slice(1, 3), 16) > 128
      : true;
  const hairline = StyleSheet.hairlineWidth ?? 0.5;
  const porcelainCard = isLight ? "#FFFEFC" : "#242933";
  const porcelainBorder =
    tokens?.border ?? (isLight ? "rgba(38, 35, 31, 0.055)" : "rgba(245, 244, 240, 0.09)");
  const creamChip = isLight ? "#F8F6F2" : "#2A303B";
  const creamChipBorder = isLight ? "rgba(38, 35, 31, 0.07)" : "rgba(245, 244, 240, 0.10)";
  const softTaupe = isLight ? "#6E675E" : "#B8B3AA";
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: tokens.overlay,
    },
    sheet: {
      maxHeight: "82%",
      flexShrink: 1,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      backgroundColor: porcelainCard,
      borderWidth: hairline,
      borderColor: porcelainBorder,
      paddingHorizontal: 18,
      paddingTop: 12,
      paddingBottom: 28,
    },
    grabber: {
      width: 36,
      height: 4,
      borderRadius: 2,
      alignSelf: "center",
      marginBottom: 12,
      backgroundColor: softTaupe,
      opacity: 0.28,
    },
    formSheet: { flex: 1, backgroundColor: tokens?.background ?? "#F3F1EC", paddingTop: 14 },
    // The keyboard shrinks the section list so the name field stays visible.
    formSheetContent: { flexShrink: 1 },
    nativeSheet: {
      paddingHorizontal: 18,
      paddingBottom: 28,
    },
    cardGroup: {
      backgroundColor: porcelainCard,
      borderRadius: 20,
      borderWidth: hairline,
      borderColor: porcelainBorder,
      padding: 4,
      shadowColor: "#26231F",
      shadowOpacity: isLight ? 0.025 : 0.14,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
      elevation: 1,
    },
    nativeCardGroup: {
      backgroundColor: creamChip,
      borderRadius: 20,
      borderWidth: hairline,
      borderColor: creamChipBorder,
      padding: 4,
    },
    title: {
      color: native.label,
      fontSize: 18,
      fontWeight: "600",
      paddingHorizontal: 8,
      paddingBottom: 12,
    },
    action: {
      minHeight: 46,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: 16,
      paddingHorizontal: 12,
    },
    pressed: {
      backgroundColor: creamChip,
    },
    actionLabel: {
      flex: 1,
      color: native.label,
      fontSize: 16,
    },
    sectionLabel: {
      color: native.secondaryLabel,
      fontSize: 13,
      fontWeight: "600",
      paddingHorizontal: 10,
      paddingTop: 14,
      paddingBottom: 8,
    },
    sectionOptions: {
      maxHeight: 230,
      flexShrink: 1,
    },
    sectionOption: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: 16,
      paddingHorizontal: 12,
    },
    newSectionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 4,
      paddingVertical: 8,
    },
    // The sheet surface is the card fill, so the field sits on the screen background.
    nativeSheetInput: {
      backgroundColor: tokens.background,
      borderWidth: hairline,
      borderColor: porcelainBorder,
    },
    newSectionInput: {
      flex: 1,
      height: 44,
      borderRadius: 16,
      backgroundColor: porcelainCard,
      borderWidth: hairline,
      borderColor: porcelainBorder,
      color: native.label,
      paddingHorizontal: 14,
      fontSize: 16,
    },
    destructive: { color: tokens.destructive },
    error: {
      color: tokens.destructive,
      fontSize: 13,
      paddingHorizontal: 10,
      paddingTop: 8,
    },
    cancel: { marginTop: 14 },
  });
}
