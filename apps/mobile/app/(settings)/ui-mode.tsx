import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Alert, Platform, ScrollView, Text, View } from "react-native";
import { MotionPressable } from "../../components/motion-pressable";
import { NativeActionButton } from "../../components/native-action-button";
import { SettingsGroup, SettingsRow } from "../../components/settings-group";
import type { ThemePreviewCardLabels } from "../../components/theme-preview-card";
import { ThemePreviewCard } from "../../components/theme-preview-card";
import { resolveUserMobileAppearance } from "../../lib/appearance";
import { useI18n } from "../../lib/i18n";
import { native, useMobileTokens, useResolvedAppearance } from "../../lib/native";
import { useScreenBackground } from "../../lib/scoped-theme-context";
import { useSideInsets } from "../../lib/side-insets";
import type { ContrastPairId } from "../../lib/theme-contrast";
import { evaluatePackContrast, evaluateThemeContrast } from "../../lib/theme-contrast";
import {
  assignUnifiedTheme,
  cancelUnifiedThemePreview,
  commitUnifiedThemePreview,
  getUnifiedThemeState,
  isCustomThemePack,
  localizeThemeError,
  localizeThemeWarning,
  previewUnifiedTheme,
  resetUnifiedThemeToDefault,
  scopeLabel,
  themePackDisplayName,
  uninstallUnifiedThemePack,
} from "../../lib/theme-controls";
import { listPackUsage } from "../../lib/theme-manager";
import type { ThemePackV1, ThemeScope, ThemeTarget } from "../../lib/theme-pack";
import { isThemeScope, resolveScopedTheme, THEME_SCOPES, themeCovers } from "../../lib/theme-pack";
import { STARTER_THEME_PACKS, starterThemeDescription } from "../../lib/theme-presets";
import { themeManager } from "../../lib/theme-state";
import { getUiModeRevision, subscribeUiMode } from "../../lib/ui-mode";
import { listAvailableUiModes } from "../../lib/ui-mode-registry";

const PRIMARY_SCOPES: readonly ThemeScope[] = [
  "inbox",
  "thread",
  "groupThread",
  "projects",
  "projectThread",
  "github",
  "computer",
  "settings",
];

function resolvePackSample(pack: ThemePackV1, appearance: "light" | "dark") {
  const scope: ThemeScope = pack.coverage === "all" ? "inbox" : (pack.coverage[0] ?? "inbox");
  return resolveScopedTheme(
    [pack],
    pack.coverage === "all"
      ? { schemaVersion: 1, globalPackId: pack.id, pages: {} }
      : {
          schemaVersion: 1,
          globalPackId: "classic",
          pages: { [scope]: pack.id },
        },
    scope,
    appearance,
    "ios",
  );
}

function packSwatch(pack: ThemePackV1, appearance: "light" | "dark") {
  const resolved = resolvePackSample(pack, appearance);
  return {
    background: resolved.tokens.background,
    card: resolved.tokens.card,
    accent: resolved.tokens.primary,
    border: resolved.tokens.border,
  };
}

