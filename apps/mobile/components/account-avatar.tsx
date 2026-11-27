import { Image, Text, View } from "react-native";
import { useMobileTokens } from "../lib/native";

export function localAccountAvatarUri(image?: string | null): string | undefined {
  return image?.startsWith("data:image/jpeg;base64,") ? image : undefined;
}

export function AccountAvatar({
  image,
  initial,
  size = 42,
}: {
  image?: string | null;
  initial?: string | null;
  size?: number;
}) {
  const tokens = useMobileTokens();
  const localImage = localAccountAvatarUri(image);
  return (
    <View
      accessibilityElementsHidden
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        backgroundColor: tokens.muted,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {localImage ? (
        <Image source={{ uri: localImage }} style={{ width: size, height: size }} />
      ) : (
        <Text style={{ color: tokens.foreground, fontSize: size * 0.43 }}>{initial ?? "?"}</Text>
      )}
    </View>
  );
}
