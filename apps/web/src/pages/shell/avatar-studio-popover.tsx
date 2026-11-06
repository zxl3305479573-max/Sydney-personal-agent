import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { BotAvatarSet } from "@rakazo/contracts";
import {
  BotAvatar,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@rakazo/ui-web";
import { Button } from "@rakazo/ui-web/components/ui/button";
import { Check, Pencil, Trash2, Upload, X } from "lucide-react";
import { useState } from "react";
import {
  avatarSourceToDataUrl,
  BUILT_IN_AVATARS,
  removeAvatarFromLibrary,
  saveAvatarToLibrary,
  useAvatarLibrary,
} from "../../lib/avatar-library";

export function BotLookPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string, identity?: string) => void;
}) {
  const savedAvatars = useAvatarLibrary();
  const [uploading, setUploading] = useState(false);
  const allAvatars = [
    ...BUILT_IN_AVATARS.map((avatar) => ({
      id: avatar.id,
      name: avatar.name,
      source: avatar.src,
      removable: false,
    })),
    ...savedAvatars.map((avatar) => ({
      id: avatar.id,
      name: avatar.name,
      source: avatar.dataUrl,
      removable: true,
    })),
  ];

  async function processImageFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const dataUrl = await cropImageToAvatar(file);
      await saveAvatarToLibrary(dataUrl).catch(() => undefined);
      onChange(dataUrl);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="sydney-avatar-library">
      <div className="sydney-avatar-library-grid">
        {allAvatars.map((avatar) => (
          <div key={avatar.id} className="sydney-avatar-library-item">
            <button
              type="button"
              aria-label={avatar.name}
              aria-pressed={value === avatar.source}
              onClick={() => onChange(avatar.source)}
              className="sydney-avatar-library-option"
            >
              <BotAvatar color={avatar.source} size={64} />
            </button>
            {avatar.removable ? (
              <button
                type="button"
                aria-label={t`Delete ${avatar.name}`}
                className="sydney-avatar-library-delete"
                onClick={(event) => {
                  event.stopPropagation();
                  void removeAvatarFromLibrary(avatar.id).catch(() => undefined);
                }}
              >
                <Trash2 size={12} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <label className="sydney-avatar-library-upload">
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void processImageFile(file);
            event.target.value = "";
          }}
        />
        <Upload size={16} aria-hidden="true" />
        <span>{uploading ? <Trans>Adding…</Trans> : <Trans>Add from device</Trans>}</span>
      </label>
      <p className="sydney-avatar-library-hint">
        <Trans>Your uploaded avatars are saved in this browser.</Trans>
      </p>
    </div>
  );
}

function cropImageToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result;
      if (typeof src !== "string") {
        reject(new Error("无法读取图片"));
        return;
      }
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        const targetSize = 256;
        if (!context) {
          reject(new Error("无法处理图片"));
          return;
        }
        canvas.width = targetSize;
        canvas.height = targetSize;
        context.beginPath();
        context.arc(targetSize / 2, targetSize / 2, targetSize / 2, 0, Math.PI * 2);
        context.clip();
        const minDimension = Math.min(image.width, image.height);
        const left = (image.width - minDimension) / 2;
        const top = (image.height - minDimension) / 2;
        context.drawImage(
          image,
          left,
          top,
          minDimension,
          minDimension,
          0,
          0,
          targetSize,
          targetSize,
        );
        resolve(canvas.toDataURL("image/webp", 0.9));
      };
      image.onerror = () => reject(new Error("图片无法解码"));
      image.src = src;
    };
    reader.onerror = () => reject(reader.error ?? new Error("无法读取图片"));
    reader.readAsDataURL(file);
  });
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
  const [previewValue, setPreviewValue] = useState(value);
  const [saving, setSaving] = useState(false);

  async function selectAvatar(next: string) {
    setPreviewValue(next);
    if (next.startsWith("/avatar-library/")) {
      setSaving(true);
      try {
        onChange(await avatarSourceToDataUrl(next), "organic");
      } finally {
        setSaving(false);
      }
      return;
    }
    onChange(next, "organic");
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setPreviewValue(value);
          setOpen(true);
        }}
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
              <Trans>Avatar library</Trans>
            </DialogTitle>
            <DialogDescription className="sr-only">
              <Trans>Choose an avatar or add your own image</Trans>
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
              color={previewValue}
              identity={identity}
              size={78}
              status={status}
              avatarSet={avatarSet}
            />
          </div>

          <BotLookPicker value={previewValue} onChange={(next) => void selectAvatar(next)} />

          <DialogFooter className="border-border sm:justify-end">
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              <Check size={14} />
              <Trans>Done</Trans>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
