import { describe, expect, it } from "vitest";
import { passwordResetToken } from "./password-reset-link";

describe("password reset links", () => {
  const server = "https://server.example";
  const callback = "https://login.example/reset-password";
  const token = "abcdefghijklmnop123456";

  it("accepts the server's email link and its configured callback", () => {
    expect(
      passwordResetToken(
        `${server}/api/auth/reset-password/${token}?callbackURL=anything`,
        server,
        callback,
      ),
    ).toBe(token);
    expect(passwordResetToken(`${callback}?token=${token}`, server, callback)).toBe(token);
    expect(
      passwordResetToken(`${server}/api/auth/native-reset?token=${token}`, server, callback),
    ).toBe(token);
    expect(
      passwordResetToken(
        `https://login.example/api/auth/native-reset?token=${token}`,
        server,
        callback,
      ),
    ).toBe(token);
  });

  it("rejects unrelated origins, paths, credentials and ambiguous tokens", () => {
    for (const link of [
      `https://other.example/api/auth/reset-password/${token}`,
      `https://server.example.evil.test/api/auth/reset-password/${token}`,
      `https://user@server.example/api/auth/reset-password/${token}`,
      `${server}/not-reset/${token}`,
      `${callback}?token=${token}&token=${token}`,
      `${callback}?token=${token}&error=expired`,
      `${callback}?token=short`,
      `${server}/api/auth/native-reset?token=${token}&token=${token}`,
      `${server}/api/auth/native-reset?token=${token}&state=old`,
      `rakazo://reset-password?state=${"s".repeat(43)}&token=${token}`,
    ])
      expect(passwordResetToken(link, server, callback)).toBeNull();
  });
});

describe("password reset origin binding", () => {
  it("rejects server A credentials at server B", () => {
    for (const pathname of [
      "/api/auth/native-reset?token=abcdefghijklmnop123456",
      "/api/auth/reset-password/abcdefghijklmnop123456",
    ]) {
      expect(
        passwordResetToken(
          `https://server-a.example${pathname}`,
          "https://server-b.example",
          "https://server-b.example/reset-password",
        ),
      ).toBeNull();
    }
  });
});
