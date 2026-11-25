import { describe, expect, it, vi } from "vitest";
import { registerTabScrollToTop, triggerTabScrollToTop } from "./tab-scroll-to-top";

describe("tab-scroll-to-top registry", () => {
  it("invokes registered scroll handlers for the matching active tab route and cleans up", () => {
    const onHome = vi.fn();
    const onChats = vi.fn();
    const stopHome = registerTabScrollToTop("/", onHome);
    const stopChats = registerTabScrollToTop("/chats", onChats);

    expect(triggerTabScrollToTop("/")).toBe(true);
    expect(onHome).toHaveBeenCalledOnce();
    expect(onChats).not.toHaveBeenCalled();

    expect(triggerTabScrollToTop("/chats")).toBe(true);
    expect(onChats).toHaveBeenCalledOnce();

    stopHome();
    expect(triggerTabScrollToTop("/")).toBe(false);
    expect(onHome).toHaveBeenCalledOnce();

    stopChats();
    expect(triggerTabScrollToTop("/chats")).toBe(false);
  });
});
