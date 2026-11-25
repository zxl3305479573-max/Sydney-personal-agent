import { Image, StyleSheet, Text, View } from "react-native";
import type { ResolvedScopedTheme } from "../lib/theme-pack";

export type ThemePreviewCardLabels = {
  previewing: string;
  active: string;
  followGlobal: string;
  layoutClassic: string;
  layoutCards: string;
  surfaceFlat: string;
  surfaceOutlined: string;
  surfaceGlass: string;
  sampleTitle: string;
  sampleSubtitle: string;
  sampleSecondaryTitle: string;
  sampleSecondarySubtitle: string;
  sampleBotMessage: string;
  sampleUserMessage: string;
  sampleInput: string;
};

export function ThemePreviewCard({
  theme,
  packName,
  targetLabel,
  isPreview,
  isFollowingGlobal = false,
  contrastWarning = null,
  labels,
}: {
  theme: ResolvedScopedTheme;
  packName: string;
  targetLabel: string;
  isPreview: boolean;
  isFollowingGlobal?: boolean;
  contrastWarning?: string | null;
  labels: ThemePreviewCardLabels;
}) {
  const { tokens, geometry, layout, surface, background, scope } = theme;
  const cardRadius = Math.max(12, Math.min(20, geometry.cardRadius));
  const itemRadius = Math.max(8, Math.min(16, geometry.cardRadius));
  const borderWidth = Math.max(1, geometry.borderWidth);
  const absoluteFill = StyleSheet?.absoluteFill ?? {
    position: "absolute" as const,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  };
  const isThreadScope = scope === "thread" || scope === "groupThread" || scope === "projectThread";
  const layoutText = layout === "cards" ? labels.layoutCards : labels.layoutClassic;
  const surfaceText =
    surface === "glass"
      ? labels.surfaceGlass
      : surface === "outlined"
        ? labels.surfaceOutlined
        : labels.surfaceFlat;
  const statusText = isPreview ? labels.previewing : labels.active;

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`${packName}, ${targetLabel}, ${statusText}`}
      style={{
        borderRadius: cardRadius,
        borderWidth,
        borderColor: isPreview ? tokens.primary : tokens.border,
        backgroundColor: tokens.background,
        overflow: "hidden",
      }}
    >
      {background ? (
        <View pointerEvents="none" style={absoluteFill}>
          <Image
            source={{ uri: background.uri }}
            resizeMode={background.fit}
            accessible={false}
            style={{ width: "100%", height: "100%", opacity: background.opacity }}
          />
          {background.overlayOpacity > 0 ? (
            <View
              style={[
                absoluteFill,
                {
                  backgroundColor: theme.appearance === "dark" ? "#000000" : "#FFFFFF",
                  opacity: background.overlayOpacity,
                },
              ]}
            />
          ) : null}
        </View>
      ) : null}

      <View style={{ padding: 14, gap: 12 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
            <Text style={{ color: tokens.foreground, fontSize: 16, fontWeight: "700" }}>
              {packName}
            </Text>
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
                backgroundColor: tokens.muted,
                borderWidth: surface === "outlined" ? borderWidth : 0,
                borderColor: tokens.border,
              }}
            >
              <Text style={{ color: tokens.mutedForeground, fontSize: 12, fontWeight: "500" }}>
                {targetLabel}
              </Text>
            </View>
            {isFollowingGlobal ? (
              <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
                {labels.followGlobal}
              </Text>
            ) : null}
          </View>
          <View
            style={{
              paddingHorizontal: 9,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: isPreview ? tokens.primary : tokens.secondary,
            }}
          >
            <Text
              style={{
                color: isPreview ? tokens.primaryForeground : tokens.secondaryForeground,
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              {statusText}
            </Text>
          </View>
        </View>

        {isThreadScope ? (
          <View style={{ gap: 8 }}>
            <View
              style={{
                alignSelf: "flex-start",
                maxWidth: "82%",
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: itemRadius,
                backgroundColor: tokens.card,
                borderWidth,
                borderColor: tokens.border,
              }}
            >
              <Text style={{ color: tokens.cardForeground, fontSize: 13 }}>
                {labels.sampleBotMessage}
              </Text>
            </View>
            <View
              style={{
                alignSelf: "flex-end",
                maxWidth: "78%",
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: itemRadius,
                backgroundColor: tokens.chatUser,
              }}
            >
              <Text style={{ color: tokens.chatUserForeground, fontSize: 13 }}>
                {labels.sampleUserMessage}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: Math.max(10, Math.min(20, geometry.controlRadius)),
                backgroundColor: tokens.card,
                borderWidth,
                borderColor: tokens.input,
              }}
            >
              <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
                {labels.sampleInput}
              </Text>
              <View
                accessibilityElementsHidden
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: tokens.primary,
                }}
              />
            </View>
          </View>
        ) : (
          <View style={{ gap: layout === "cards" ? 8 : 0 }}>
            {[
              {
                title: labels.sampleTitle,
                subtitle: labels.sampleSubtitle,
                unread: true,
                accent: tokens.primary,
              },
              {
                title: labels.sampleSecondaryTitle,
                subtitle: labels.sampleSecondarySubtitle,
                unread: false,
                accent: tokens.accent,
              },
            ].map((item, index) => (
              <View
                key={item.title}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingHorizontal: layout === "cards" ? 12 : 4,
                  paddingVertical: layout === "cards" ? 10 : 8,
                  borderRadius: layout === "cards" ? itemRadius : 0,
                  backgroundColor: layout === "cards" ? tokens.card : "transparent",
                  borderWidth: layout === "cards" ? borderWidth : 0,
                  borderTopWidth:
                    layout === "classic" && index > 0 ? 1 : layout === "cards" ? borderWidth : 0,
                  borderColor: tokens.border,
                }}
              >
                <View
                  accessibilityElementsHidden
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: item.accent,
                  }}
                />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text
                    numberOfLines={1}
                    style={{ color: tokens.foreground, fontSize: 13, fontWeight: "600" }}
                  >
                    {item.title}
                  </Text>
                  <Text numberOfLines={1} style={{ color: tokens.mutedForeground, fontSize: 12 }}>
                    {item.subtitle}
                  </Text>
                </View>
                {item.unread ? (
                  <View
                    accessibilityElementsHidden
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: tokens.unread,
                    }}
                  />
                ) : null}
              </View>
            ))}
          </View>
        )}

        {contrastWarning ? (
          <View
            accessibilityRole="alert"
            style={{
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: Math.max(8, Math.min(12, itemRadius)),
              borderWidth: 1,
              borderColor: theme.appearance === "dark" ? "#F59E0B" : "#D97706",
              backgroundColor: theme.appearance === "dark" ? "#3B2606" : "#FEF3C7",
            }}
          >
            <Text
              style={{
                color: theme.appearance === "dark" ? "#FEF3C7" : "#78350F",
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              {contrastWarning}
            </Text>
          </View>
        ) : null}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            flexWrap: "wrap",
            paddingTop: 4,
            borderTopWidth: 1,
            borderTopColor: tokens.border,
          }}
        >
          <View
            accessibilityElementsHidden
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            {[tokens.background, tokens.card, tokens.primary, tokens.foreground].map(
              (swatch, index) => (
                <View
                  key={`${swatch}-${index}`}
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: swatch,
                    borderWidth: 1,
                    borderColor: tokens.border,
                  }}
                />
              ),
            )}
          </View>
          <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
            {`${layoutText} · ${surfaceText}`}
          </Text>
        </View>
      </View>
    </View>
  );
}
