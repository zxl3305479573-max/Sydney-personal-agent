import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { BotAvatarSet } from "@rakazo/contracts";
import { SHIPPED_BOT_AVATAR_SHAPE_KEYS } from "@rakazo/core";
import {
  BOT_AVATAR_COLORS,
  BotAvatar,
  DEFAULT_BOT_AVATAR_COLOR,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  defaultBotAvatarValue,
  parseBotAvatar,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@rakazo/ui-web";
import { Button } from "@rakazo/ui-web/components/ui/button";
import { Check, Pencil, Upload, X } from "lucide-react";
import type { ClipboardEvent, DragEvent } from "react";
import { useRef, useState } from "react";
import { AppearanceColorPicker } from "../../components/AppearanceColorPicker";

/**
 * The shape grid and color row for a bot's look. With `organicIdentities`, the grid also offers
 * the organic body each identity draws (for a bot that has no id yet); without them, "Default"
 * restores the bot's own organic body.
 */
export function BotLookPicker({
  value,
  identity,
  organicIdentities,
  avatarSet = "organic",
  colorLabel,
  onAvatarSetChange,
  onChange,
}: {
  value: string;
  identity?: string;
  organicIdentities?: readonly string[];
  avatarSet?: BotAvatarSet;
  colorLabel?: string;
  onAvatarSetChange?: (set: BotAvatarSet, value: string) => void;
  onChange: (value: string, identity?: string) => void;
}) {
  const parsed = parseBotAvatar(value);
  const fluidMatch = /^(#[0-9a-fA-F]{3,6})::fluid_(#[0-9a-fA-F]{6})$/.exec(value);
  const fluidBase = fluidMatch?.[1] ?? defaultBotAvatarValue(value);
  const fluidColor =
    fluidMatch?.[2] ?? (/^#[0-9a-fA-F]{6}$/.test(fluidBase) ? fluidBase : "#8B5CF6");
  function selectColor(color: string) {
    if (parsed.shapeIndex !== undefined) {
      onChange(`${color}::shape_${parsed.shapeIndex}`);
      return;
    }
    const next = `${fluidBase}::fluid_${color}`;
    if (avatarSet !== "fluid" && onAvatarSetChange) onAvatarSetChange("fluid", next);
    else onChange(next);
  }

  return (
    <div className="space-y-4">
      {organicIdentities ? (
        <fieldset className="sydney-bot-shapes" aria-label={t`Bot shape`}>
          <button
            type="button"
            aria-label={t`Default shape`}
            aria-pressed={parsed.shapeIndex === undefined}
            onClick={() => onAvatarSetChange?.("fluid", `${fluidBase}::fluid_${fluidColor}`)}
            className="sydney-bot-shape"
          >
            <BotAvatar color={`${fluidBase}::fluid_${fluidColor}`} size={38} />
          </button>
          {SHIPPED_BOT_AVATAR_SHAPE_KEYS.map((shape, index) => (
            <button
              key={shape}
              type="button"
              aria-label={t`Shape ${index + 1}`}
              aria-pressed={parsed.shapeIndex === index}
              onClick={() => onAvatarSetChange?.("organic", `${fluidColor}::shape_${index}`)}
              className="sydney-bot-shape"
            >
              <BotAvatar color={`${fluidColor}::shape_${index}`} size={38} />
            </button>
          ))}
        </fieldset>
      ) : null}
      <div className="border-t border-border pt-2">
        <div className="mb-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {colorLabel ?? <Trans>Color</Trans>}
        </div>
        <div className="grid grid-cols-6 place-items-center gap-2">
          {BOT_AVATAR_COLORS.map((color) => {
            const selected = fluidColor.toLowerCase() === color.toLowerCase() && !parsed.isImage;
            return (
              <button
                key={color}
                type="button"
                onClick={() => selectColor(color)}
                aria-label={t`Color ${color}`}
                aria-pressed={selected}
                className={`size-6 rounded-full border transition-transform hover:scale-110 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring ${
                  selected
                    ? "scale-105 border-transparent ring-2 ring-foreground ring-offset-2 ring-offset-popover"
                    : "border-border"
                }`}
                style={{ backgroundColor: color }}
              />
            );
          })}
        </div>
        <div className="mt-3">
          <AppearanceColorPicker
            label={t`Custom color`}
            value={fluidColor}
            onChange={selectColor}
          />
        </div>
      </div>
    </div>
  );
}

export interface AvatarStudioPopoverProps {
  value: string;
  identity?: string;
  status?: string;
  avatarSet?: BotAvatarSet;
  size?: number;
  onChange: (value: string, avatarSet?: BotAvatarSet) => void;
  disabled?: boolean;
}

export function AvatarStudioPopover({
  value,
  identity,
  status,
  avatarSet = "organic",
  size = 72,
  onChange,
  disabled = false,
}: AvatarStudioPopoverProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"bot" | "upload">("bot");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function restoreDefaultAvatar() {
    const next = defaultBotAvatarValue(value);
    if (next !== value) onChange(next);
  }

  function processImageFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      if (!src) return;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const targetSize = 256;
        canvas.width = targetSize;
        canvas.height = targetSize;
        if (!ctx) return;

        ctx.beginPath();
        ctx.arc(targetSize / 2, targetSize / 2, targetSize / 2, 0, Math.PI * 2);
        ctx.clip();

        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, targetSize, targetSize);

        onChange(canvas.toDataURL("image/webp", 0.9));
        setOpen(false);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) processImageFile(file);
  }

  function handlePaste(event: ClipboardEvent<HTMLButtonElement>) {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item?.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (file) {
        processImageFile(file);
        break;
      }
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="group relative cursor-pointer rounded-2xl outline-none transition-transform hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t`Customize bot avatar`}
        data-testid="avatar-studio-trigger"
      >
        <BotAvatar
          color={value}
          identity={identity}
          size={size}
          status={status}
          avatarSet={avatarSet}
        />
        <div className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full border-2 border-background bg-secondary text-foreground shadow-md transition-transform group-hover:scale-110">
          <Pencil size={12} strokeWidth={2.2} />
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="w-[360px] max-w-full gap-4 rounded-3xl p-5 sm:max-w-[360px]"
          data-testid="avatar-studio"
        >
          <DialogHeader className="flex-row items-center justify-between space-y-0">
            <DialogTitle className="text-[14px] font-semibold tracking-tight">
              <Trans>Avatar Studio</Trans>
            </DialogTitle>
            <DialogDescription className="sr-only">
              <Trans>Choose a bot shape, color, or upload an image</Trans>
            </DialogDescription>
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full text-muted-foreground"
              aria-label={t`Close`}
            >
              <X size={16} />
            </Button>
          </DialogHeader>

          <div className="flex flex-col items-center justify-center py-2">
            <BotAvatar
              color={value}
              identity={identity}
              size={78}
              status={status}
              avatarSet={avatarSet}
            />
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(next) => setActiveTab(next as "bot" | "upload")}
            className="gap-4"
          >
            <div className="flex items-center justify-between border-b border-border pb-1">
              <TabsList className="rounded-full">
                <TabsTrigger value="bot" className="rounded-full px-3 text-xs">
                  <Trans>Bot</Trans>
                </TabsTrigger>
                <TabsTrigger value="upload" className="rounded-full px-3 text-xs">
                  <Trans>Upload</Trans>
                </TabsTrigger>
              </TabsList>

              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={restoreDefaultAvatar}
                className="text-xs text-muted-foreground"
              >
                <Trans>Reset</Trans>
              </Button>
            </div>

            <TabsContent value="bot" className="pt-1" data-testid="avatar-studio-bot-tab">
              <BotLookPicker
                value={value}
                identity={identity}
                avatarSet={avatarSet}
                onChange={(next) => onChange(next)}
                onAvatarSetChange={(set, next) => onChange(next, set)}
              />
            </TabsContent>
            <TabsContent value="upload">
              <button
                type="button"
                aria-label={t`Image upload area`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onPaste={handlePaste}
                onClick={() => fileInputRef.current?.click()}
                className={`flex w-full flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center transition-colors ${
                  dragOver
                    ? "border-primary bg-primary/10"
                    : "border-border bg-muted hover:border-foreground/30"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) processImageFile(file);
                  }}
                />
                <div className="mb-2 grid size-10 place-items-center rounded-full bg-secondary text-muted-foreground">
                  <Upload size={18} strokeWidth={1.8} />
                </div>
                <p className="text-[12.5px] font-medium text-muted-foreground">
                  <Trans>Drag, drop, or paste an image</Trans>
                </p>
                <span className="mt-3 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-foreground">
                  <Trans>Choose file</Trans>
                </span>
              </button>
            </TabsContent>
          </Tabs>

          <DialogFooter className="border-border sm:justify-end">
            <Button variant="secondary" size="sm" type="button" onClick={() => setOpen(false)}>
              <Check size={14} />
              <Trans>Done</Trans>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
