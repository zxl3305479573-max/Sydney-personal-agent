import { Trans, useLingui } from "@lingui/react/macro";
import type { PersonalityId } from "../lib/personality-library";
import { PERSONALITY_LIBRARY } from "../lib/personality-library";

export function PersonalityPicker({
  value,
  onChange,
  disabled = false,
  allowCustom = true,
}: {
  value: PersonalityId | "custom";
  onChange: (value: PersonalityId | null) => void;
  disabled?: boolean;
  allowCustom?: boolean;
}) {
  const { t } = useLingui();
  const labels: Record<PersonalityId, { label: string; description: string }> = {
    balanced: { label: t`Balanced`, description: t`Reliable for everyday conversations` },
    professional: { label: t`Professional`, description: t`Structured and precise` },
    friendly: { label: t`Friendly`, description: t`Warm and patient` },
    concise: { label: t`Concise`, description: t`Short and action focused` },
    creative: { label: t`Creative`, description: t`Ideas and fresh directions` },
    teacher: { label: t`Teacher`, description: t`Patient explanations and examples` },
  };
  return (
    <div className="sydney-personality-picker" data-testid="personality-picker">
      <ul className="sydney-personality-picker-grid">
        {PERSONALITY_LIBRARY.map((preset) => {
          const copy = labels[preset.id];
          return (
            <li key={preset.id}>
              <button
                type="button"
                data-testid={`personality-${preset.id}`}
                aria-pressed={value === preset.id}
                disabled={disabled}
                onClick={() => onChange(preset.id)}
                className="sydney-personality-option"
              >
                <span className="sydney-personality-option-title">{copy.label}</span>
                <span className="sydney-personality-option-description">{copy.description}</span>
              </button>
            </li>
          );
        })}
        {allowCustom ? <li>
          <button
            type="button"
            data-testid="personality-custom"
            aria-pressed={value === "custom"}
            disabled={disabled}
            onClick={() => onChange(null)}
            className="sydney-personality-option"
          >
            <span className="sydney-personality-option-title">
              <Trans>Custom</Trans>
            </span>
            <span className="sydney-personality-option-description">
              <Trans>Use the instructions below</Trans>
            </span>
          </button>
        </li> : null}
      </ul>
    </div>
  );
}
