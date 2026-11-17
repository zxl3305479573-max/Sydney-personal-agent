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
  useResolvedAppearance();
  return (
    <View style={{ gap: 12 }}>
      <GlassSurface
        shape="roundedRectangle"
        cornerRadius={14}
        style={{ borderRadius: 14, overflow: "hidden" }}
        fallbackStyle={{ backgroundColor: native.fill }}
      >
        {state.status === "loading" ? (
          <View accessibilityLiveRegion="polite" style={{ padding: 16, gap: 8 }}>
            <ActivityIndicator />
            <Text style={{ color: native.secondaryLabel }}>{labels.loading}</Text>
          </View>
        ) : state.status === "error" ? (
          <Text accessibilityRole="alert" style={{ padding: 16, color: native.label }}>
            {labels.error}
          </Text>
        ) : state.workspaces.length === 0 ? (
          <Text style={{ padding: 16, color: native.secondaryLabel }}>{labels.empty}</Text>
        ) : (
          state.workspaces.map((workspace) => {
            const selected = workspace.id === selectedId;
            const status = labels.connectionStatus[workspace.connectionStatus];
            return (
              <View
                key={workspace.id}
                style={{ flexDirection: "row", alignItems: "center", paddingRight: 8 }}
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
                    minHeight: 64,
                    alignSelf: "stretch",
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    gap: 4,
                    backgroundColor: selected ? native.fillPressed : "transparent",
                    opacity: pending ? 0.5 : pressed ? 0.65 : 1,
                  })}
                >
                  <Text style={{ color: native.label, ...typeScale.cardTitle }}>
                    {workspace.name}
                  </Text>
                  <Text style={{ color: native.secondaryLabel }}>
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
                  <Text style={{ color: native.label }}>
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
        cornerRadius={14}
        style={{ borderRadius: 14, overflow: "hidden" }}
        fallbackStyle={{ backgroundColor: native.fill }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: pending }}
          disabled={pending}
          onPress={onAdd}
          style={({ pressed }) => ({
            minHeight: 48,
            justifyContent: "center",
            paddingHorizontal: 16,
            opacity: pending ? 0.5 : pressed ? 0.65 : 1,
          })}
        >
          <Text style={{ color: native.label, ...typeScale.cardTitle }}>{labels.add}</Text>
        </Pressable>
      </GlassSurface>
    </View>
  );
}
