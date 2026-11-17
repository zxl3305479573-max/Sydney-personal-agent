import { Trans, useLingui } from "@lingui/react/macro";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@rakazo/core";
import { Input, Label } from "@rakazo/ui-web";
import { Check, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export function PasswordStrength({
  id,
  label,
  value,
  onChange,
  name,
  className = "",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  name?: string;
  className?: string;
}) {
  const { t } = useLingui();
  const [revealed, setRevealed] = useState(false);
  const rules = [
    { id: "length", label: t`At least 8 characters`, met: value.length >= MIN_PASSWORD_LENGTH },
    {
      id: "case",
      label: t`Uppercase and lowercase letters`,
      met: /[a-z]/.test(value) && /[A-Z]/.test(value),
    },
    { id: "number", label: t`At least one number`, met: /[0-9]/.test(value) },
    { id: "symbol", label: t`At least one symbol`, met: /[^a-zA-Z0-9\s]/.test(value) },
  ];
  const met = rules.filter((rule) => rule.met).length;
  const level = !value ? 0 : value.length < MIN_PASSWORD_LENGTH ? 1 : Math.max(1, met);
  const strength = !value
    ? t`No password`
    : value.length < MIN_PASSWORD_LENGTH
      ? t`Too short`
      : [t`Weak`, t`Fair`, t`Good`, t`Strong`][level - 1];
  const tone = level === 4 ? "bg-success" : level >= 2 ? "bg-warning" : "bg-destructive";
  const rulesId = `${id}-rules`;
  const meterId = `${id}-strength`;

  return (
    <div className={`w-full ${className}`}>
      <Label htmlFor={id} className="text-muted-foreground">
        {label}
      </Label>
      <div className="relative mt-2">
        <Input
          id={id}
          name={name}
          autoComplete="new-password"
          type={revealed ? "text" : "password"}
          required
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={`${meterId} ${rulesId}`}
          className="h-12 rounded-xl px-4 pr-12 text-base"
        />
        <button
          type="button"
          aria-label={revealed ? t`Hide password` : t`Show password`}
          aria-pressed={revealed}
          aria-controls={id}
          onClick={() => setRevealed(!revealed)}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-4px]"
        >
          {revealed ? (
            <EyeOff aria-hidden="true" size={18} />
          ) : (
            <Eye aria-hidden="true" size={18} />
          )}
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <meter
          id={meterId}
          aria-label={t`Password strength`}
          aria-valuetext={strength}
          min={0}
          max={4}
          value={level}
          className="sr-only"
        />
        <div aria-hidden="true" className="flex flex-1 gap-1">
          {rules.map((rule, index) => (
            <span
              key={rule.id}
              aria-hidden="true"
              className={`h-1.5 flex-1 rounded-full transition-colors motion-reduce:transition-none ${index < level ? tone : "bg-muted"}`}
            />
          ))}
        </div>
        <span aria-hidden="true" className="text-xs text-muted-foreground">
          {strength}
        </span>
      </div>
      <div id={rulesId} className="mt-3">
        <p className="text-xs text-muted-foreground">
          <Trans>Only the length is required; the other suggestions improve strength.</Trans>
        </p>
        <ul className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          {rules.map((rule) => (
            <li key={rule.id} className="flex items-center gap-2">
              <Check
                aria-hidden="true"
                size={14}
                className={rule.met ? "text-success" : "opacity-30"}
              />
              <span>
                {rule.label}
                <span className="sr-only">{rule.met ? t`, met` : t`, not met`}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <span role="status" className="sr-only">
        {strength}. {met}/4
      </span>
    </div>
  );
}