export default function UiModeScreen() {
  const { locale } = useI18n();
  const tokens = useMobileTokens();
  const screenBackground = useScreenBackground(native.groupedPage);
  const resolvedAppearance = useResolvedAppearance();
  const insets = useSideInsets();
  const [busy, setBusy] = useState(false);
  const [expandedScope, setExpandedScope] = useState<ThemeScope | null>(null);
  const [expandedPackId, setExpandedPackId] = useState<string | null>(null);
  const [showMoreScopes, setShowMoreScopes] = useState(false);

  useSyncExternalStore(subscribeUiMode, getUiModeRevision, getUiModeRevision);
  useSyncExternalStore(themeManager.subscribe, themeManager.getSnapshot, themeManager.getSnapshot);

  const isIos = Platform.OS === "ios";
  const unified = getUnifiedThemeState(Platform.OS);
  const builtInModes = listAvailableUiModes(Platform.OS);
  const customPacks = useMemo(() => unified.packs.filter(isCustomThemePack), [unified.packs]);
  const globalCustomPacks = useMemo(
    () => (isIos ? customPacks.filter((pack) => pack.coverage === "all") : []),
    [customPacks, isIos],
  );
  const userAppearance = useMemo(
    () => (isIos ? resolveUserMobileAppearance() : resolvedAppearance),
    [isIos, resolvedAppearance],
  );

  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  const labels = useMemo(() => {
    if (chinese) {
      return {
        title: traditional ? "介面模式" : "界面模式",
        globalSection: traditional ? "全域外觀" : "全局外观",
        classic: traditional ? "經典" : "经典",
        classicDetail: traditional
          ? "原生外觀，沿用明暗與聊天偏好。"
          : "原生外观，沿用明暗与聊天偏好。",
        midnight: "午夜",
        midnightDetail: traditional
          ? "深藍底色與柔和藍色重點，使用深色外觀。"
          : "深蓝底色与柔和蓝色重点，使用深色外观。",
        preview: traditional ? "預覽中" : "预览中",
        active: traditional ? "已套用" : "已应用",
        apply: traditional ? "套用模式" : "应用模式",
        cancel: traditional ? "取消預覽" : "取消预览",
        reset: traditional ? "恢復經典模式" : "恢复经典模式",
        hint: traditional
          ? "點選模式即可預覽；套用後會保留選擇。取消或離開本頁會還原預覽。聊天背景與氣泡設定會保留。"
          : "点选模式即可预览；应用后会保留选择。取消或离开本页会还原预览。聊天背景与气泡设置会保留。",
        error: traditional ? "無法套用模式，請重試。" : "无法应用模式，请重试。",
        perPageSection: traditional ? "按頁面分配" : "按页面分配",
        perPageFooter: traditional
          ? "未單獨指定的頁面會繼承全域外觀；局部覆蓋只會影響對應頁面。"
          : "未单独指定的页面会继承全局外观；局部覆盖只会影响对应页面。",
        followGlobal: traditional ? "跟隨全域" : "跟随全局",
        clearOverride: traditional ? "清除此頁覆蓋" : "清除此页覆盖",
        morePages: traditional ? "展開更多頁面" : "展开更多页面",
        fewerPages: traditional ? "收合更多頁面" : "收起更多页面",
        packsSection: traditional ? "主題包" : "主题包",
        packsFooter: traditional
          ? "主題包只讀取聲明式顏色、佈局與本地圖片，不會執行程式碼。"
          : "主题包只读取声明式颜色、布局与本地图片，不会执行代码。",
        importPack: traditional ? "匯入主題包" : "导入主题包",
        loadStarter: (name: string) => (traditional ? `載入範例 · ${name}` : `载入示例 · ${name}`),
        noPacksHint: traditional
          ? "尚未安裝自訂主題包。匯入 .sydney-theme.json 後，可套用到全部介面或單獨頁面。"
          : "尚未安装自定义主题包。导入 .sydney-theme.json 后，可应用到全部界面或单独页面。",
        previewPack: traditional ? "預覽" : "预览",
        showDetails: traditional ? "詳情" : "详情",
        hideDetails: traditional ? "收起詳情" : "收起详情",
        uninstall: traditional ? "卸載" : "卸载",
        unused: traditional ? "未啟用" : "未启用",
        usedIn: traditional ? "目前用於：" : "当前用于：",
        none: traditional ? "無" : "无",
        detailIdVersion: (id: string, version: string) => `ID：${id} · v${version}`,
        detailCoverage: (text: string) => (traditional ? `覆蓋範圍：${text}` : `覆盖范围：${text}`),
        detailCustomPages: (text: string) =>
          traditional ? `自訂頁面：${text}` : `自定义页面：${text}`,
        detailStyle: (
          layoutText: string,
          surfaceText: string,
          cardRadius: number,
          controlRadius: number,
          borderWidth: number,
        ) =>
          traditional
            ? `樣式：${layoutText} · ${surfaceText}（卡片圓角 ${cardRadius} / 控制項 ${controlRadius} / 邊框 ${borderWidth}）`
            : `样式：${layoutText} · ${surfaceText}（卡片圆角 ${cardRadius} / 控件 ${controlRadius} / 边框 ${borderWidth}）`,
        detailColors: (bg: string, card: string, primary: string, fg: string) =>
          traditional
            ? `色值：背景 ${bg} · 卡片 ${card} · 重點 ${primary} · 文字 ${fg}`
            : `色值：背景 ${bg} · 卡片 ${card} · 重点 ${primary} · 文字 ${fg}`,
        detailBackgrounds: (count: number) =>
          traditional ? `背景圖片：${count} 張` : `背景图片：${count} 张`,
        detailContrast: (status: string) =>
          traditional ? `對比度檢查：${status}` : `对比度检查：${status}`,
        contrastOk: traditional ? "通過（WCAG AA）" : "通过（WCAG AA）",
        contrastWarnings: (count: number, hasSevere: boolean) =>
          traditional
            ? `${count} 項警告${hasSevere ? "（含嚴重低對比度）" : ""}`
            : `${count} 项警告${hasSevere ? "（含严重低对比度）" : ""}`,
        contrastPair: {
          text: "正文",
          card: "卡片文字",
          primary: traditional ? "主按鈕" : "主按钮",
          chatUser: traditional ? "使用者氣泡" : "用户气泡",
        } satisfies Record<ContrastPairId, string>,
        previewContrastWarning: (hasSevere: boolean, minRatio: string, pairs: string) =>
          hasSevere
            ? traditional
              ? `對比度過低（最低 ${minRatio}:1，${pairs}可能難以辨認）`
              : `对比度过低（最低 ${minRatio}:1，${pairs}可能难以辨认）`
            : traditional
              ? `對比度偏低（最低 ${minRatio}:1，${pairs}低於 4.5:1 建議值）`
              : `对比度偏低（最低 ${minRatio}:1，${pairs}低于 4.5:1 建议值）`,
        contrastAlertTitle: traditional ? "已安裝，但對比度過低" : "已安装，但对比度过低",
        contrastAlertMessage: (name: string, minRatio: string) =>
          traditional
            ? `「${name}」已匯入本機，但部分配色對比度僅 ${minRatio}:1，文字可能不易辨認。建議先預覽確認，隨時可恢復經典模式。`
            : `「${name}」已导入本机，但部分配色对比度仅 ${minRatio}:1，文字可能不易辨认。建议先预览确认，随时可恢复经典模式。`,
        replaceTitle: traditional ? "替換主題包？" : "替换主题包？",
        replaceMessage: (name: string) =>
          traditional
            ? `已安裝「${name}」。替換後會更新現有主題檔案。`
            : `已安装「${name}」。替换后会更新现有主题文件。`,
        replaceConfirm: traditional ? "替換" : "替换",
        uninstallTitle: traditional ? "卸載主題包？" : "卸载主题包？",
        uninstallMessage: (name: string, usageText: string | null) =>
          usageText
            ? traditional
              ? `卸載「${name}」後，${usageText}將自動恢復為預設外觀，聊天資料不受影響。`
              : `卸载「${name}」后，${usageText}将自动恢复为默认外观，聊天数据不受影响。`
            : traditional
              ? `將移除本機儲存的「${name}」主題檔案，聊天資料不受影響。`
              : `将移除本机保存的「${name}」主题文件，聊天数据不受影响。`,
        cancelDialog: traditional ? "取消" : "取消",
        previewBanner: (targetName: string, packName: string | null) =>
          packName === null
            ? traditional
              ? `預覽中：${targetName}將恢復跟隨全域`
              : `预览中：${targetName}将恢复跟随全局`
            : traditional
              ? `預覽中：${packName} · ${targetName}`
              : `预览中：${packName} · ${targetName}`,
        layoutClassic: traditional ? "經典列表" : "经典列表",
        layoutCards: traditional ? "卡片佈局" : "卡片布局",
        surfaceFlat: traditional ? "平面" : "平面",
        surfaceOutlined: traditional ? "描邊" : "描边",
        surfaceGlass: traditional ? "玻璃" : "玻璃",
        previewCard: {
          previewing: traditional ? "預覽中" : "预览中",
          active: traditional ? "已套用" : "已应用",
          followGlobal: traditional ? "跟隨全域" : "跟随全局",
          layoutClassic: traditional ? "經典列表" : "经典列表",
          layoutCards: traditional ? "卡片佈局" : "卡片布局",
          surfaceFlat: traditional ? "平面" : "平面",
          surfaceOutlined: traditional ? "描邊" : "描边",
          surfaceGlass: traditional ? "玻璃" : "玻璃",
          sampleTitle: "Sydney",
          sampleSubtitle: traditional ? "已整理好今日待辦與摘要" : "已整理好今日待办与摘要",
          sampleSecondaryTitle: traditional ? "設計協作群" : "设计协作群",
          sampleSecondarySubtitle: traditional ? "剛剛更新了配色方案" : "刚刚更新了配色方案",
          sampleBotMessage: traditional
            ? "這套外觀已套用到聊天區域。"
            : "这套外观已应用到聊天区域。",
          sampleUserMessage: traditional ? "看起來清晰多了" : "看起来清晰多了",
          sampleInput: traditional ? "輸入訊息…" : "输入消息…",
        } satisfies ThemePreviewCardLabels,
      };
    }

    return {
      title: "Interface mode",
      globalSection: "Global appearance",
      classic: "Classic",
      classicDetail: "Native appearance with your light, dark and chat preferences.",
      midnight: "Midnight",
      midnightDetail: "Deep blue surfaces with a soft blue accent. Uses dark appearance.",
      preview: "Previewing",
      active: "Applied",
      apply: "Apply mode",
      cancel: "Cancel preview",
      reset: "Restore Classic",
      hint: "Tap a mode to preview it, then apply to keep your choice. Cancel or leave this page to undo the preview. Chat backgrounds and bubble settings are kept.",
      error: "Could not apply the mode. Please try again.",
      perPageSection: "Per-page overrides",
      perPageFooter:
        "Pages without an override inherit the global theme. Local overrides only affect that page type.",
      followGlobal: "Follow global",
      clearOverride: "Clear override",
      morePages: "Show more pages",
      fewerPages: "Hide extra pages",
      packsSection: "Theme packs",
      packsFooter:
        "Theme packs use declarative colors, layouts and local images only. No executable code runs.",
      importPack: "Import theme pack",
      loadStarter: (name: string) => `Load starter · ${name}`,
      noPacksHint:
        "No custom theme packs installed yet. Import a .sydney-theme.json file to style all screens or individual pages.",
      previewPack: "Preview",
      showDetails: "Details",
      hideDetails: "Hide details",
      uninstall: "Uninstall",
      unused: "Not applied",
      usedIn: "Active on: ",
      none: "None",
      detailIdVersion: (id: string, version: string) => `ID: ${id} · v${version}`,
      detailCoverage: (text: string) => `Coverage: ${text}`,
      detailCustomPages: (text: string) => `Custom pages: ${text}`,
      detailStyle: (
        layoutText: string,
        surfaceText: string,
        cardRadius: number,
        controlRadius: number,
        borderWidth: number,
      ) =>
        `Style: ${layoutText} · ${surfaceText} (cardRadius ${cardRadius} / controlRadius ${controlRadius} / borderWidth ${borderWidth})`,
      detailColors: (bg: string, card: string, primary: string, fg: string) =>
        `Colors: bg ${bg} · card ${card} · primary ${primary} · text ${fg}`,
      detailBackgrounds: (count: number) => `Background assets: ${count}`,
      detailContrast: (status: string) => `Contrast check: ${status}`,
      contrastOk: "OK (WCAG AA)",
      contrastWarnings: (count: number, hasSevere: boolean) =>
        `${count} ${count === 1 ? "warning" : "warnings"}${hasSevere ? " (severe)" : ""}`,
      contrastPair: {
        text: "body text",
        card: "card text",
        primary: "primary button",
        chatUser: "user bubble",
      } satisfies Record<ContrastPairId, string>,
      previewContrastWarning: (hasSevere: boolean, minRatio: string, pairs: string) =>
        hasSevere
          ? `Very low contrast (min ${minRatio}:1 — ${pairs} may be hard to read)`
          : `Low contrast (min ${minRatio}:1 — ${pairs} below 4.5:1 AA)`,
      contrastAlertTitle: "Installed with low contrast",
      contrastAlertMessage: (name: string, minRatio: string) =>
        `"${name}" was installed, but some color pairs drop to ${minRatio}:1 and may be hard to read. Preview before applying, or restore Classic anytime.`,
      replaceTitle: "Replace theme pack?",
      replaceMessage: (name: string) =>
        `"${name}" is already installed. Replacing it updates the existing theme file.`,
      replaceConfirm: "Replace",
      uninstallTitle: "Uninstall theme pack?",
      uninstallMessage: (name: string, usageText: string | null) =>
        usageText
          ? `Removing "${name}" will reset ${usageText} back to the fallback appearance. Your chats stay untouched.`
          : `Remove the local theme pack "${name}"? Your chats stay untouched.`,
      cancelDialog: "Cancel",
      previewBanner: (targetName: string, packName: string | null) =>
        packName === null
          ? `Previewing: ${targetName} follows global`
          : `Previewing: ${packName} · ${targetName}`,
      layoutClassic: "Classic list",
      layoutCards: "Card layout",
      surfaceFlat: "Flat",
      surfaceOutlined: "Outlined",
      surfaceGlass: "Glass",
      previewCard: {
        previewing: "Previewing",
        active: "Applied",
        followGlobal: "Follows global",
        layoutClassic: "Classic list",
        layoutCards: "Card layout",
        surfaceFlat: "Flat",
        surfaceOutlined: "Outlined",
        surfaceGlass: "Glass",
        sampleTitle: "Sydney",
        sampleSubtitle: "Prepared your summary for today",
        sampleSecondaryTitle: "Design squad",
        sampleSecondarySubtitle: "Shared updated theme tokens",
        sampleBotMessage: "This theme is active for conversations.",
        sampleUserMessage: "Looks crisp and readable",
        sampleInput: "Message…",
      } satisfies ThemePreviewCardLabels,
    };
  }, [chinese, traditional]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        cancelUnifiedThemePreview();
      };
    }, []),
  );

  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      Alert.alert(localizeThemeError(error, locale, labels.error));
    } finally {
      setBusy(false);
    }
  }

  function handlePreview(target: ThemeTarget, packId: string | null) {
    try {
      previewUnifiedTheme(target, packId, Platform.OS);
    } catch (error) {
      Alert.alert(localizeThemeError(error, locale, labels.error));
    }
  }

  function notifySevereContrastIfNeeded(pack: ThemePackV1) {
    const report = evaluatePackContrast(pack);
    if (!report.hasSevere) return;
    const minRatio = Math.min(...report.issues.map((issue) => issue.ratio)).toFixed(1);
    Alert.alert(labels.contrastAlertTitle, labels.contrastAlertMessage(pack.name, minRatio));
  }

  async function importTheme() {
    setBusy(true);
    try {
      const { pickThemePack } = await import("../../lib/theme-library");
      const pack = await pickThemePack();
      if (!pack) return;
      if (unified.packs.some((item) => item.id === pack.id)) {
        Alert.alert(labels.replaceTitle, labels.replaceMessage(pack.name), [
          { text: labels.cancelDialog, style: "cancel" },
          {
            text: labels.replaceConfirm,
            onPress: () =>
              void runAction(async () => {
                await themeManager.install(pack, true);
                notifySevereContrastIfNeeded(pack);
              }),
          },
        ]);
      } else {
        await themeManager.install(pack);
        notifySevereContrastIfNeeded(pack);
      }
    } catch (error) {
      Alert.alert(localizeThemeError(error, locale, labels.error));
    } finally {
      setBusy(false);
    }
  }

  function confirmUninstall(pack: ThemePackV1) {
    const usage = listPackUsage(unified.savedAssignments, pack.id);
    const usageText =
      usage.length > 0
        ? usage.map((target) => scopeLabel(target, locale)).join(chinese ? "、" : ", ")
        : null;
    Alert.alert(labels.uninstallTitle, labels.uninstallMessage(pack.name, usageText), [
      { text: labels.cancelDialog, style: "cancel" },
      {
        text: labels.uninstall,
        style: "destructive",
        onPress: () => void runAction(() => uninstallUnifiedThemePack(pack.id)),
      },
    ]);
  }

  const previewTarget: ThemeTarget =
    unified.preview?.target ?? (expandedScope ? expandedScope : "all");
  const previewScope: ThemeScope = previewTarget === "all" ? "inbox" : previewTarget;
  const resolvedPreviewTheme = useMemo(
    () =>
      resolveScopedTheme(
        unified.packs,
        unified.effectiveAssignments,
        previewScope,
        userAppearance,
        Platform.OS,
      ),
    [previewScope, unified.effectiveAssignments, unified.packs, userAppearance],
  );
  const previewedPackId =
    previewTarget === "all"
      ? unified.effectiveAssignments.globalPackId
      : (unified.effectiveAssignments.pages[previewTarget] ??
        unified.effectiveAssignments.globalPackId);
  const previewIsFollowingGlobal =
    previewTarget !== "all" && unified.effectiveAssignments.pages[previewTarget] === undefined;
  const previewContrastWarning = useMemo(() => {
    const issues = evaluateThemeContrast(resolvedPreviewTheme.tokens);
    if (issues.length === 0) return null;
    const minRatio = Math.min(...issues.map((issue) => issue.ratio)).toFixed(1);
    const hasSevere = issues.some((issue) => issue.severity === "severe");
    const pairText = issues
      .map((issue) => labels.contrastPair[issue.pair])
      .join(chinese ? "、" : ", ");
    return labels.previewContrastWarning(hasSevere, minRatio, pairText);
  }, [chinese, labels, resolvedPreviewTheme.tokens]);
  const availableStarters = useMemo(
    () =>
      STARTER_THEME_PACKS.filter((preset) => !unified.packs.some((pack) => pack.id === preset.id)),
    [unified.packs],
  );

  const secondaryScopes = useMemo(
    () => THEME_SCOPES.filter((scope) => !PRIMARY_SCOPES.includes(scope)),
    [],
  );
  const promotedSecondaryScopes = useMemo(
    () =>
      secondaryScopes.filter(
        (scope) =>
          Boolean(unified.effectiveAssignments.pages[scope]) ||
          customPacks.some((pack) => pack.coverage !== "all" && pack.coverage.includes(scope)),
      ),
    [customPacks, secondaryScopes, unified.effectiveAssignments.pages],
  );
  const visibleScopes = useMemo(
    () =>
      showMoreScopes
        ? [...PRIMARY_SCOPES, ...secondaryScopes]
        : [...PRIMARY_SCOPES, ...promotedSecondaryScopes],
    [promotedSecondaryScopes, secondaryScopes, showMoreScopes],
  );
  const hasHiddenSecondaryScopes =
    !showMoreScopes && promotedSecondaryScopes.length < secondaryScopes.length;

  function packDetailSummary(pack: ThemePackV1) {
    const parts = [pack.author, `v${pack.version}`];
    if (pack.defaults?.layout) {
      parts.push(pack.defaults.layout === "cards" ? labels.layoutCards : labels.layoutClassic);
    }
    if (pack.defaults?.surface) {
      parts.push(
        pack.defaults.surface === "glass"
          ? labels.surfaceGlass
          : pack.defaults.surface === "outlined"
            ? labels.surfaceOutlined
            : labels.surfaceFlat,
      );
    }
    return parts.join(" · ");
  }

  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: screenBackground }, insets]}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 20 }}
    >
      <View style={{ gap: 12 }}>
        <ThemePreviewCard
          theme={resolvedPreviewTheme}
          packName={themePackDisplayName(unified.packs, previewedPackId, locale)}
          targetLabel={scopeLabel(previewTarget, locale)}
          isPreview={unified.preview !== null}
          isFollowingGlobal={previewIsFollowingGlobal}
          contrastWarning={previewContrastWarning}
          labels={labels.previewCard}
        />

        {unified.preview !== null ? (
          <View style={{ gap: 10 }}>
            <Text accessibilityLiveRegion="polite" style={{ color: tokens.mutedForeground }}>
              {labels.previewBanner(
                scopeLabel(unified.preview.target, locale),
                unified.preview.packId === null
                  ? null
                  : themePackDisplayName(unified.packs, unified.preview.packId, locale),
              )}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <View style={{ flexGrow: 1, flexBasis: 130 }}>
                <NativeActionButton
                  label={labels.apply}
                  busy={busy}
                  onPress={() => void runAction(() => commitUnifiedThemePreview(Platform.OS))}
                />
              </View>
              <View style={{ flexGrow: 1, flexBasis: 130 }}>
                <NativeActionButton
                  label={labels.cancel}
                  prominence="secondary"
                  disabled={busy}
                  onPress={() => cancelUnifiedThemePreview()}
                />
              </View>
            </View>
          </View>
        ) : null}
      </View>

      <SettingsGroup
        label={labels.globalSection}
        accessibilityLabel={labels.title}
        footer={labels.hint}
      >
        {builtInModes.map((mode) => {
          const isPreviewing =
            unified.preview?.target === "all" && unified.preview.packId === mode.id;
          const isSaved = unified.savedAssignments.globalPackId === mode.id;
          return (
            <SettingsRow
              key={mode.id}
              title={
                mode.id === "classic"
                  ? labels.classic
                  : mode.id === "midnight"
                    ? labels.midnight
                    : mode.name
              }
              detail={
                mode.id === "classic"
                  ? labels.classicDetail
                  : mode.id === "midnight"
                    ? labels.midnightDetail
                    : mode.description
              }
              value={isPreviewing ? labels.preview : isSaved ? labels.active : undefined}
              accessibilityRole="radio"
              accessibilityState={{
                checked: unified.effectiveAssignments.globalPackId === mode.id,
              }}
              disabled={busy || !unified.hydrated}
              onPress={() => handlePreview("all", mode.id)}
              leading={
                <View
                  accessibilityElementsHidden
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    marginRight: 12,
                    borderWidth: 2,
                    borderColor: mode.previewBadge?.accentColor ?? tokens.border,
                    backgroundColor: mode.previewBadge?.backgroundColor ?? tokens.background,
                  }}
                />
              }
            />
          );
        })}

        {globalCustomPacks.map((pack) => {
          const swatch = packSwatch(pack, userAppearance);
          const isPreviewing =
            unified.preview?.target === "all" && unified.preview.packId === pack.id;
          const isSaved = unified.savedAssignments.globalPackId === pack.id;
          return (
            <SettingsRow
              key={pack.id}
              title={pack.name}
              detail={packDetailSummary(pack)}
              value={isPreviewing ? labels.preview : isSaved ? labels.active : undefined}
              accessibilityRole="radio"
              accessibilityState={{
                checked: unified.effectiveAssignments.globalPackId === pack.id,
              }}
              disabled={busy || !unified.hydrated}
              onPress={() => handlePreview("all", pack.id)}
              leading={
                <View
                  accessibilityElementsHidden
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    marginRight: 12,
                    borderWidth: 2,
                    borderColor: swatch.accent,
                    backgroundColor: swatch.background,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <View
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 4,
                      backgroundColor: swatch.card,
                      borderWidth: 1,
                      borderColor: swatch.border,
                    }}
                  />
                </View>
              }
            />
          );
        })}
      </SettingsGroup>

      {isIos && unified.packsReady ? (
        <SettingsGroup label={labels.perPageSection} footer={labels.perPageFooter}>
          {visibleScopes.map((scope) => {
            const isExpanded = expandedScope === scope;
            const savedId = unified.savedAssignments.pages[scope];
            const effectiveId = unified.effectiveAssignments.pages[scope];
            const isPreviewingScope = unified.preview?.target === scope;
            const currentValue = isPreviewingScope
              ? `${
                  effectiveId
                    ? themePackDisplayName(unified.packs, effectiveId, locale)
                    : labels.followGlobal
                } · ${labels.preview}`
              : savedId
                ? themePackDisplayName(unified.packs, savedId, locale)
                : labels.followGlobal;
            const eligiblePacks = unified.packs.filter((pack) => themeCovers(pack, scope));

            return (
              <View key={scope}>
                <SettingsRow
                  title={scopeLabel(scope, locale)}
                  value={currentValue}
                  chevron={isExpanded ? "down" : "right"}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isExpanded }}
                  disabled={busy}
                  onPress={() => setExpandedScope(isExpanded ? null : scope)}
                />
                {isExpanded ? (
                  <View
                    style={{
                      paddingHorizontal: 16,
                      paddingBottom: 14,
                      paddingTop: 4,
                      gap: 10,
                      backgroundColor: tokens.muted,
                    }}
                  >
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      <MotionPressable
                        preset="control"
                        accessibilityRole="button"
                        accessibilityState={{ selected: effectiveId === undefined }}
                        disabled={busy}
                        onPress={() => handlePreview(scope, null)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 999,
                          backgroundColor: effectiveId === undefined ? tokens.primary : tokens.card,
                          borderWidth: 1,
                          borderColor: effectiveId === undefined ? tokens.primary : tokens.border,
                        }}
                      >
                        <Text
                          style={{
                            color:
                              effectiveId === undefined
                                ? tokens.primaryForeground
                                : tokens.foreground,
                            fontSize: 13,
                            fontWeight: "600",
                          }}
                        >
                          {labels.followGlobal}
                        </Text>
                      </MotionPressable>

                      {eligiblePacks.map((pack) => {
                        const selected = effectiveId === pack.id;
                        const swatch = packSwatch(pack, userAppearance);
                        return (
                          <MotionPressable
                            key={`${scope}-${pack.id}`}
                            preset="control"
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            disabled={busy}
                            onPress={() => handlePreview(scope, pack.id)}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                              borderRadius: 999,
                              backgroundColor: selected ? tokens.primary : tokens.card,
                              borderWidth: 1,
                              borderColor: selected ? tokens.primary : tokens.border,
                            }}
                          >
                            <View
                              accessibilityElementsHidden
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: 5,
                                backgroundColor: swatch.background,
                                borderWidth: 1.5,
                                borderColor: swatch.accent,
                              }}
                            />
                            <Text
                              style={{
                                color: selected ? tokens.primaryForeground : tokens.foreground,
                                fontSize: 13,
                                fontWeight: "600",
                              }}
                            >
                              {themePackDisplayName(unified.packs, pack.id, locale)}
                            </Text>
                          </MotionPressable>
                        );
                      })}
                    </View>

                    {savedId ? (
                      <NativeActionButton
                        label={labels.clearOverride}
                        prominence="secondary"
                        size="compact"
                        disabled={busy}
                        onPress={() =>
                          void runAction(() => assignUnifiedTheme(scope, null, Platform.OS))
                        }
                      />
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}

          {hasHiddenSecondaryScopes || showMoreScopes ? (
            <SettingsRow
              title={showMoreScopes ? labels.fewerPages : labels.morePages}
              tinted
              chevron={showMoreScopes ? "down" : "right"}
              accessibilityRole="button"
              onPress={() => setShowMoreScopes((current) => !current)}
            />
          ) : null}
        </SettingsGroup>
      ) : null}

      {isIos && unified.packsReady ? (
        <SettingsGroup
          label={labels.packsSection}
          footer={localizeThemeWarning(unified.warning, locale) ?? labels.packsFooter}
        >
          <SettingsRow
            title={labels.importPack}
            tinted
            chevron="right"
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void importTheme()}
          />

          {availableStarters.map((preset) => {
            const swatch = packSwatch(preset, userAppearance);
            return (
              <SettingsRow
                key={`starter-${preset.id}`}
                title={labels.loadStarter(preset.name)}
                detail={starterThemeDescription(preset.id, locale) ?? undefined}
                tinted
                chevron="right"
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void runAction(() => themeManager.install(preset))}
                leading={
                  <View
                    accessibilityElementsHidden
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 9,
                      borderWidth: 2,
                      borderColor: swatch.accent,
                      backgroundColor: swatch.background,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <View
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        backgroundColor: swatch.card,
                        borderWidth: 1,
                        borderColor: swatch.border,
                      }}
                    />
                  </View>
                }
              />
            );
          })}

          {customPacks.length === 0 ? (
            <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
              <Text style={{ color: tokens.mutedForeground, fontSize: 13 }}>
                {labels.noPacksHint}
              </Text>
            </View>
          ) : (
            customPacks.map((pack) => {
              const resolvedPack = resolvePackSample(pack, userAppearance);
              const swatch = {
                background: resolvedPack.tokens.background,
                card: resolvedPack.tokens.card,
                accent: resolvedPack.tokens.primary,
                border: resolvedPack.tokens.border,
              };
              const usage = listPackUsage(unified.savedAssignments, pack.id);
              const coverageText =
                pack.coverage === "all"
                  ? scopeLabel("all", locale)
                  : pack.coverage
                      .map((scope) => scopeLabel(scope, locale))
                      .join(chinese ? "、" : ", ");
              const usageSummary =
                usage.length > 0
                  ? `${labels.usedIn}${usage.map((target) => scopeLabel(target, locale)).join(chinese ? "、" : ", ")}`
                  : labels.unused;
              const previewTargetForPack: ThemeTarget =
                pack.coverage === "all" ? "all" : (pack.coverage[0] ?? "inbox");
              const isDetailsExpanded = expandedPackId === pack.id;
              const customPageKeys = Object.keys(pack.pages ?? {}).filter(isThemeScope);
              const customPagesText =
                customPageKeys.length > 0
                  ? customPageKeys
                      .map((scope) => scopeLabel(scope, locale))
                      .join(chinese ? "、" : ", ")
                  : labels.none;
              const packLayout = pack.defaults?.layout ?? resolvedPack.layout;
              const packSurface = pack.defaults?.surface ?? resolvedPack.surface;
              const packLayoutText =
                packLayout === "cards" ? labels.layoutCards : labels.layoutClassic;
              const packSurfaceText =
                packSurface === "glass"
                  ? labels.surfaceGlass
                  : packSurface === "outlined"
                    ? labels.surfaceOutlined
                    : labels.surfaceFlat;
              const cardRadius =
                pack.defaults?.geometry?.cardRadius ?? resolvedPack.geometry.cardRadius;
              const controlRadius =
                pack.defaults?.geometry?.controlRadius ?? resolvedPack.geometry.controlRadius;
              const borderWidth =
                pack.defaults?.geometry?.borderWidth ?? resolvedPack.geometry.borderWidth;
              const backgroundAssetCount = Object.keys(pack.assets ?? {}).length;
              const contrastReport = isDetailsExpanded ? evaluatePackContrast(pack) : null;
              const contrastStatusText = contrastReport
                ? contrastReport.issues.length === 0
                  ? labels.contrastOk
                  : labels.contrastWarnings(contrastReport.issues.length, contrastReport.hasSevere)
                : "";

              return (
                <View key={pack.id} style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View
                      accessibilityElementsHidden
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        borderWidth: 2,
                        borderColor: swatch.accent,
                        backgroundColor: swatch.background,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <View
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 4,
                          backgroundColor: swatch.card,
                          borderWidth: 1,
                          borderColor: swatch.border,
                        }}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={{ color: tokens.foreground, fontSize: 15, fontWeight: "600" }}>
                        {`${pack.name} · v${pack.version}`}
                      </Text>
                      <Text style={{ color: tokens.mutedForeground, fontSize: 13 }}>
                        {`${pack.author} · ${coverageText}`}
                      </Text>
                      <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
                        {usageSummary}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                    <View style={{ flexGrow: 1, flexBasis: 110 }}>
                      <NativeActionButton
                        label={
                          previewTargetForPack === "all"
                            ? labels.previewPack
                            : `${labels.previewPack} · ${scopeLabel(previewTargetForPack, locale)}`
                        }
                        prominence="secondary"
                        size="compact"
                        disabled={busy}
                        onPress={() => {
                          if (previewTargetForPack !== "all")
                            setExpandedScope(previewTargetForPack);
                          handlePreview(previewTargetForPack, pack.id);
                        }}
                      />
                    </View>
                    <View style={{ flexGrow: 1, flexBasis: 96 }}>
                      <NativeActionButton
                        label={isDetailsExpanded ? labels.hideDetails : labels.showDetails}
                        prominence="secondary"
                        size="compact"
                        disabled={busy}
                        onPress={() => setExpandedPackId(isDetailsExpanded ? null : pack.id)}
                      />
                    </View>
                    <View style={{ flexGrow: 1, flexBasis: 96 }}>
                      <NativeActionButton
                        label={labels.uninstall}
                        prominence="destructive"
                        size="compact"
                        disabled={busy}
                        onPress={() => confirmUninstall(pack)}
                      />
                    </View>
                  </View>

                  {isDetailsExpanded ? (
                    <View
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        backgroundColor: tokens.muted,
                        borderWidth: 1,
                        borderColor: tokens.border,
                        gap: 4,
                      }}
                    >
                      <Text style={{ color: tokens.foreground, fontSize: 12, fontWeight: "600" }}>
                        {labels.detailIdVersion(pack.id, pack.version)}
                      </Text>
                      <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
                        {labels.detailCoverage(coverageText)}
                      </Text>
                      <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
                        {labels.detailCustomPages(customPagesText)}
                      </Text>
                      <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
                        {labels.detailStyle(
                          packLayoutText,
                          packSurfaceText,
                          cardRadius,
                          controlRadius,
                          borderWidth,
                        )}
                      </Text>
                      <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
                        {labels.detailColors(
                          resolvedPack.tokens.background,
                          resolvedPack.tokens.card,
                          resolvedPack.tokens.primary,
                          resolvedPack.tokens.foreground,
                        )}
                      </Text>
                      <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
                        {labels.detailBackgrounds(backgroundAssetCount)}
                      </Text>
                      <Text
                        style={{
                          color:
                            contrastReport && contrastReport.issues.length > 0
                              ? tokens.foreground
                              : tokens.mutedForeground,
                          fontSize: 12,
                          fontWeight:
                            contrastReport && contrastReport.issues.length > 0 ? "600" : "400",
                        }}
                      >
                        {labels.detailContrast(contrastStatusText)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </SettingsGroup>
      ) : null}

      {unified.canRestoreDefault ? (
        <NativeActionButton
          label={labels.reset}
          prominence="secondary"
          disabled={busy || !unified.hydrated}
          onPress={() => void runAction(() => resetUnifiedThemeToDefault(Platform.OS))}
        />
      ) : null}
    </ScrollView>
  );
}
