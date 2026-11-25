import { ChatMarkdown, LinkifiedText } from "@rakazo/chat-ui/web";
import type { ComponentProps, ReactNode } from "react";

export function MessageTextBubble({
  messageRole: role,
  children,
  className,
  quoteMessageId,
}: {
  messageRole: "user" | "bot";
  children: ReactNode;
  className?: string;
  quoteMessageId?: string;
}) {
  return (
    <div
      data-testid={`message-${role}-bubble`}
      data-quote-message-id={quoteMessageId}
      className={`sydney-chat-bubble-${role} rk-chat-type max-w-full text-foreground/80 ${role === "user" ? "whitespace-pre-wrap wrap-anywhere" : ""} ${className ?? ""}`}
      style={{ color: `var(--custom-chat-${role}-foreground, var(--foreground))` }}
      dir="auto"
    >
      {children}
    </div>
  );
}

export function MessageText({
  messageRole: role,
  children,
  ...markdown
}: ComponentProps<typeof ChatMarkdown> & { messageRole: "user" | "bot" }) {
  return role === "user" ? (
    <LinkifiedText>{children}</LinkifiedText>
  ) : (
    <ChatMarkdown {...markdown} showWebsiteUrls>
      {children}
    </ChatMarkdown>
  );
}
