// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { navigateAuthorizationPopup, openAuthorizationPopup } from "./authorization-popup";

afterEach(() => {
  vi.restoreAllMocks();
});

it("reserves a window immediately and navigates it to the authorization URL", () => {
  const popup = { opener: window, location: { href: "about:blank" } };
  const open = vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
  const result = openAuthorizationPopup("connect");
  expect(open).toHaveBeenCalledWith("about:blank", "connect", expect.any(String));
  expect(popup.opener).toBeNull();
  navigateAuthorizationPopup(result, "https://auth.example.test/login");
  expect(popup.location.href).toBe("https://auth.example.test/login");
});

it("rejects unsafe authorization URLs before navigating", () => {
  const popup = { location: { href: "about:blank" } } as unknown as Window;
  expect(() => navigateAuthorizationPopup(popup, "javascript:alert(1)")).toThrow(
    "Invalid authorization URL",
  );
  expect(popup.location.href).toBe("about:blank");
});
