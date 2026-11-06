import { describe, expect, it } from "vitest";
import { avatarSourceToDataUrl, BUILT_IN_AVATARS } from "./avatar-library";

describe("avatar library", () => {
  it("ships exactly the three selectable built-in avatars", () => {
    expect(BUILT_IN_AVATARS).toHaveLength(3);
    expect(BUILT_IN_AVATARS.every((avatar) => avatar.src.startsWith("/avatar-library/"))).toBe(
      true,
    );
  });

  it("keeps existing data URLs without a network request", async () => {
    const dataUrl = "data:image/webp;base64,abc";
    await expect(avatarSourceToDataUrl(dataUrl)).resolves.toBe(dataUrl);
  });
});
