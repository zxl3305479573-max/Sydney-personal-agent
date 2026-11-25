import { BOT_AVATAR_VALUE_MAX_LENGTH, isBotAvatarValue } from "@rakazo/contracts";
import { File } from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Image } from "react-native";

export const BUILT_IN_BOT_AVATARS = [
  { id: "lilac-dragon", name: "紫晶", source: require("../assets/bot-avatars/lilac-dragon.webp") },
  {
    id: "orange-flower",
    name: "橙花",
    source: require("../assets/bot-avatars/orange-flower.webp"),
  },
  { id: "blue-maid", name: "蓝羽", source: require("../assets/bot-avatars/blue-maid.webp") },
] as const;

function validateAvatar(value: string): string {
  if (value.length > BOT_AVATAR_VALUE_MAX_LENGTH || !isBotAvatarValue(value))
    throw new Error("Could not prepare avatar");
  return value;
}

export async function bundledBotAvatar(source: number): Promise<string> {
  const uri = Image.resolveAssetSource(source)?.uri;
  if (!uri) throw new Error("Could not load avatar");
  if (uri.startsWith("file://")) {
    return validateAvatar(`data:image/webp;base64,${await new File(uri).base64()}`);
  }
  const response = await fetch(uri);
  if (!response.ok) throw new Error("Could not load avatar");
  const blob = await response.blob();
  if (blob.size > BOT_AVATAR_VALUE_MAX_LENGTH) throw new Error("Avatar is too large");
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read avatar"));
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result.split(",")[1] : undefined;
      if (value) resolve(value);
      else reject(new Error("Could not read avatar"));
    };
    reader.readAsDataURL(blob);
  });
  return validateAvatar(`data:image/webp;base64,${base64}`);
}

export async function pickBotAvatar(): Promise<string | null> {
  const selected = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (selected.canceled) return null;
  const source = selected.assets[0];
  if (!source) throw new Error("Could not read avatar");
  const context = ImageManipulator.ImageManipulator.manipulate(source.uri);
  context.resize({ width: 256, height: 256 });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({
    format: ImageManipulator.SaveFormat.JPEG,
    compress: 0.75,
    base64: true,
  });
  if (!saved.base64) throw new Error("Could not prepare avatar");
  return validateAvatar(`data:image/jpeg;base64,${saved.base64}`);
}
