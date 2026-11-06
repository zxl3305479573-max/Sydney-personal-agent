import { Trans, useLingui } from "@lingui/react/macro";
import type { BotAvatarSet } from "@rakazo/contracts";
import { BOT_NAME_MAX_LENGTH } from "@rakazo/contracts";
import {
  newClientId,
  ORGANIC_AVATAR_HEART_FAMILY,
  ORGANIC_AVATAR_LOOKS,
  organicAvatarFamily,
  organicAvatarSampleIdentity,
} from "@rakazo/core";
import {
  BOT_AVATAR_COLORS,
  BotAvatar,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  parseBotAvatar,
} from "@rakazo/ui-web";
import { X } from "lucide-react";
import { useRef, useState } from "react";
import { errorText } from "../../lib/user-error";
import { BotLookPicker } from "./avatar-studio-popover";

/** One preview identity per organic look, so the dialog can show a body before the bot has an id. */
const ORGANIC_IDENTITIES = ORGANIC_AVATAR_LOOKS.map(organicAvatarSampleIdentity);

function pick<T>(options: readonly T[]): T {
  return options[Math.floor(Math.random() * options.length)]!;
}

export interface CreateBotDialogInput {
  name: string;
  color: string;
  /** Reserve the logo preview's persistent seed through creation and retries. */
  id?: string;
  avatarSet: BotAvatarSet;
  /** The organic family the preview drew; omitted when a studio shape is picked. */
  avatarFamily?: number;
}

/** Mounted only while open; the parent unmounts it from `onCancel` or after `onCreate`. */
export function CreateBotDialog({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (input: CreateBotDialogInput) => Promise<void>;
}) {
  const { t } = useLingui();
  const nameRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [name, setName] = useState("");
  const [previewId] = useState(() => {
    let id: string;
    do {
      id = `c${newClientId().replaceAll("-", "").slice(0, 24)}`;
    } while (organicAvatarFamily(id) === ORGANIC_AVATAR_HEART_FAMILY);
    return id;
  });
  const [look, setLook] = useState(() => ({
    value: `${pick(BOT_AVATAR_COLORS)}::fluid_#8B5CF6`,
    identity: pick(ORGANIC_IDENTITIES),
  }));
  const [avatarSet, setAvatarSet] = useState<BotAvatarSet>("fluid");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();

  async function create() {
    if (!trimmed || submitting) return;
    setError(null);
    setSubmitting(true);
    const organic = avatarSet === "organic" && parseBotAvatar(look.value).shapeIndex === undefined;
    try {
      await onCreate({
        name: trimmed,
        color: look.value,
        ...(avatarSet === "rakazo" ? { id: previewId } : {}),
        avatarSet,
        ...(organic ? { avatarFamily: organicAvatarFamily(look.identity) } : {}),
      });
    } catch (err) {
      setError(errorText(err, t`Could not create bot`));
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submitting) onCancel();
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        initialFocus={
          typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
            ? closeRef
            : nameRef
        }
        className="sydney-create-bot max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
        data-testid="create-bot-dialog"
      >
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <DialogHeader>
            <button
              ref={closeRef}
              type="button"
              aria-label={t`Close`}
              className="sydney-create-bot-close"
              disabled={submitting}
              onClick={onCancel}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </DialogHeader>
          <div className="sydney-create-bot-handle" aria-hidden="true" />
          <div className="sydney-create-bot-intro">
            <DialogTitle className="sydney-create-bot-title">
              <Trans>New bot</Trans>
            </DialogTitle>
            <p className="sydney-create-bot-description">
              <Trans>Give your assistant a unique identity</Trans>
            </p>
          </div>
          <div className="sydney-create-bot-preview flex justify-center py-2">
            <BotAvatar
              color={look.value}
              identity={avatarSet === "rakazo" ? previewId : look.identity}
              size={96}
              avatarSet={avatarSet}
            />
          </div>
          <div className="sydney-create-bot-field">
            <label htmlFor="create-bot-name" className="sydney-create-bot-label">
              <Trans>Bot name</Trans>
            </label>
            <Input
              ref={nameRef}
              id="create-bot-name"
              aria-label={t`Name`}
              placeholder={t`Name your Bot`}
              value={name}
              maxLength={BOT_NAME_MAX_LENGTH}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" data-testid="create-bot-error" className="text-[13px] text-destructive">
              {error}
            </p>
          ) : null}
          <div className="sydney-create-bot-field">
            <span className="sydney-create-bot-label">
              <Trans>Avatar shape</Trans>
            </span>
            <BotLookPicker
              value={look.value}
              identity={avatarSet === "rakazo" ? previewId : look.identity}
              organicIdentities={ORGANIC_IDENTITIES}
              avatarSet={avatarSet}
              colorLabel={t`Avatar color`}
              onAvatarSetChange={(set, value) => {
                setAvatarSet(set);
                setLook((current) => ({ ...current, value }));
              }}
              onChange={(value, identity) => {
                setLook((current) => ({ value, identity: identity ?? current.identity }));
              }}
            />
          </div>
          <DialogFooter className="sydney-create-bot-footer">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={onCancel}
              className="sydney-create-bot-cancel"
            >
              <Trans>Cancel</Trans>
            </Button>
            <Button type="submit" disabled={!trimmed || submitting}>
              <Trans>Create</Trans>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
