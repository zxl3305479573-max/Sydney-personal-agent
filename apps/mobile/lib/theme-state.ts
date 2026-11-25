import * as ReactNative from "react-native";
import { createThemeManager } from "./theme-manager";

function safePlatformOs(): string {
  try {
    return ReactNative.Platform?.OS ?? "ios";
  } catch {
    return "ios";
  }
}

const lazySecureStore = {
  async getItemAsync(key: string) {
    const mod = await import("expo-secure-store");
    return mod.getItemAsync(key);
  },
  async setItemAsync(key: string, value: string) {
    const mod = await import("expo-secure-store");
    return mod.setItemAsync(key, value);
  },
};

export const themeManager = createThemeManager(lazySecureStore, safePlatformOs());
