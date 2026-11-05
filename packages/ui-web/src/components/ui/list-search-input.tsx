import { Command as CommandPrimitive } from "cmdk";
import { Search, X } from "lucide-react";
import type { Ref } from "react";
import { useRef } from "react";
import { InputGroup, InputGroupAddon } from "./input-group";

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
    "aria-label": label,
    placeholder,
    autoComplete: "off",
    "data-slot": "input-group-control",
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape" && query && !event.nativeEvent.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        event.stopPropagation();
        clear();
      }
    },
    className:
      "min-w-0 flex-1 bg-transparent py-1 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-search-cancel-button]:hidden",
  };

  return (
    <InputGroup className="h-8! shrink-0 rounded-lg! border-input bg-background shadow-sm transition-colors motion-reduce:transition-none">
      <InputGroupAddon>
        <Search className="size-4 shrink-0 opacity-50" aria-hidden="true" />
      </InputGroupAddon>
      {command ? (
        <CommandPrimitive.Input {...props} onValueChange={setQuery} />
      ) : (
        <input {...props} onChange={(event) => setQuery(event.target.value)} />
      )}
      <div className="flex w-8 shrink-0 items-center justify-center">
        {query ? (
          <button
            type="button"
            aria-label={`${clearLabel} ${label}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={clear}
            className="animate-in fade-in zoom-in-95 rounded-md p-1 text-muted-foreground duration-150 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring motion-reduce:animate-none motion-reduce:transition-none"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </InputGroup>
  );
}
