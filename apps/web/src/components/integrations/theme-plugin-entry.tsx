import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@rakazo/ui-web";
import { ChevronLeft, ChevronRight, Palette } from "lucide-react";
import { useState } from "react";
import type { AppearancePreference } from "../../lib/ui-appearance";
import { getUiAppearancePreference, setUiAppearance } from "../../lib/ui-appearance";

export function ThemePluginEntry({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const [appearance, setAppearance] = useState<AppearancePreference>(getUiAppearancePreference);
  const options: { value: AppearancePreference; label: string }[] = [
    { value: "system", label: t`System` },
    { value: "light", label: t`Light` },
    { value: "dark", label: t`Dark` },
  ];

  if (!open) {
    return (
      <section data-testid="theme-plugin-entry">
        <h3 className="mb-2 px-2.5 text-[14px] font-medium text-muted-foreground">
          <Trans>Appearance</Trans>
        </h3>
        <button
          type="button"
          onClick={() => {
            setAppearance(getUiAppearancePreference());
            onOpenChange(true);
          }}
          className="flex w-full min-w-0 items-center gap-3 rounded-xl px-2.5 py-2 text-start hover:bg-accent/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-foreground">
            <Palette size={20} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">
              <Trans>Theme plugins</Trans>
            </span>
            <span className="block text-[13px] text-muted-foreground">
              <Trans>Manage the appearance of the app.</Trans>
            </span>
          </span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </section>
    );
  }

  return (
    <section data-testid="theme-plugin-panel" className="space-y-5">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="-ms-2 text-muted-foreground"
          aria-label={t`Back`}
          onClick={() => onOpenChange(false)}
        >
          <ChevronLeft />
        </Button>
        <h3 className="text-[17px] font-medium text-foreground">
          <Trans>Theme plugins</Trans>
        </h3>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        <Trans>Theme plugin installation and layout changes are not available yet.</Trans>
      </p>
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-foreground">
          <Trans>Appearance</Trans>
        </h4>
        <fieldset aria-label={t`Appearance`} className="flex flex-wrap gap-2">
          {options.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={appearance === option.value ? "default" : "secondary"}
              aria-pressed={appearance === option.value}
              onClick={() => {
                setUiAppearance(option.value);
                setAppearance(option.value);
              }}
            >
              {option.label}
            </Button>
          ))}
        </fieldset>
      </div>
    </section>
  );
}
