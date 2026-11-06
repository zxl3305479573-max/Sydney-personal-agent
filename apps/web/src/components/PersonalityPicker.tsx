import { Trans, useLingui } from "@lingui/react/macro";
import type { PersonalityId } from "../lib/personality-library";
import { PERSONALITY_LIBRARY } from "../lib/personality-library";

function localizedPersonality(
  id: PersonalityId,
  t: (parts: TemplateStringsArray, ...values: unknown[]) => string,
) {
  switch (id) {
    case "professional":
      return { label: t`Professional`, description: t`Structured and precise` };
    case "friendly":
      return { label: t`Friendly`, description: t`Warm and patient` };
    case "concise":
      return { label: t`Concise`, description: t`Short and action focused` };
    case "creative":
      return { label: t`Creative`, description: t`Ideas and fresh directions` };
    case "teacher":
      return { label: t`Teacher`, description: t`Patient explanations and examples` };
    default:
      return { label: t`Balanced`, description: t`Reliable for everyday conversations` };
  }
}

export function PersonalityPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: PersonalityId | "custom";
  onChange: (value: PersonalityId | null) => void;
  disabled?: boolean;
}) {
  const { t } = useLingui();
  return (
    <div className="sydney-personality-picker" data-testid="personality-picker">
      <ul className="sydney-personality-picker-grid">
        {PERSONALITY_LIBRARY.map((preset) => {
          const copy = localizedPersonality(preset.id, t);
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
        <li>
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
        </li>
      </ul>
    </div>
  );
}
