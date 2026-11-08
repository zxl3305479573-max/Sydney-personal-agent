import { Input as InputPrimitive } from "@base-ui/react/input";
import { Button } from "@rakazo/ui-web/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@rakazo/ui-web/components/ui/field";
import { cn } from "@rakazo/ui-web/lib/utils";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import * as React from "react";

type InputProps = Omit<React.ComponentProps<"input">, "size"> & {
  size?: "default" | "xl";
};

const inputClass =
  "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm leading-5 tracking-[-0.01em] text-foreground shadow-none transition-[border-color,background-color] duration-150 outline-none motion-reduce:transition-none [@media(hover:hover)]:hover:border-foreground file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-destructive md:text-sm dark:disabled:bg-input/80 data-[size=xl]:h-12 data-[size=xl]:rounded-xl data-[size=xl]:px-4 data-[size=xl]:md:text-base";

/** The labels of the show/hide button on hidden fields; the kit itself is not translated. */
const RevealLabelsContext = React.createContext({
  show: "Show password",
  hide: "Hide password",
});

/** Supplies translated labels for the show/hide button of every hidden field below it. */
function InputRevealLabelsProvider({
  show,
  hide,
  children,
}: {
  show: string;
  hide: string;
  children: React.ReactNode;
}) {
  const labels = React.useMemo(() => ({ show, hide }), [show, hide]);
  return <RevealLabelsContext.Provider value={labels}>{children}</RevealLabelsContext.Provider>;
}

function Input({ className, type, size = "default", ...props }: InputProps) {
  if (type === "password") return <HiddenInput className={className} size={size} {...props} />;
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-size={size}
      className={cn(inputClass, className)}
      {...props}
    />
  );
}

function TextField({
  label,
  description,
  error,
  id,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  ...props
}: InputProps & {
  label: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
}) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const descriptionId = `${inputId}-description`;
  const errorId = `${inputId}-error`;
  const describedByIds = [describedBy, description ? descriptionId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");
  return (
    <Field data-invalid={error ? true : undefined} className="min-w-0 gap-0">
      <FieldLabel htmlFor={inputId} className="mb-2 text-sm text-foreground">
        {label}
      </FieldLabel>
      <Input
        {...props}
        id={inputId}
        aria-invalid={error ? true : invalid}
        aria-describedby={describedByIds || undefined}
      />
      {description ? (
        <FieldDescription id={descriptionId} className="pt-2 text-xs">
          {description}
        </FieldDescription>
      ) : null}
      {error ? (
        <FieldError id={errorId} className="pt-2 text-xs">
          {error}
        </FieldError>
      ) : null}
    </Field>
  );
}

/**
 * A field whose value is hidden, with a button that shows it. The caller's classes go on the
 * input like any other field. The input is a block, so its margins pass through the wrapper and
 * the button stays centred on the field.
 */
function HiddenInput({ className, size, disabled, ...props }: Omit<InputProps, "type">) {
  const labels = React.useContext(RevealLabelsContext);
  const [shown, setShown] = React.useState(false);
  // Disabling the field, say while a form submits, hides the value again, and it stays hidden
  // when the field is enabled again.
  if (disabled && shown) setShown(false);
  const visible = shown && !disabled;
  return (
    <div data-slot="input-reveal" className="relative w-full min-w-0">
      <InputPrimitive
        type={visible ? "text" : "password"}
        data-slot="input"
        data-size={size}
        disabled={disabled}
        className={cn(inputClass, "block", className, "pr-9 data-[size=xl]:pr-12")}
        {...props}
      />
      <Button
        type="button"
        variant="ghost"
        size={size === "xl" ? "icon" : "icon-sm"}
        disabled={disabled}
        aria-label={visible ? labels.hide : labels.show}
        // A click leaves the caret in the field; the keyboard still reaches the button.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setShown((current) => !current)}
        className={cn(
          "absolute inset-y-0 my-auto text-muted-foreground",
          size === "xl" ? "right-2" : "right-1",
        )}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </Button>
    </div>
  );
}

export { Input, InputRevealLabelsProvider, TextField };
