import { Platform } from "react-native";
import { effectiveThemeAssignments } from "./theme-manager";
import type { ThemeAssignments, ThemePackV1, ThemeScope, ThemeTarget } from "./theme-pack";
import { isBuiltInTheme } from "./theme-pack";
import { themeManager } from "./theme-state";
import {
  beginUiModePreview,
  cancelUiModePreview,
  commitUiModePreview,
  getUiModeSnapshot,
  resetUiModeToClassic,
  setUiMode,
} from "./ui-mode";

export type UnifiedThemePreview = {
  target: ThemeTarget;
  packId: string | null;
};

export type UnifiedThemeState = {
  hydrated: boolean;
  packsReady: boolean;
  packs: readonly ThemePackV1[];
  savedAssignments: ThemeAssignments;
  effectiveAssignments: ThemeAssignments;
  preview: UnifiedThemePreview | null;
  warning: string | null;
  canRestoreDefault: boolean;
};

function builtInMirrorForGlobal(globalPackId: string): "classic" | "midnight" {
  return globalPackId === "midnight" ? "midnight" : "classic";
}

function syncUiModePreviewForGlobal(globalPackId: string) {
  const mirror = builtInMirrorForGlobal(globalPackId);
  const current = getUiModeSnapshot();
  if (current.savedModeId === mirror) {
    cancelUiModePreview();
    return;
  }
  try {
    beginUiModePreview(mirror);
  } catch {
    cancelUiModePreview();
  }
}

async function syncUiModeCommitForGlobal(globalPackId: string) {
  const mirror = builtInMirrorForGlobal(globalPackId);
  if (mirror === "classic") {
    await resetUiModeToClassic();
    return;
  }
  await setUiMode(mirror);
}

export function getUnifiedThemeState(platform = Platform.OS): UnifiedThemeState {
  const uiModeSnapshot = getUiModeSnapshot();
  const themeSnapshot = themeManager.getSnapshot();
  const packsReady = platform === "ios" && themeSnapshot.hydrated;

  if (packsReady) {
    const savedAssignments = themeSnapshot.assignments;
    const effectiveAssignments = effectiveThemeAssignments(themeSnapshot);
    const preview: UnifiedThemePreview | null = themeSnapshot.preview
      ? { target: themeSnapshot.preview.target, packId: themeSnapshot.preview.packId }
      : null;
    const canRestoreDefault =
      savedAssignments.globalPackId !== "classic" ||
      Object.keys(savedAssignments.pages).length > 0 ||
      preview !== null;
    return {
      hydrated: true,
      packsReady: true,
      packs: themeSnapshot.packs,
      savedAssignments,
      effectiveAssignments,
      preview,
      warning: themeSnapshot.warning,
      canRestoreDefault,
    };
  }

  const savedGlobal = platform === "ios" ? uiModeSnapshot.savedModeId : "classic";
  const activeGlobal = platform === "ios" ? uiModeSnapshot.activeModeId : "classic";
  const preview: UnifiedThemePreview | null =
    platform === "ios" && uiModeSnapshot.previewModeId !== null
      ? { target: "all", packId: uiModeSnapshot.previewModeId }
      : null;
  return {
    hydrated: uiModeSnapshot.hydrated,
    packsReady: false,
    packs: themeSnapshot.packs,
    savedAssignments: { schemaVersion: 1, globalPackId: savedGlobal, pages: {} },
    effectiveAssignments: { schemaVersion: 1, globalPackId: activeGlobal, pages: {} },
    preview,
    warning: themeSnapshot.warning,
    canRestoreDefault: savedGlobal !== "classic" || preview !== null,
  };
}

