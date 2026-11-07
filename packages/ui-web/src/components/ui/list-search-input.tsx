import { Command as CommandPrimitive } from "cmdk";
import { Search, X } from "lucide-react";
import type { Ref } from "react";
import { useId, useRef } from "react";

export function ListSearchInput({
  query,
  setQuery,
  label,
  clearLabel,
  placeholder,
  inputRef,
  command = false,
}: {
  query: string;
  setQuery: (query: string) => void;
  label: string;
  clearLabel: string;
  placeholder: string;
  inputRef?: Ref<HTMLInputElement>;
  command?: boolean;
}) {
  const generatedId = useId();
  const controlId = `search-${generatedId.replace(/:/g, "")}`;
  const localRef = useRef<HTMLInputElement | null>(null);
  function clear() {
    setQuery("");
    localRef.current?.focus();
  }
  const props = {
    ref: (node: HTMLInputElement | null) => {
      localRef.current = node;
      if (typeof inputRef === "function") inputRef(node);
      else if (inputRef) inputRef.current = node;
    },
    type: "search" as const,
    value: query,
    id: controlId,
    "aria-label": label,
    placeholder,
    autoComplete: "off",
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (
        event.key === "Escape" &&
        query &&
        !event.nativeEvent.isComposing &&
        event.keyCode !== 229
      ) {
        event.preventDefault();
        event.stopPropagation();
        clear();
      }
    },
    className:
      "min-w-0 flex-1 border-0 bg-transparent text-sm leading-5 tracking-[-0.01em] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-search-cancel-button]:hidden",
  };

  return (
    <div className="group/search-field grid min-w-0 gap-2">
      <label
        htmlFor={controlId}
        className="text-sm font-medium leading-5 tracking-[-0.01em] text-foreground"
      >
        {label}
      </label>
      <div className="flex h-10 min-w-0 items-center gap-2 rounded-[var(--radius)] border border-input bg-background px-3 transition-[border-color] duration-150 group-focus-within/search-field:border-foreground [@media(hover:hover)]:hover:border-foreground motion-reduce:transition-none">
        <Search
          className="size-[18px] shrink-0 text-muted-foreground transition-colors duration-150 group-focus-within/search-field:text-foreground motion-reduce:transition-none"
          aria-hidden="true"
        />
        {command ? (
          <CommandPrimitive.Input {...props} onValueChange={setQuery} />
        ) : (
          <input {...props} onChange={(event) => setQuery(event.target.value)} />
        )}
        <span className="flex size-6 shrink-0 items-center justify-center">
          {query ? (
            <button
              type="button"
              aria-label={`${clearLabel} ${label}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={clear}
              className="animate-in fade-in zoom-in-95 grid size-6 place-items-center rounded-[calc(var(--radius)-4px)] text-muted-foreground duration-150 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring motion-reduce:animate-none motion-reduce:transition-none"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </span>
      </div>
    </div>
  );
}
