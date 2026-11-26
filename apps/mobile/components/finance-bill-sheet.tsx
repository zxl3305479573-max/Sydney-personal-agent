import type {
  FinanceBill,
  FinanceBillCategory,
  FinanceBillDirection,
  FinanceBillStatus,
  ParsedFinanceBillDraft,
  ParseFinanceBillImageMimeType,
  PaymentMethodSummary,
  UpsertFinanceBillInput,
} from "@rakazo/contracts";
import {
  FINANCE_BILL_DIRECTIONS,
  FINANCE_BILL_STATUSES,
  FINANCE_EXPENSE_CATEGORIES,
  FINANCE_INCOME_CATEGORIES,
  FINANCE_TRANSFER_CATEGORIES,
  formatCents,
  inferFinanceBillCategory,
  ParseFinanceBillImageMimeTypeSchema,
  parseAmountToCents,
} from "@rakazo/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as dictation from "../lib/dictation";
import { useI18n } from "../lib/i18n";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";
import { parseFinanceBillDraft } from "../lib/personal-finance";
import {
  billCategoryLabel,
  billCategorySymbol,
  billDirectionLabel,
  billStatusLabel,
} from "../lib/personal-finance-ui";
import { AppModalSheet } from "./app-modal-sheet";
import { MotionPressable } from "./motion-pressable";
import { NativeSymbol } from "./native-symbol";

const QUICK_CURRENCIES = ["CNY", "USD", "HKD", "EUR", "JPY"] as const;

function dateInputFromIso(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso.slice(0, 10);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function isoFromDateInput(dateText: string, fallbackIso?: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText.trim());
  if (!match) return fallbackIso ?? new Date().toISOString();
  const now = new Date();
  const year = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10) - 1;
  const day = Number.parseInt(match[3]!, 10);
  const local = new Date(year, month, day, now.getHours(), now.getMinutes(), now.getSeconds());
  return Number.isNaN(local.getTime()) ? new Date().toISOString() : local.toISOString();
}

function categoriesForDirection(direction: FinanceBillDirection): readonly FinanceBillCategory[] {
  if (direction === "income") return FINANCE_INCOME_CATEGORIES;
  if (direction === "transfer") return FINANCE_TRANSFER_CATEGORIES;
  return FINANCE_EXPENSE_CATEGORIES;
}

function normalizeImageMime(raw?: string | null): ParseFinanceBillImageMimeType {
  const parsed = ParseFinanceBillImageMimeTypeSchema.safeParse(raw?.toLowerCase());
  return parsed.success ? parsed.data : "image/jpeg";
}

export type AutoSavedBillBanner = {
  title: string;
  amountCents: number;
  currency: string;
  category: FinanceBillCategory;
  direction: FinanceBillDirection;
  sourceLabel: "photo" | "voice";
};

export type FinanceBillSheetProps = {
  visible: boolean;
  editing: FinanceBill | null;
  initialPaymentMethodId?: string | null;
  /** Optional quick capture trigger when opened from a Home Hub shortcut ("camera" | "voice"). */
  initialCaptureMode?: "camera" | "voice" | null;
  methods: readonly PaymentMethodSummary[];
  onClose: () => void;
  onSave: (input: UpsertFinanceBillInput) => Promise<void>;
  onAutoSaved?: (saved: AutoSavedBillBanner) => void;
  onDelete?: (billId: string) => Promise<void>;
};

