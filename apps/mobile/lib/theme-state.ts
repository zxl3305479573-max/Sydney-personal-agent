import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { createThemeManager } from "./theme-manager";

export const themeManager = createThemeManager(SecureStore, Platform?.OS ?? "ios");
