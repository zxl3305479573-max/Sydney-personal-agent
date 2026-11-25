import type { ProjectWorkspaceConnectionStatus } from "@rakazo/contracts";
import { typeScale } from "@rakazo/ui-tokens";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { native, useResolvedAppearance } from "../lib/native";
import { GlassSurface } from "./glass-surface";

export type ProjectWorkspaceListItem = {
  id: string;
  name: string;
  connectionStatus: ProjectWorkspaceConnectionStatus;
};

export type ProjectWorkspaceListProps = {
  state:
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; workspaces: readonly ProjectWorkspaceListItem[] };
  selectedId: string | null;
  pending?: boolean;
  labels: {
    loading: string;
    error: string;
    empty: string;
    add: string;
    remove: string;
    selected: string;
    connectionStatus: Record<ProjectWorkspaceConnectionStatus, string>;
    selectWorkspace: (name: string, status: string) => string;
    removeWorkspace: (name: string) => string;
  };
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
};

export function ProjectWorkspaceList({
  state,
  selectedId,
  pending = false,
  labels,
  onSelect,
  onAdd,
  onRemove,
}: ProjectWorkspaceListProps) {
  const appearance = useResolvedAppearance();
  const isLight = appearance === "light";
  const cardBg = isLight ? "#FFFEFC" : "#242933";
  const cardBorder = isLight ? "rgba(38, 35, 31, 0.055)" : "rgba(245, 244, 240, 0.09)";
  const selectedBg = isLight ? "#F8F6F2" : "#2A303B";
  const labelColor = native.label ?? (isLight ? "#26231F" : "#F5F4F0");
  const secondaryColor = native.secondaryLabel ?? (isLight ? "#6E675E" : "#B8B3AA");
  const surfaceShadow = {
    shadowColor: "#26231F",
    shadowOpacity: isLight ? 0.028 : 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  } as const;

  return (
    <View style={{ gap: 12 }}>
      <GlassSurface
        shape="roundedRectangle"
        cornerRadius={20}
        style={{ borderRadius: 20, overflow: "hidden" }}
        fallbackStyle={{
          backgroundColor: cardBg,
          borderRadius: 20,
          borderWidth: 0.5,
          borderColor: cardBorder,
          ...surfaceShadow,
        }}
      >
        {state.status === "loading" ? (
          <View accessibilityLiveRegion="polite" style={{ padding: 18, gap: 8 }}>
            <ActivityIndicator />
            <Text style={{ color: secondaryColor }}>{labels.loading}</Text>
          </View>
        ) : state.status === "error" ? (
          <Text accessibilityRole="alert" style={{ padding: 18, color: labelColor }}>
            {labels.error}
          </Text>
        ) : state.workspaces.length === 0 ? (
          <Text style={{ padding: 18, color: secondaryColor }}>{labels.empty}</Text>
        ) : (
          state.workspaces.map((workspace, index) => {
            const selected = workspace.id === selectedId;
            const status = labels.connectionStatus[workspace.connectionStatus];
            return (
              <View
                key={workspace.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingRight: 10,
                  backgroundColor: selected ? selectedBg : "transparent",
                  borderBottomWidth: index < state.workspaces.length - 1 ? 0.5 : 0,
                  borderBottomColor: cardBorder,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={labels.selectWorkspace(workspace.name, status)}
                  accessibilityState={{ selected, disabled: pending }}
                  disabled={pending}
                  onPress={() => onSelect(workspace.id)}
                  style={({ pressed }) => ({
                    flex: 1,
                    minWidth: 0,
                    minHeight: 66,
                    alignSelf: "stretch",
                    paddingHorizontal: 18,
                    paddingVertical: 12,
                    gap: 4,
                    opacity: pending ? 0.5 : pressed ? 0.65 : 1,
                  })}
                >
                  <Text style={{ color: labelColor, ...typeScale.cardTitle }}>
                    {workspace.name}
                  </Text>
                  <Text style={{ color: secondaryColor }}>
                    {status}
                    {selected ? ` · ${labels.selected}` : null}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={labels.removeWorkspace(workspace.name)}
                  accessibilityState={{ disabled: pending }}
                  disabled={pending}
                  onPress={() => onRemove(workspace.id)}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    minWidth: 44,
                    maxWidth: "40%",
                    flexShrink: 1,
                    justifyContent: "center",
                    paddingHorizontal: 12,
                    opacity: pending ? 0.5 : pressed ? 0.65 : 1,
                  })}
                >
                  <Text style={{ color: labelColor }}>
                    {labels.remove}
                  </Text>
                </Pressable>
              </View>
            );
          })
        )}
      </GlassSurface>
      <GlassSurface
        shape="roundedRectangle"
        cornerRadius={18}
        style={{ borderRadius: 18, overflow: "hidden" }}
        fallbackStyle={{
          backgroundColor: cardBg,
          borderRadius: 18,
          borderWidth: 0.5,
          borderColor: cardBorder,
          ...surfaceShadow,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: pending }}
          disabled={pending}
          onPress={onAdd}
          style={({ pressed }) => ({
            minHeight: 52,
            justifyContent: "center",
            paddingHorizontal: 18,
            opacity: pending ? 0.5 : pressed ? 0.65 : 1,
          })}
        >
          <Text style={{ color: labelColor, ...typeScale.cardTitle }}>{labels.add}</Text>
        </Pressable>
      </GlassSurface>
    </View>
  );
}