export function FinanceBillSheet({
  visible,
  editing,
  initialPaymentMethodId = null,
  initialCaptureMode = null,
  methods,
  onClose,
  onSave,
  onAutoSaved,
  onDelete,
}: FinanceBillSheetProps) {
  const insets = useSafeAreaInsets();
  const tokens = useMobileTokens();
  const appearance = useResolvedAppearance();
  const { locale } = useI18n();
  const zh = locale.startsWith("zh");
  const tw = locale === "zh-TW";
  const copy = useCallback(
    (cn: string, hant: string, en: string) => (zh ? (tw ? hant : cn) : en),
    [zh, tw],
  );

  const defaultMethod = methods.find((m) => m.isDefault) ?? methods[0] ?? null;
  const [direction, setDirection] = useState<FinanceBillDirection>("expense");
  const [amountText, setAmountText] = useState("");
  const [currency, setCurrency] = useState("CNY");
  const [category, setCategory] = useState<FinanceBillCategory>("food");
  const [categoryAutoTagged, setCategoryAutoTagged] = useState(false);
  const [categoryManual, setCategoryManual] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [dateText, setDateText] = useState(() => dateInputFromIso(new Date().toISOString()));
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(defaultMethod?.id ?? null);
  const [status, setStatus] = useState<FinanceBillStatus>("paid");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Smart receipt photo & voice capture state
  const [autoSaveRecognized, setAutoSaveRecognized] = useState(true);
  const [analyzingMode, setAnalyzingMode] = useState<"photo" | "voice" | null>(null);
  const [receiptPreviewUri, setReceiptPreviewUri] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceInterim, setVoiceInterim] = useState("");
  const [smartNotice, setSmartNotice] = useState<string | null>(null);

  const voiceAbortRef = useRef<AbortController | null>(null);
  const voiceInterimRef = useRef("");
  const autoSaveRef = useRef(autoSaveRecognized);
  autoSaveRef.current = autoSaveRecognized;
  const initialModeConsumedRef = useRef(false);

  const stopVoiceCapture = useCallback(() => {
    voiceAbortRef.current?.abort();
    voiceAbortRef.current = null;
    dictation.stop();
    setListening(false);
  }, []);

  useEffect(() => {
    if (!visible) {
      stopVoiceCapture();
      initialModeConsumedRef.current = false;
      return;
    }
    setError(null);
    setSaving(false);
    setAnalyzingMode(null);
    setReceiptPreviewUri(null);
    setVoiceInterim("");
    voiceInterimRef.current = "";
    setSmartNotice(null);
    if (editing) {
      setDirection(editing.direction);
      setAmountText((editing.amountCents / 100).toFixed(2).replace(/\.00$/, ""));
      setCurrency(editing.currency || "CNY");
      setCategory(editing.category);
      setCategoryManual(true);
      setCategoryAutoTagged(false);
      setTitle(editing.title);
      setNote(editing.note ?? "");
      setDateText(dateInputFromIso(editing.occurredAt));
      setPaymentMethodId(editing.paymentMethodId);
      setStatus(editing.status);
    } else {
      const preselected =
        (initialPaymentMethodId ? methods.find((m) => m.id === initialPaymentMethodId) : null) ??
        defaultMethod;
      setDirection("expense");
      setAmountText("");
      setCurrency(preselected?.currency ?? "CNY");
      setCategory("food");
      setCategoryManual(false);
      setCategoryAutoTagged(false);
      setTitle("");
      setNote("");
      setDateText(dateInputFromIso(new Date().toISOString()));
      setPaymentMethodId(preselected?.id ?? null);
      setStatus("paid");
    }
    return () => {
      stopVoiceCapture();
    };
  }, [
    visible,
    editing,
    initialPaymentMethodId,
    methods,
    defaultMethod?.id,
    defaultMethod?.currency,
    stopVoiceCapture,
  ]);

  const isLight = appearance === "light";
  const cardBg = isLight ? "#FFFEFC" : "#242933";
  const chipBg = isLight ? "#F8F6F2" : "#2A303B";
  const borderColor = isLight ? "rgba(38, 35, 31, 0.08)" : "rgba(245, 244, 240, 0.12)";
  const activeBg = isLight ? "#2E2B27" : "#E7E4DD";
  const activeInk = isLight ? "#FAF8F4" : "#15171C";
  const dangerInk = isLight ? "#B42318" : "#F97066";
  const smartBg = isLight ? "rgba(44, 110, 173, 0.08)" : "rgba(116, 176, 238, 0.14)";
  const smartInk = isLight ? "#1E4F82" : "#9ACBF9";
  const listeningBg = isLight ? "rgba(180, 35, 24, 0.12)" : "rgba(249, 112, 102, 0.20)";

  const categories = categoriesForDirection(direction);

  const handleDirectionChange = (next: FinanceBillDirection) => {
    setDirection(next);
    const allowed = categoriesForDirection(next);
    if (!allowed.includes(category)) {
      const inferred = inferFinanceBillCategory(title, note, next);
      setCategory(allowed.includes(inferred) ? inferred : allowed[0]!);
    }
  };

  const handleTitleChange = (nextTitle: string) => {
    setTitle(nextTitle);
    if (!categoryManual && nextTitle.trim().length >= 2) {
      const inferred = inferFinanceBillCategory(nextTitle, note, direction);
      if (inferred !== "other_expense" && inferred !== "other_income") {
        const allowed = categoriesForDirection(direction);
        if (allowed.includes(inferred)) {
          setCategory(inferred);
          setCategoryAutoTagged(true);
        }
      }
    }
  };

  const setRelativeDate = (daysOffset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    setDateText(dateInputFromIso(d.toISOString()));
  };

  const applyDraftAndMaybeSave = useCallback(
    async (draft: ParsedFinanceBillDraft, sourceLabel: "photo" | "voice") => {
      const allowed = categoriesForDirection(draft.direction);
      const safeCategory = allowed.includes(draft.category) ? draft.category : allowed[0]!;
      const resolvedTitle = draft.title.trim() || billCategoryLabel(safeCategory, locale);
      const resolvedMethodId =
        draft.paymentMethodId ??
        (initialPaymentMethodId ? initialPaymentMethodId : (defaultMethod?.id ?? null));
      const matchedMethod = resolvedMethodId
        ? methods.find((m) => m.id === resolvedMethodId)
        : null;
      const resolvedDate = dateInputFromIso(draft.occurredAt);

      setDirection(draft.direction);
      setAmountText(
        draft.amountCents ? (draft.amountCents / 100).toFixed(2).replace(/\.00$/, "") : "",
      );
      setCurrency(draft.currency || "CNY");
      setCategory(safeCategory);
      setCategoryAutoTagged(true);
      setCategoryManual(false);
      setTitle(resolvedTitle);
      setNote(draft.note ?? "");
      setDateText(resolvedDate);
      setPaymentMethodId(resolvedMethodId);
      setStatus(draft.status);

      const categoryName = billCategoryLabel(safeCategory, locale);
      if (draft.amountCents && draft.amountCents > 0 && autoSaveRef.current && !editing) {
        setSaving(true);
        try {
          await onSave({
            direction: draft.direction,
            amountCents: draft.amountCents,
            currency: draft.currency || "CNY",
            category: safeCategory,
            title: resolvedTitle,
            note: draft.note?.trim() || null,
            occurredAt: draft.occurredAt,
            paymentMethodId: resolvedMethodId,
            paymentMethodLabel: matchedMethod?.label ?? draft.paymentMethodLabel ?? null,
            status: draft.status,
          });
          onAutoSaved?.({
            title: resolvedTitle,
            amountCents: draft.amountCents,
            currency: draft.currency || "CNY",
            category: safeCategory,
            direction: draft.direction,
            sourceLabel,
          });
          onClose();
          return;
        } finally {
          setSaving(false);
        }
      }

      if (draft.amountCents && draft.amountCents > 0) {
        setSmartNotice(
          copy(
            `已自动识别 ${formatCents(draft.amountCents, draft.currency)} · 分类：${categoryName}，核对后点右上角保存`,
            `已自動辨識 ${formatCents(draft.amountCents, draft.currency)} · 分類：${categoryName}，核對後點右上角儲存`,
            `Recognized ${formatCents(draft.amountCents, draft.currency)} · Category: ${categoryName}`,
          ),
        );
      } else {
        setSmartNotice(
          copy(
            `已识别事项并归类为「${categoryName}」，请补充或确认金额后保存`,
            `已辨識事項並歸類為「${categoryName}」，請補充或確認金額後儲存`,
            `Classified as ${categoryName}. Please enter or confirm the amount.`,
          ),
        );
      }
    },
    [
      copy,
      defaultMethod?.id,
      editing,
      initialPaymentMethodId,
      locale,
      methods,
      onAutoSaved,
      onClose,
      onSave,
    ],
  );

  const handleImageCapture = useCallback(
    async (source: "camera" | "album") => {
      if (analyzingMode || saving) return;
      stopVoiceCapture();
      setError(null);
      setSmartNotice(null);
      try {
        const picker = await import("../lib/pick-attachments");
        const picked =
          source === "camera" ? await picker.takePhoto(0) : await picker.pickFromLibrary(0);
        const denied = picked.skipped.find((s) => s.reason === "permission denied");
        if (denied) {
          setError(
            copy(
              "未授予相机权限，请在系统设置中开启相机后重试。",
              "未授予相機權限，請在系統設定中開啟相機後重試。",
              "Camera permission is required to scan receipts.",
            ),
          );
          return;
        }
        const image = picked.attachments.find((item) => item.mimeType.startsWith("image/"));
        if (!image?.contentBase64) return;

        if (image.previewUri) setReceiptPreviewUri(image.previewUri);
        setAnalyzingMode("photo");
        const draft = await parseFinanceBillDraft({
          imageBase64: image.contentBase64,
          imageMimeType: normalizeImageMime(image.mimeType),
        });
        await applyDraftAndMaybeSave(draft, "photo");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : copy(
                "图片识别失败，请检查网络连接或稍后重试",
                "圖片辨識失敗，請檢查網路連線或稍後重試",
                "Could not recognize receipt photo",
              ),
        );
      } finally {
        setAnalyzingMode(null);
      }
    },
    [analyzingMode, applyDraftAndMaybeSave, copy, saving, stopVoiceCapture],
  );

  const processVoiceTranscript = useCallback(
    async (transcript: string) => {
      const clean = transcript.trim();
      if (!clean) return;
      setAnalyzingMode("voice");
      setError(null);
      try {
        const draft = await parseFinanceBillDraft({ text: clean });
        await applyDraftAndMaybeSave(draft, "voice");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : copy(
                "语音记账解析失败，请重试",
                "語音記帳解析失敗，請重試",
                "Could not parse voice bill",
              ),
        );
      } finally {
        setAnalyzingMode(null);
      }
    },
    [applyDraftAndMaybeSave, copy],
  );

  const handleVoiceToggle = useCallback(async () => {
    if (analyzingMode || saving) return;
    if (listening) {
      const captured = voiceInterimRef.current.trim();
      stopVoiceCapture();
      if (captured) {
        await processVoiceTranscript(captured);
      }
      return;
    }

    setError(null);
    setSmartNotice(null);
    const canListen = await dictation.available();
    if (!canListen) {
      setError(
        copy(
          "当前设备未开启语音识别或麦克风权限，请在系统设置中授权后重试。",
          "目前裝置未開啟語音辨識或麥克風權限，請在系統設定中授權後重試。",
          "Speech recognition or microphone permission is unavailable.",
        ),
      );
      return;
    }

    const controller = new AbortController();
    voiceAbortRef.current = controller;
    voiceInterimRef.current = "";
    setVoiceInterim("");
    setListening(true);

    void dictation.listen({
      lang: zh ? (tw ? "zh-TW" : "zh-CN") : locale || "en-US",
      signal: controller.signal,
      onInterim: (text) => {
        voiceInterimRef.current = text;
        setVoiceInterim(text);
      },
      onFinal: (finalText) => {
        setListening(false);
        voiceAbortRef.current = null;
        const spoken = finalText.trim() || voiceInterimRef.current.trim();
        if (spoken) {
          setVoiceInterim(spoken);
          void processVoiceTranscript(spoken);
        }
      },
      onGiveUp: (reason) => {
        setListening(false);
        voiceAbortRef.current = null;
        if (reason === "failed") {
          setError(
            copy(
              "未识别到语音，请靠近麦克风再试一次。",
              "未辨識到語音，請靠近麥克風再試一次。",
              "Could not hear speech. Please try again.",
            ),
          );
        }
      },
    });
  }, [
    analyzingMode,
    copy,
    listening,
    locale,
    processVoiceTranscript,
    saving,
    stopVoiceCapture,
    tw,
    zh,
  ]);

  // Trigger quick capture automatically when launched via Home Hub's 拍照识图 / 语音记 shortcuts
  useEffect(() => {
    if (!visible || editing || !initialCaptureMode || initialModeConsumedRef.current) return;
    initialModeConsumedRef.current = true;
    if (initialCaptureMode === "camera") {
      void handleImageCapture("camera");
    } else if (initialCaptureMode === "voice") {
      void handleVoiceToggle();
    }
  }, [visible, editing, initialCaptureMode, handleImageCapture, handleVoiceToggle]);

  const handleSubmit = async () => {
    if (saving || analyzingMode) return;
    stopVoiceCapture();
    const amountCents = parseAmountToCents(amountText);
    if (!amountCents) {
      setError(
        copy(
          "请输入有效的正数金额（最多两位小数）",
          "請輸入有效的正數金額（最多兩位小數）",
          "Enter a valid positive amount",
        ),
      );
      return;
    }
    const cleanTitle = title.trim() || billCategoryLabel(category, locale);
    const matchedMethod = paymentMethodId ? methods.find((m) => m.id === paymentMethodId) : null;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        ...(editing ? { id: editing.id } : {}),
        direction,
        amountCents,
        currency,
        category,
        title: cleanTitle,
        note: note.trim() || null,
        occurredAt: isoFromDateInput(dateText, editing?.occurredAt),
        paymentMethodId: paymentMethodId ?? null,
        paymentMethodLabel: matchedMethod?.label ?? editing?.paymentMethodLabel ?? null,
        status,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : copy("保存账单失败，请重试", "儲存帳單失敗，請重試", "Could not save bill"),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!editing || !onDelete || saving) return;
    Alert.alert(copy("删除这笔账单？", "刪除此筆帳單？", "Delete this bill?"), editing.title, [
      { text: copy("取消", "取消", "Cancel"), style: "cancel" },
      {
        text: copy("删除", "刪除", "Delete"),
        style: "destructive",
        onPress: () => {
          setSaving(true);
          void onDelete(editing.id)
            .then(() => onClose())
            .catch((err) =>
              setError(
                err instanceof Error ? err.message : copy("删除失败", "刪除失敗", "Delete failed"),
              ),
            )
            .finally(() => setSaving(false));
        },
      },
    ]);
  };

  const busy = saving || analyzingMode !== null;

  return (
    <AppModalSheet
      visible={visible}
      onClose={() => {
        stopVoiceCapture();
        onClose();
      }}
      preventDismiss={saving}
      bottomInset={insets.bottom}
      accessibilityLabel={
        editing ? copy("编辑账单", "編輯帳單", "Edit bill") : copy("记一笔", "記一筆", "Add bill")
      }
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 20,
          paddingBottom: 12,
        }}
      >
        <MotionPressable
          preset="inline"
          disabled={saving}
          onPress={() => {
            stopVoiceCapture();
            onClose();
          }}
        >
          <Text style={{ color: tokens.mutedForeground, fontSize: 15 }}>
            {copy("取消", "取消", "Cancel")}
          </Text>
        </MotionPressable>
        <Text style={{ color: tokens.foreground, fontSize: 16, fontWeight: "700" }}>
          {editing
            ? copy("编辑账单", "編輯帳單", "Edit bill")
            : copy("记一笔", "記一筆", "New bill")}
        </Text>
        <MotionPressable
          preset="inline"
          testID="finance-bill-save"
          disabled={busy}
          onPress={() => void handleSubmit()}
        >
          <Text
            style={{
              color: tokens.foreground,
              fontSize: 15,
              fontWeight: "700",
              opacity: busy ? 0.5 : 1,
            }}
          >
            {saving ? copy("保存中…", "儲存中…", "Saving…") : copy("保存", "儲存", "Save")}
          </Text>
        </MotionPressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, gap: 16 }}
      >
        {/* Smart Capture Bar: Camera OCR + Album Upload + Live Voice Input + Auto-Save Toggle */}
        {!editing ? (
          <View
            testID="finance-bill-smart-capture"
            style={{
              backgroundColor: cardBg,
              borderRadius: 18,
              padding: 14,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor,
              gap: 10,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <NativeSymbol
                  ios="sparkles"
                  android="sparkles-outline"
                  size={14}
                  color={smartInk}
                />
                <Text style={{ color: tokens.foreground, fontSize: 13.5, fontWeight: "700" }}>
                  {copy("智能识图 / 语音快记", "智慧識圖 / 語音快記", "Smart Scan & Voice")}
                </Text>
              </View>
              <MotionPressable
                preset="control"
                testID="finance-bill-autosave-toggle"
                accessibilityRole="switch"
                accessibilityState={{ checked: autoSaveRecognized }}
                accessibilityLabel={copy(
                  "识别后自动分类并保存",
                  "辨識後自動分類並儲存",
                  "Auto-classify and save after scan or voice",
                )}
                onPress={() => setAutoSaveRecognized((prev) => !prev)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: autoSaveRecognized ? smartBg : chipBg,
                }}
              >
                <Text
                  style={{
                    color: autoSaveRecognized ? smartInk : tokens.mutedForeground,
                    fontSize: 11.5,
                    fontWeight: "600",
                  }}
                >
                  {autoSaveRecognized
                    ? copy("识别后自动保存：开", "辨識後自動儲存：開", "Auto-save: ON")
                    : copy("识别后自动保存：关", "辨識後自動儲存：關", "Auto-save: OFF")}
                </Text>
              </MotionPressable>
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <MotionPressable
                preset="control"
                testID="finance-bill-camera"
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={copy(
                  "拍照识图记账",
                  "拍照識圖記帳",
                  "Scan receipt with camera",
                )}
                onPress={() => void handleImageCapture("camera")}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  paddingVertical: 10,
                  borderRadius: 14,
                  backgroundColor: chipBg,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor,
                  opacity: busy ? 0.55 : 1,
                }}
              >
                <NativeSymbol
                  ios="camera.fill"
                  android="camera-outline"
                  size={14}
                  color={tokens.foreground}
                />
                <Text style={{ color: tokens.foreground, fontSize: 12.5, fontWeight: "600" }}>
                  {copy("拍照识图", "拍照識圖", "Camera")}
                </Text>
              </MotionPressable>

              <MotionPressable
                preset="control"
                testID="finance-bill-album"
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={copy(
                  "相册上传账单截图",
                  "相簿上傳帳單截圖",
                  "Upload receipt photo",
                )}
                onPress={() => void handleImageCapture("album")}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  paddingVertical: 10,
                  borderRadius: 14,
                  backgroundColor: chipBg,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor,
                  opacity: busy ? 0.55 : 1,
                }}
              >
                <NativeSymbol
                  ios="photo.on.rectangle"
                  android="images-outline"
                  size={14}
                  color={tokens.foreground}
                />
                <Text style={{ color: tokens.foreground, fontSize: 12.5, fontWeight: "600" }}>
                  {copy("相册传图", "相簿傳圖", "Photo")}
                </Text>
              </MotionPressable>

              <MotionPressable
                preset="control"
                testID="finance-bill-voice"
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={
                  listening
                    ? copy("结束语音输入并识别", "結束語音輸入並辨識", "Stop voice input")
                    : copy("语音输入记账", "語音輸入記帳", "Voice input")
                }
                onPress={() => void handleVoiceToggle()}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  paddingVertical: 10,
                  borderRadius: 14,
                  backgroundColor: listening ? listeningBg : chipBg,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: listening ? dangerInk : borderColor,
                  opacity: busy ? 0.55 : 1,
                }}
              >
                <NativeSymbol
                  ios={listening ? "stop.circle.fill" : "mic.fill"}
                  android={listening ? "stop-circle-outline" : "mic-outline"}
                  size={14}
                  color={listening ? dangerInk : tokens.foreground}
                />
                <Text
                  style={{
                    color: listening ? dangerInk : tokens.foreground,
                    fontSize: 12.5,
                    fontWeight: "600",
                  }}
                >
                  {listening
                    ? copy("说完了", "說完了", "Done")
                    : copy("语音输入", "語音輸入", "Voice")}
                </Text>
              </MotionPressable>
            </View>

            {listening ? (
              <View
                testID="finance-bill-voice-live"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderRadius: 12,
                  backgroundColor: listeningBg,
                }}
              >
                <NativeSymbol ios="waveform" android="mic-outline" size={14} color={dangerInk} />
                <Text style={{ color: dangerInk, fontSize: 12.5, flex: 1 }}>
                  {voiceInterim ||
                    copy(
                      "正在听… 例如说「午饭吃海底捞花了 268，用微信支付」",
                      "正在聽… 例如說「午飯吃海底撈花了 268，用微信支付」",
                      'Listening… e.g. "Lunch at Starbucks 38 yuan via WeChat"',
                    )}
                </Text>
              </View>
            ) : null}

            {analyzingMode ? (
              <View
                testID="finance-bill-analyzing"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderRadius: 12,
                  backgroundColor: smartBg,
                }}
              >
                {receiptPreviewUri ? (
                  <Image
                    source={{ uri: receiptPreviewUri }}
                    style={{ width: 34, height: 34, borderRadius: 8 }}
                  />
                ) : null}
                <ActivityIndicator size="small" color={smartInk} />
                <Text style={{ color: smartInk, fontSize: 12.5, fontWeight: "600", flex: 1 }}>
                  {analyzingMode === "photo"
                    ? copy(
                        "正在 AI 识图提取金额与自动分类…",
                        "正在 AI 識圖擷取金額與自動分類…",
                        "Scanning receipt and auto-classifying…",
                      )
                    : copy(
                        "正在智能解析语音内容并自动分类…",
                        "正在智慧解析語音內容並自動分類…",
                        "Parsing spoken bill and auto-classifying…",
                      )}
                </Text>
              </View>
            ) : smartNotice ? (
              <View
                testID="finance-bill-smart-notice"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderRadius: 12,
                  backgroundColor: smartBg,
                }}
              >
                {receiptPreviewUri ? (
                  <Image
                    source={{ uri: receiptPreviewUri }}
                    style={{ width: 32, height: 32, borderRadius: 7 }}
                  />
                ) : null}
                <Text style={{ color: smartInk, fontSize: 12.5, flex: 1 }}>{smartNotice}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Direction Tabs */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {FINANCE_BILL_DIRECTIONS.map((dir) => {
            const active = direction === dir;
            return (
              <MotionPressable
                key={dir}
                preset="control"
                testID={`bill-direction-${dir}`}
                onPress={() => handleDirectionChange(dir)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 9,
                  borderRadius: 14,
                  backgroundColor: active ? activeBg : chipBg,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: active ? "transparent" : borderColor,
                }}
              >
                <Text
                  style={{
                    color: active ? activeInk : tokens.foreground,
                    fontSize: 13.5,
                    fontWeight: "600",
                  }}
                >
                  {billDirectionLabel(dir, locale)}
                </Text>
              </MotionPressable>
            );
          })}
        </View>

        {/* Amount + Currency */}
        <View
          style={{
            backgroundColor: cardBg,
            borderRadius: 18,
            padding: 16,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor,
            gap: 10,
          }}
        >
          <Text style={{ color: tokens.mutedForeground, fontSize: 12.5 }}>
            {copy("金额", "金額", "Amount")}
          </Text>
          <TextInput
            testID="finance-bill-amount-input"
            accessibilityLabel={copy("金额", "金額", "Amount")}
            value={amountText}
            onChangeText={setAmountText}
            placeholder="0.00"
            placeholderTextColor={tokens.mutedForeground}
            keyboardType="decimal-pad"
            style={{
              color: tokens.foreground,
              fontSize: 32,
              fontWeight: "700",
              fontVariant: ["tabular-nums"],
              paddingVertical: 2,
            }}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {QUICK_CURRENCIES.map((code) => {
              const selected = currency === code;
              return (
                <MotionPressable
                  key={code}
                  preset="control"
                  onPress={() => setCurrency(code)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: selected ? activeBg : chipBg,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: selected ? "transparent" : borderColor,
                  }}
                >
                  <Text
                    style={{
                      color: selected ? activeInk : tokens.mutedForeground,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    {code}
                  </Text>
                </MotionPressable>
              );
            })}
          </View>
        </View>

        {/* Title / Merchant */}
        <View style={{ gap: 6 }}>
          <Text style={{ color: tokens.mutedForeground, fontSize: 12.5, paddingLeft: 4 }}>
            {copy("事项 / 商户名称", "事項 / 商戶名稱", "Title / Merchant")}
          </Text>
          <TextInput
            testID="finance-bill-title-input"
            accessibilityLabel={copy("事项或商户名称", "事項或商戶名稱", "Title or merchant")}
            value={title}
            onChangeText={handleTitleChange}
            placeholder={copy(
              "例如：午饭外卖、地铁、星巴克、工资（输入自动分类）",
              "例如：午飯外賣、地鐵、星巴克、薪資（輸入自動分類）",
              "e.g. Lunch, Coffee, Rent (auto-categorizes)",
            )}
            placeholderTextColor={tokens.mutedForeground}
            style={{
              backgroundColor: cardBg,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              color: tokens.foreground,
              fontSize: 15,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor,
            }}
          />
        </View>

        {/* Category Grid */}
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 4 }}>
            <Text style={{ color: tokens.mutedForeground, fontSize: 12.5 }}>
              {copy("分类", "分類", "Category")}
            </Text>
            {categoryAutoTagged ? (
              <View
                testID="finance-bill-auto-category-badge"
                style={{
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderRadius: 999,
                  backgroundColor: smartBg,
                }}
              >
                <Text style={{ color: smartInk, fontSize: 10.5, fontWeight: "600" }}>
                  {copy("已自动分类", "已自動分類", "Auto-classified")}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {categories.map((cat) => {
              const selected = category === cat;
              const sym = billCategorySymbol(cat);
              return (
                <MotionPressable
                  key={cat}
                  preset="control"
                  testID={`finance-bill-category-${cat}`}
                  onPress={() => {
                    setCategory(cat);
                    setCategoryManual(true);
                    setCategoryAutoTagged(false);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    paddingHorizontal: 11,
                    paddingVertical: 7,
                    borderRadius: 999,
                    backgroundColor: selected ? activeBg : cardBg,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: selected ? "transparent" : borderColor,
                  }}
                >
                  <NativeSymbol
                    ios={sym.ios}
                    android={sym.android}
                    size={13}
                    color={selected ? activeInk : sym.color}
                  />
                  <Text
                    style={{
                      color: selected ? activeInk : tokens.foreground,
                      fontSize: 13,
                      fontWeight: selected ? "600" : "500",
                    }}
                  >
                    {billCategoryLabel(cat, locale)}
                  </Text>
                </MotionPressable>
              );
            })}
          </View>
        </View>

        {/* Payment Method Picker */}
        <View style={{ gap: 8 }}>
          <Text style={{ color: tokens.mutedForeground, fontSize: 12.5, paddingLeft: 4 }}>
            {copy("支付方式", "支付方式", "Payment method")}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            <MotionPressable
              preset="control"
              onPress={() => setPaymentMethodId(null)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: paymentMethodId === null ? activeBg : cardBg,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: paymentMethodId === null ? "transparent" : borderColor,
              }}
            >
              <Text
                style={{
                  color: paymentMethodId === null ? activeInk : tokens.foreground,
                  fontSize: 13,
                  fontWeight: "500",
                }}
              >
                {copy("不关联", "不關聯", "None")}
              </Text>
            </MotionPressable>
            {methods.map((method) => {
              const selected = paymentMethodId === method.id;
              return (
                <MotionPressable
                  key={method.id}
                  preset="control"
                  onPress={() => setPaymentMethodId(method.id)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: selected ? activeBg : cardBg,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: selected ? "transparent" : borderColor,
                  }}
                >
                  <Text
                    style={{
                      color: selected ? activeInk : tokens.foreground,
                      fontSize: 13,
                      fontWeight: selected ? "600" : "500",
                    }}
                  >
                    {method.last4 ? `${method.label} · ${method.last4}` : method.label}
                  </Text>
                </MotionPressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Date & Status */}
        <View style={{ gap: 8 }}>
          <Text style={{ color: tokens.mutedForeground, fontSize: 12.5, paddingLeft: 4 }}>
            {copy("日期与状态", "日期與狀態", "Date & Status")}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextInput
              value={dateText}
              onChangeText={setDateText}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={tokens.mutedForeground}
              style={{
                flex: 1,
                backgroundColor: cardBg,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 9,
                color: tokens.foreground,
                fontSize: 14,
                fontVariant: ["tabular-nums"],
                borderWidth: StyleSheet.hairlineWidth,
                borderColor,
              }}
            />
            {[
              { label: copy("今天", "今天", "Today"), offset: 0 },
              { label: copy("昨天", "昨天", "Yesterday"), offset: -1 },
            ].map((item) => (
              <MotionPressable
                key={item.offset}
                preset="control"
                onPress={() => setRelativeDate(item.offset)}
                style={{
                  paddingHorizontal: 11,
                  paddingVertical: 9,
                  borderRadius: 12,
                  backgroundColor: chipBg,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor,
                }}
              >
                <Text style={{ color: tokens.foreground, fontSize: 13, fontWeight: "500" }}>
                  {item.label}
                </Text>
              </MotionPressable>
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {FINANCE_BILL_STATUSES.map((st) => {
              const selected = status === st;
              return (
                <MotionPressable
                  key={st}
                  preset="control"
                  onPress={() => setStatus(st)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: selected ? activeBg : chipBg,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: selected ? "transparent" : borderColor,
                  }}
                >
                  <Text
                    style={{
                      color: selected ? activeInk : tokens.mutedForeground,
                      fontSize: 12.5,
                      fontWeight: "500",
                    }}
                  >
                    {billStatusLabel(st, locale)}
                  </Text>
                </MotionPressable>
              );
            })}
          </View>
        </View>

        {/* Note */}
        <View style={{ gap: 6 }}>
          <Text style={{ color: tokens.mutedForeground, fontSize: 12.5, paddingLeft: 4 }}>
            {copy("备注（可选）", "備註（選填）", "Note (optional)")}
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={copy("补充消费说明或报销备注", "補充消費說明或報銷備註", "Extra details")}
            placeholderTextColor={tokens.mutedForeground}
            multiline
            style={{
              backgroundColor: cardBg,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 10,
              minHeight: 68,
              textAlignVertical: "top",
              color: tokens.foreground,
              fontSize: 14,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor,
            }}
          />
        </View>

        {error ? (
          <Text accessibilityRole="alert" style={{ color: dangerInk, fontSize: 13 }}>
            {error}
          </Text>
        ) : null}

        {editing && onDelete ? (
          <MotionPressable
            preset="control"
            disabled={saving}
            onPress={handleDelete}
            style={{
              alignItems: "center",
              paddingVertical: 12,
              borderRadius: 14,
              backgroundColor: isLight ? "rgba(180, 35, 24, 0.08)" : "rgba(249, 112, 102, 0.14)",
            }}
          >
            <Text style={{ color: dangerInk, fontSize: 14, fontWeight: "600" }}>
              {copy("删除这笔账单", "刪除此筆帳單", "Delete bill")}
            </Text>
          </MotionPressable>
        ) : null}
      </ScrollView>
    </AppModalSheet>
  );
}