export function previewUnifiedTheme(
  target: ThemeTarget,
  packId: string | null,
  platform = Platform.OS,
): void {
  const themeSnapshot = themeManager.getSnapshot();
  if (platform === "ios" && themeSnapshot.hydrated) {
    themeManager.preview(target, packId);
    const updated = themeManager.getSnapshot();
    if (!updated.preview) {
      cancelUiModePreview();
    } else if (updated.preview.target === "all") {
      syncUiModePreviewForGlobal(updated.preview.packId ?? "classic");
    } else {
      cancelUiModePreview();
    }
    return;
  }

  if (target !== "all") {
    throw new Error("Theme settings are still loading");
  }
  const modeId = packId ?? "classic";
  if (getUiModeSnapshot().savedModeId === modeId) {
    cancelUiModePreview();
    return;
  }
  beginUiModePreview(modeId);
}

export function cancelUnifiedThemePreview(): void {
  cancelUiModePreview();
  themeManager.cancelPreview();
}

export async function commitUnifiedThemePreview(platform = Platform.OS): Promise<void> {
  const themeSnapshot = themeManager.getSnapshot();
  if (platform === "ios" && themeSnapshot.hydrated && themeSnapshot.preview) {
    const pending = themeSnapshot.preview;
    await themeManager.commitPreview();
    if (pending.target === "all") {
      await syncUiModeCommitForGlobal(pending.packId ?? "classic");
    } else {
      cancelUiModePreview();
    }
    return;
  }

  if (getUiModeSnapshot().previewModeId !== null) {
    await commitUiModePreview();
  }
}

export async function assignUnifiedTheme(
  target: ThemeTarget,
  packId: string | null,
  platform = Platform.OS,
): Promise<void> {
  const themeSnapshot = themeManager.getSnapshot();
  if (platform === "ios" && themeSnapshot.hydrated) {
    await themeManager.assign(target, packId);
    if (target === "all") {
      await syncUiModeCommitForGlobal(packId ?? "classic");
    } else {
      cancelUiModePreview();
    }
    return;
  }

  if (target !== "all") {
    throw new Error("Theme settings are still loading");
  }
  await syncUiModeCommitForGlobal(packId ?? "classic");
}

export async function uninstallUnifiedThemePack(packId: string): Promise<void> {
  const wasGlobal = themeManager.getSnapshot().assignments.globalPackId === packId;
  await themeManager.uninstall(packId);
  if (wasGlobal) {
    await syncUiModeCommitForGlobal(themeManager.getSnapshot().assignments.globalPackId);
  } else {
    cancelUiModePreview();
  }
}

export async function resetUnifiedThemeToDefault(platform = Platform.OS): Promise<void> {
  const themeSnapshot = themeManager.getSnapshot();
  if (platform === "ios" && themeSnapshot.hydrated) {
    await themeManager.reset();
  } else {
    themeManager.cancelPreview();
  }
  await resetUiModeToClassic();
}

export async function reconcileUiModeAfterThemeLoad(platform = Platform.OS): Promise<void> {
  if (platform !== "ios") return;
  const themeSnapshot = themeManager.getSnapshot();
  if (!themeSnapshot.hydrated) return;
  const desired = builtInMirrorForGlobal(themeSnapshot.assignments.globalPackId);
  const current = getUiModeSnapshot();
  if (current.savedModeId === desired && current.previewModeId === null) return;
  if (desired === "classic") {
    await resetUiModeToClassic();
  } else {
    await setUiMode(desired);
  }
}

export function themePackDisplayName(
  packs: readonly ThemePackV1[],
  packId: string,
  locale: string,
): string {
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  if (packId === "classic") return chinese ? (traditional ? "經典" : "经典") : "Classic";
  if (packId === "midnight") return chinese ? "午夜" : "Midnight";
  return packs.find((pack) => pack.id === packId)?.name ?? packId;
}

export function formatUnifiedThemeSummary(state: UnifiedThemeState, locale: string): string {
  const globalLabel = themePackDisplayName(
    state.packs,
    state.savedAssignments.globalPackId,
    locale,
  );
  const overrideCount = Object.keys(state.savedAssignments.pages).length;
  if (overrideCount === 0) return globalLabel;
  if (locale.startsWith("zh")) {
    return locale === "zh-TW"
      ? `${globalLabel} · ${overrideCount} 頁自訂`
      : `${globalLabel} · ${overrideCount} 页自定义`;
  }
  return `${globalLabel} · ${overrideCount} ${overrideCount === 1 ? "page" : "pages"}`;
}

