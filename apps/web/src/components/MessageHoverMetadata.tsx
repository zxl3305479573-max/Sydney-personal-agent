import type { ReactNode } from "react";

export function MessageHoverMetadata({
  side,
  pinned = false,
  children,
}: {
  side: "start" | "end";
  pinned?: boolean;
  children: ReactNode;
}) {
  const reveal = pinned
    ? "pointer-events-auto opacity-100"
    : "pointer-events-none opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover/message:pointer-events-auto [@media(hover:hover)_and_(pointer:fine)]:group-hover/message:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 [@media(hover:none)]:group-data-[touch-actions=open]/message:pointer-events-auto [@media(hover:none)]:group-data-[touch-actions=open]/message:opacity-100";

  return (
    <div
      data-testid="message-hover-rail"
      className={`absolute top-1/2 z-10 flex -translate-y-1/2 items-center transition-opacity ${reveal} ${
        side === "end" ? "start-full ms-1" : "end-full me-1"
      } [@media(hover:none)]:static [@media(hover:none)]:w-full [@media(hover:none)]:translate-y-0 ${
        pinned
          ? "[@media(hover:none)]:mt-1"
          : "[@media(hover:none)]:max-h-0 [@media(hover:none)]:overflow-hidden [@media(hover:none)]:group-data-[touch-actions=open]/message:mt-1 [@media(hover:none)]:group-data-[touch-actions=open]/message:max-h-none [@media(hover:none)]:group-data-[touch-actions=open]/message:overflow-visible [@media(hover:none)]:focus-within:max-h-none [@media(hover:none)]:focus-within:overflow-visible"
      } ${
        side === "end"
          ? "[@media(hover:none)]:ms-0 [@media(hover:none)]:justify-start"
          : "[@media(hover:none)]:me-0 [@media(hover:none)]:justify-end"
      }`}
    >
      {children}
    </div>
  );
}
