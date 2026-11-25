import type { ComponentProps } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ComputerKeyboardCommand, ComputerKeyName } from "../lib/computer-keyboard";
import { commandsForKeyboardChange, computerKeyboardChanges } from "../lib/computer-keyboard";
import { useI18n } from "../lib/i18n";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";
import type { ComputerPointerMode } from "../lib/native-computer-control";
import { androidRipple } from "../lib/ripple";
import { NativeSegmentedControl } from "./native-segmented-control";
import { NativeSymbol } from "./native-symbol";

// Some Android keyboards report a Backspace key press just after the change that deleted with it.
const DELETE_KEY_PRESS_MS = 50;
const KEY_SIZE = 44;
const KEY_GAP = 4;

type KeyIcon = Pick<ComponentProps<typeof NativeSymbol>, "ios" | "android">;

const directionKeys = [
  { name: "ArrowLeft", label: "Left", ios: "arrow.left", android: "arrow-back" },
  { name: "ArrowDown", label: "Down", ios: "arrow.down", android: "arrow-down" },
  { name: "ArrowUp", label: "Up", ios: "arrow.up", android: "arrow-up" },
  { name: "ArrowRight", label: "Right", ios: "arrow.right", android: "arrow-forward" },
] as const;

export function ComputerKeyboardBar({
  active,
  onCommand,
  pointer,
}: {
  /** False once the screen is closing; the bar can stay mounted while it animates away. */
  active: boolean;
  onCommand: (command: ComputerKeyboardCommand) => void;
  pointer?: { mode: ComputerPointerMode; onChange: (mode: ComputerPointerMode) => void };
}) {
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const appearance = useResolvedAppearance();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const inputRef = useRef<TextInput>(null);
  // The field's text as last handled, updated at once. A keystroke can be reported twice before
  // React re-renders; measured from here, the repeat finds nothing new to send.
  const handled = useRef("");
  const deletedAt = useRef<number | null>(null);
  const backspacePressed = useRef(false);
  // On from the keyboard toggle until an explicit close; while on, a blur gives focus straight back.
  const keepOpen = useRef(false);
  const control = useRef(false);
  const [open, setOpen] = useState(false);
  const [controlLatched, setControlLatched] = useState(false);

  // Backgrounding is left to iOS, which keeps the keyboard and brings it back on return. A blur
  // while in the background is never seen by the keyboard tracking, which leaves a gap.
  useEffect(
    () => () => {
      keepOpen.current = false;
    },
    [],
  );

  useLayoutEffect(() => {
    if (active) return;
    keepOpen.current = false;
    inputRef.current?.blur();
  }, [active]);

  function latch(next: boolean) {
    control.current = next;
    setControlLatched(next);
  }

  function send(changes: { backspaces: number; text: string }) {
    if (!active) return;
    const commands = commandsForKeyboardChange(changes, control.current);
    for (const command of commands) onCommand(command);
    if (control.current && commands.length > 0) latch(false);
  }

  function onChangeText(next: string) {
    const changes = computerKeyboardChanges(handled.current, next);
    handled.current = next;
    if (changes.backspaces > 0) {
      deletedAt.current = backspacePressed.current ? null : Date.now();
    }
    backspacePressed.current = false;
    send(changes);
  }

  // An empty field reports no change for Backspace, so its key press is the only signal there.
  // With text, the change carries the deletion, whichever of the two arrives first.
  function onKeyPress(key: string) {
    if (!active || key !== "Backspace") return;
    const deleted = deletedAt.current;
    deletedAt.current = null;
    if (deleted !== null && Date.now() - deleted < DELETE_KEY_PRESS_MS) return;
    if (handled.current) {
      backspacePressed.current = true;
      return;
    }
    send({ backspaces: 1, text: "" });
  }

  // Edits only count at the end, where the remote caret is, so a caret moved by holding Space
  // goes straight back there. A selection reported before its own change asks for the old end;
  // the field drops that request as out of date, and the change still sends.
  function onSelectionChange(start: number, end: number) {
    const length = handled.current.length;
    if (start < length || end < length) inputRef.current?.setSelection(length, length);
  }

  function onBlur() {
    if (keepOpen.current) {
      inputRef.current?.focus();
      return;
    }
    setOpen(false);
  }

  function toggle() {
    if (!active) return;
    if (open) {
      keepOpen.current = false;
      inputRef.current?.blur();
      return;
    }
    keepOpen.current = true;
    inputRef.current?.focus();
  }

  function press(name: ComputerKeyName) {
    if (!active) return;
    onCommand(control.current ? { type: "key", name, control: true } : { type: "key", name });
    if (control.current) latch(false);
  }

  const isLight = appearance === "light";
  const barBg = tokens?.background ?? (isLight ? "#F3F1EC" : "#15171C");
  const barBorder = isLight ? "rgba(38, 35, 31, 0.08)" : "rgba(245, 244, 240, 0.10)";

  return (
    <View
      style={[
        styles.bar,
        {
          borderTopColor: barBorder,
          backgroundColor: barBg,
          paddingLeft: insets.left + 12,
          paddingRight: insets.right + 12,
          paddingBottom: keyboardVisible ? 8 : Math.max(insets.bottom, 8),
        },
      ]}
    >
      <TextInput
        ref={inputRef}
        onChangeText={onChangeText}
        onKeyPress={(event) => onKeyPress(event.nativeEvent.key)}
        onSelectionChange={(event) =>
          onSelectionChange(event.nativeEvent.selection.start, event.nativeEvent.selection.end)
        }
        onFocus={() => setOpen(true)}
        onBlur={onBlur}
        onSubmitEditing={() => press("Return")}
        submitBehavior="submit"
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        keyboardAppearance={appearance}
        accessibilityLabel={t("Computer keyboard")}
        style={styles.input}
      />
      <View style={styles.content}>
        {pointer ? (
          <NativeSegmentedControl
            accessibilityLabel={t("Pointer mode")}
            disabled={!active}
            value={pointer.mode}
            onChange={pointer.onChange}
            options={[
              { value: "touch", label: t("Direct touch") },
              { value: "mouse", label: t("Virtual mouse") },
            ]}
          />
        ) : null}
        <View style={styles.groups}>
          <View style={styles.group}>
            <ComputerShortcut
              accessibilityLabel={open ? t("Hide keyboard") : t("Show keyboard")}
              icon={{ ios: "keyboard", android: "keypad-outline" }}
              selected={open}
              disabled={!active}
              onPress={toggle}
            />
            <ComputerShortcut
              label="Esc"
              accessibilityLabel={t("Escape")}
              disabled={!active}
              onPress={() => press("Escape")}
            />
            <ComputerShortcut
              label="Tab"
              accessibilityLabel={t("Tab")}
              disabled={!active}
              onPress={() => press("Tab")}
            />
            <ComputerShortcut
              label="Ctrl"
              accessibilityLabel={t("Control")}
              selected={controlLatched}
              disabled={!active}
              onPress={() => latch(!control.current)}
            />
          </View>
          <View style={styles.group}>
            {directionKeys.map(({ name, label, ios, android }) => (
              <ComputerShortcut
                key={name}
                icon={{ ios, android }}
                accessibilityLabel={t(label)}
                disabled={!active}
                onPress={() => press(name)}
              />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

function ComputerShortcut({
  label,
  icon,
  accessibilityLabel,
  disabled,
  selected,
  onPress,
}: {
  label?: string;
  icon?: KeyIcon;
  accessibilityLabel: string;
  disabled: boolean;
  selected?: boolean;
  onPress: () => void;
}) {
  const tokens = useMobileTokens();
  const appearance = useResolvedAppearance();
  const isLight = appearance === "light";
  const fg = tokens?.foreground ?? (isLight ? "#26231F" : "#F5F4F0");
  const selectedBg = tokens?.primary ?? (isLight ? "#2B2823" : "#F5F4F0");
  const selectedFg = tokens?.primaryForeground ?? (isLight ? "#FFFEFC" : "#15171C");
  const keyBg = isLight ? "#FFFEFC" : "#242933";
  const keyBorder = isLight ? "rgba(38, 35, 31, 0.07)" : "rgba(245, 244, 240, 0.10)";
  const color = selected ? selectedFg : fg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected }}
      android_ripple={androidRipple()}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        {
          backgroundColor: selected ? selectedBg : keyBg,
          borderColor: selected ? "transparent" : keyBorder,
          opacity: disabled ? 0.45 : pressed ? 0.68 : 1,
        },
      ]}
    >
      {icon ? (
        <NativeSymbol {...icon} color={color} />
      ) : (
        <Text numberOfLines={1} style={[styles.keyLabel, { color }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: 0.5,
    paddingTop: 10,
  },
  content: {
    alignSelf: "center",
    gap: 8,
    width: "100%",
    maxWidth: 560,
  },
  groups: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  group: {
    flexDirection: "row",
    flexBasis: 4 * KEY_SIZE + 3 * KEY_GAP,
    flexGrow: 1,
    gap: KEY_GAP,
  },
  input: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0.02,
    bottom: 0,
    left: 0,
  },
  key: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: KEY_SIZE,
    minHeight: KEY_SIZE,
    borderRadius: 12,
    borderWidth: 0.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  keyLabel: { fontFamily: "System", fontSize: 14, fontWeight: "600" },
});
