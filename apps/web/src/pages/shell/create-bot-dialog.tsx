import { Trans, useLingui } from "@lingui/react/macro";
import type { BotAvatarSet } from "@rakazo/contracts";
import { BOT_NAME_MAX_LENGTH } from "@rakazo/contracts";
import {
  BotAvatar,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@rakazo/ui-web";
import { X } from "lucide-react";
import { useRef, useState } from "react";
import { PersonalityPicker } from "../../components/PersonalityPicker";
import { PersonalPersonalityLibrary } from "../../components/PersonalPersonalityLibrary";
import { avatarSourceToDataUrl, BUILT_IN_AVATARS } from "../../lib/avatar-library";
import type { PersonalityId } from "../../lib/personality-library";
import { personalityPreset } from "../../lib/personality-library";
import { errorText } from "../../lib/user-error";
import { BotLookPicker } from "./avatar-studio-popover";

export interface CreateBotDialogInput {
  name: string;
  color: string;
  avatarSet: BotAvatarSet;
  instructions: string;
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
  const [avatar, setAvatar] = useState(BUILT_IN_AVATARS[0]!.src);
  const [personality, setPersonality] = useState<PersonalityId | null>("balanced");
  const [personalInstructions, setPersonalInstructions] = useState<string | null>(null);
  const [personalName, setPersonalName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();

  async function create() {
    if (!trimmed || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const avatarDataUrl = await avatarSourceToDataUrl(avatar);
      await onCreate({
        name: trimmed,
        color: avatarDataUrl,
        avatarSet: "organic",
        instructions: personalInstructions ?? (personality ? personalityPreset(personality).instructions : ""),
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
            <BotAvatar color={avatar} size={96} avatarSet="organic" />
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
          <div className="sydney-create-bot-field">
            <span className="sydney-create-bot-label">
              <Trans>Personality</Trans>
            </span>
            <PersonalityPicker
              value={personality ?? "custom"}
              onChange={(value) => {
                setPersonalInstructions(null);
                setPersonalName("");
                setPersonality(value);
              }}
              disabled={submitting}
              allowCustom={false}
            />
            <PersonalPersonalityLibrary
              disabled={submitting}
              onApply={(instructions, name) => {
                setPersonality(null);
                setPersonalInstructions(instructions);
                setPersonalName(name);
              }}
            />
            {personalName && <p className="text-xs">{personalName}</p>}
          </div>
          {error ? (
            <p role="alert" data-testid="create-bot-error" className="text-[13px] text-destructive">
              {error}
            </p>
          ) : null}
          <div className="sydney-create-bot-field">
            <span className="sydney-create-bot-label">
              <Trans>Avatar</Trans>
            </span>
            <BotLookPicker value={avatar} onChange={setAvatar} />
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