export function isCustomThemePack(pack: ThemePackV1): boolean {
  return !isBuiltInTheme(pack.id);
}

export function scopeLabel(scope: ThemeScope | "all", locale: string): string {
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  if (scope === "all") return chinese ? (traditional ? "全部介面" : "全部界面") : "All screens";
  if (chinese) {
    const map: Record<ThemeScope, string> = traditional
      ? {
          inbox: "首頁",
          thread: "單聊",
          groupThread: "群聊",
          projects: "專案",
          projectThread: "專案對話",
          github: "GitHub",
          computer: "電腦",
          settings: "設定",
          auth: "登入與伺服器",
          search: "搜尋",
          routines: "排程與看板",
          integrations: "應用整合",
          artifacts: "產物與圖片",
          profile: "資料與選項",
          other: "其他頁面",
        }
      : {
          inbox: "首页",
          thread: "单聊",
          groupThread: "群聊",
          projects: "项目",
          projectThread: "项目会话",
          github: "GitHub",
          computer: "电脑",
          settings: "设置",
          auth: "登录与服务器",
          search: "搜索",
          routines: "日程与看板",
          integrations: "应用集成",
          artifacts: "产物与图片",
          profile: "资料与选项",
          other: "其他页面",
        };
    return map[scope];
  }
  const en: Record<ThemeScope, string> = {
    inbox: "Home",
    thread: "Thread",
    groupThread: "Group chat",
    projects: "Projects",
    projectThread: "Project chat",
    github: "GitHub",
    computer: "Computer",
    settings: "Settings",
    auth: "Sign in & Server",
    search: "Search",
    routines: "Routines & Board",
    integrations: "Integrations",
    artifacts: "Artifacts & Media",
    profile: "Profiles & Sheets",
    other: "Other screens",
  };
  return en[scope];
}

export function localizeThemeWarning(warning: string | null, locale: string): string | null {
  if (!warning) return null;
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  if (!chinese) return warning;
  if (warning.includes("Some theme files could not be loaded")) {
    return traditional
      ? "部分主題檔案無法載入，內建主題仍可正常使用。"
      : "部分主题文件无法加载，内置主题仍可正常使用。";
  }
  if (warning.includes("Theme settings could not be read or saved")) {
    return traditional
      ? "主題設定讀取或儲存失敗，重新啟動前請確認目前選擇。"
      : "主题设置读取或保存失败，重启前请确认当前选择。";
  }
  return warning;
}

