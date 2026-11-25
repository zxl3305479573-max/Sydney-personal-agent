import type { MemoryDocument, ScratchpadItem } from "@rakazo/contracts";
import { isEmptyBotMemory } from "@rakazo/contracts";
import { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { rpc } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { native, useMobileTokens } from "../lib/native";
import { projectRequestOptions, projectScopeKey } from "../lib/project-scope";
import { errorText } from "../lib/user-error";
import { GlassSurface } from "./glass-surface";
import { MotionPressable } from "./motion-pressable";
import { NativeSymbol } from "./native-symbol";
import { ProfileEditDialog } from "./profile-edit-dialog";

export function BotContextCards({
  botId,
  projectId,
  scope,
}: {
  botId: string;
  projectId?: string;
  scope?: string;
}) {
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const [work, setWork] = useState<ScratchpadItem[]>([]);
  const [docs, setDocs] = useState<MemoryDocument[]>([]);
  const [allWork, setAllWork] = useState(false);
  const [allDocs, setAllDocs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    setError(null);
    if (projectId && scope) {
      void projectRequestOptions(scope)
        .then((options) => rpc("projectWorkspaces/botContext", { projectId, botId }, options))
        .then(({ work: items, docs: memoryDocs }) => {
          if (current && scope === projectScopeKey()) {
            setWork(items);
            setDocs(memoryDocs.filter((doc) => !isEmptyBotMemory(doc)));
          }
        })
        .catch((err) => {
          if (current && scope === projectScopeKey()) setError(errorText(err));
        });
    } else {
      void rpc("scratchpad/list", { botId })
        .then((items) => {
          if (current) setWork(items);
        })
        .catch((err) => {
          if (current) setError(errorText(err));
        });
      void rpc("memory/list", { botId, scope: "bot" })
        .then((memoryDocs) => {
          if (current) setDocs(memoryDocs.filter((doc) => !isEmptyBotMemory(doc)));
        })
        .catch((err) => {
          if (current) setError(errorText(err));
        });
    }
    return () => {
      current = false;
    };
  }, [botId, projectId, scope]);
  const heading = { color: tokens.mutedForeground, fontSize: 12, fontWeight: "500" as const };
  const card = { borderRadius: 12, padding: 16, gap: 12 };
  return (
    <>
      {work.length ? (
        <View style={{ marginTop: 24 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
              paddingEnd: 16,
            }}
          >
            <Text accessibilityRole="header" style={heading}>
              {t("Open work")}
            </Text>
            <ProfileEditDialog
              value=""
              label={t("Add open work")}
              editLabel={t("Add open work")}
              maxLength={200}
              icon="plus"
              onCommit={async (title) => {
                if (!title || busy) return;
                setBusy(true);
                try {
                  const result =
                    projectId && scope
                      ? await rpc(
                          "projectWorkspaces/botContextAction",
                          { projectId, botId, title, action: "create" },
                          await projectRequestOptions(scope),
                        )
                      : { item: await rpc("scratchpad/create", { botId, title }) };
                  if (result.item) setWork((items) => [result.item!, ...items]);
                } catch (err) {
                  setError(errorText(err));
                } finally {
                  setBusy(false);
                }
              }}
            />
          </View>
          <GlassSurface
            shape="roundedRectangle"
            cornerRadius={12}
            style={card}
            fallbackStyle={{ backgroundColor: native.fill }}
          >
            {(allWork ? work : work.slice(0, 5)).map((item) => (
              <View
                key={item.id}
                style={{ minHeight: 44, flexDirection: "row", gap: 12, alignItems: "center" }}
              >
                <MotionPressable
                  preset="icon"
                  accessibilityLabel={`${t("Complete")} ${item.title}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: false }}
                  hitSlop={11}
                  style={{
                    width: 22,
                    minHeight: 22,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  disabled={busy}
                  onPress={() => {
                    setBusy(true);
                    void (
                      projectId && scope
                        ? projectRequestOptions(scope).then((options) =>
                            rpc(
                              "projectWorkspaces/botContextAction",
                              { projectId, botId, itemId: item.id, action: "complete" },
                              options,
                            ),
                          )
                        : rpc("scratchpad/update", { itemId: item.id, status: "done" })
                    )
                      .then(() => setWork((items) => items.filter((entry) => entry.id !== item.id)))
                      .catch((err) => setError(errorText(err)))
                      .finally(() => setBusy(false));
                  }}
                >
                  <NativeSymbol
                    ios="circle"
                    android="ellipse-outline"
                    size={22}
                    color={tokens.mutedForeground}
                  />
                </MotionPressable>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: tokens.foreground, fontSize: 14 }}>{item.title}</Text>
                  {item.notes ? (
                    <Text style={{ color: tokens.mutedForeground, fontSize: 12, marginTop: 4 }}>
                      {item.notes}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
            {!allWork && work.length > 5 ? (
              <MotionPressable
                preset="inline"
                accessibilityRole="button"
                onPress={() => setAllWork(true)}
                style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: tokens.mutedForeground }}>{t("Show more")}</Text>
              </MotionPressable>
            ) : null}
          </GlassSurface>
        </View>
      ) : null}
      {docs.length ? (
        <View style={{ marginTop: 24 }}>
          <Text accessibilityRole="header" style={[heading, { marginBottom: 8 }]}>
            {t("Memory")}
          </Text>
          <GlassSurface
            shape="roundedRectangle"
            cornerRadius={12}
            style={card}
            fallbackStyle={{ backgroundColor: native.fill }}
          >
            {(allDocs ? docs : docs.slice(0, 5)).map((doc) => (
              <MotionPressable
                key={doc.id}
                preset="row"
                highlightColor={native.fillPressed}
                accessibilityRole="button"
                accessibilityLabel={doc.path}
                onPress={() => Alert.alert(doc.path, doc.content)}
                style={{
                  minHeight: 44,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <Text numberOfLines={1} style={{ color: tokens.foreground, fontSize: 14, flex: 1 }}>
                  {doc.path}
                </Text>
                <NativeSymbol
                  ios="chevron.right"
                  android="chevron-forward"
                  size={14}
                  color={native.tertiaryLabel}
                />
              </MotionPressable>
            ))}
            {!allDocs && docs.length > 5 ? (
              <MotionPressable
                preset="inline"
                accessibilityRole="button"
                onPress={() => setAllDocs(true)}
                style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: tokens.mutedForeground }}>{t("Show more")}</Text>
              </MotionPressable>
            ) : null}
          </GlassSurface>
        </View>
      ) : null}
      {error ? <Text style={{ color: tokens.destructive, marginTop: 16 }}>{error}</Text> : null}
    </>
  );
}