export function localizeThemeError(error: unknown, locale: string, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!raw) return fallback;
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  const pick = (zh: string, zhTw: string, en: string) => (chinese ? (traditional ? zhTw : zh) : en);

  if (raw.includes(".sydney-theme.json")) {
    return pick(
      "请选择后缀为 .sydney-theme.json 的主题包文件。",
      "請選擇副檔名為 .sydney-theme.json 的主題包檔案。",
      "Select a .sydney-theme.json theme pack file.",
    );
  }
  if (error instanceof SyntaxError || /JSON/i.test(raw)) {
    return pick(
      "主题文件 JSON 格式无效，请检查文件内容后重试。",
      "主題檔案 JSON 格式無效，請檢查檔案內容後重試。",
      "The theme file is not valid JSON.",
    );
  }
  if (raw.includes("exceeds 10 MiB")) {
    return pick(
      "主题包文件超过 10 MiB 上限，无法导入。",
      "主題包檔案超過 10 MiB 上限，無法匯入。",
      "Theme file exceeds the 10 MiB limit.",
    );
  }
  if (raw.includes("Unsupported theme schema version")) {
    return pick(
      "不支持的主题协议版本，请升级应用或使用 v1 主题包。",
      "不支援的主題協定版本，請升級應用程式或使用 v1 主題包。",
      "Unsupported theme schema version.",
    );
  }
  if (raw.includes("Invalid or protected theme ID") || raw.includes("Invalid local theme ID")) {
    return pick(
      "主题 ID 无效或与内置主题冲突，无法导入。",
      "主題 ID 無效或與內建主題衝突，無法匯入。",
      "Invalid or reserved theme ID.",
    );
  }
  if (raw.includes("unsupported field")) {
    return pick(
      "主题包含不受支持的字段，已按安全策略拒绝导入。",
      "主題包含不支援的欄位，已依安全策略拒絕匯入。",
      "Theme contains unsupported fields and was rejected.",
    );
  }
  if (raw.includes("invalid color")) {
    return pick(
      "主题包包含无效的颜色值（仅支持 #RRGGBB 或 #RRGGBBAA）。",
      "主題包包含無效的顏色值（僅支援 #RRGGBB 或 #RRGGBBAA）。",
      "Theme contains an invalid color value.",
    );
  }
  if (raw.includes("invalid layout") || raw.includes("invalid surface")) {
    return pick(
      "主题包包含不支持的布局或材质设置。",
      "主題包包含不支援的佈局或材質設定。",
      "Theme specifies an unsupported layout or surface style.",
    );
  }
  if (
    raw.includes("PNG/JPEG") ||
    raw.includes("PNG header") ||
    raw.includes("Incomplete PNG") ||
    raw.includes("JPEG header") ||
    raw.includes("1–4096") ||
    raw.includes("could not be decoded") ||
    raw.includes("dimensions do not match") ||
    raw.includes("at most two backgrounds") ||
    raw.includes("unknown background asset") ||
    raw.includes("background.opacity") ||
    raw.includes("background.overlayOpacity")
  ) {
    return pick(
      "主题背景图片或遮罩配置校验失败（最多 2 张 1–4096 像素本地 PNG/JPEG，透明度与遮罩范围 0–0.6）。",
      "主題背景圖片或遮罩設定驗證失敗（最多 2 張 1–4096 像素本機 PNG/JPEG，透明度與遮罩範圍 0–0.6）。",
      "Background image or overlay validation failed (up to 2 local PNG/JPEG images, 1–4096 px, opacity/overlay 0–0.6).",
    );
  }
  if (raw.includes("Invalid theme coverage") || raw.includes("Unsupported page")) {
    return pick(
      "主题包声明的适用页面范围无效。",
      "主題包宣告的適用頁面範圍無效。",
      "Theme declares an invalid page coverage scope.",
    );
  }
  if (raw.includes("does not support the selected page")) {
    return pick(
      "该主题包不支持应用到所选页面。",
      "該主題包不支援套用到所選頁面。",
      "This theme pack does not support the selected page.",
    );
  }
  if (raw.includes("already installed")) {
    return pick(
      "该主题包已安装，请确认是否替换现有文件。",
      "該主題包已安裝，請確認是否替換現有檔案。",
      "This theme pack is already installed. Confirm replacement to update it.",
    );
  }
  if (raw.includes("Built-in themes cannot be removed")) {
    return pick("内置主题不可卸载。", "內建主題不可卸載。", "Built-in themes cannot be removed.");
  }
  if (raw.includes("available on iPhone only")) {
    return pick(
      "自定义主题包当前仅支持在 iPhone 上使用。",
      "自訂主題包目前僅支援在 iPhone 上使用。",
      "Custom theme packs are currently available on iPhone only.",
    );
  }
  if (raw.includes("still loading") || raw.includes("not available")) {
    return pick(
      "主题设置正在加载，请稍后重试。",
      "主題設定正在載入，請稍後重試。",
      "Theme settings are still loading. Please try again.",
    );
  }
  return chinese ? fallback : raw;
}
