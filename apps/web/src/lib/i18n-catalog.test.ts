import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UI_LOCALES } from "./ui-locale";

describe("web language catalogs", () => {
  it("provides the supported catalogs and Chinese sidebar labels", () => {
    for (const locale of UI_LOCALES) {
      expect(
        readFileSync(
          fileURLToPath(new URL(`../locales/${locale}/messages.po`, import.meta.url)),
          "utf8",
        ),
      ).toContain('msgid "Bots"');
    }
    const chinese = readFileSync(
      fileURLToPath(new URL("../locales/zh-CN/messages.po", import.meta.url)),
      "utf8",
    );
    expect(chinese).toContain('msgid "Bots"\nmsgstr "小伙伴"');
    expect(chinese).toContain('msgid "Group"\nmsgstr "群聊"');
  });

  it("provides nonempty Chinese translations for bot creation and page labels", () => {
    const chinese = readFileSync(
      fileURLToPath(new URL("../locales/zh-CN/messages.po", import.meta.url)),
      "utf8",
    );
    for (const message of [
      "Give your assistant a unique identity",
      "Bot name",
      "Personality",
      "Avatar",
      "Balanced",
      "Reliable for everyday conversations",
      "Professional",
      "Structured and precise",
      "Friendly",
      "Warm and patient",
      "Concise",
      "Short and action focused",
      "Creative",
      "Ideas and fresh directions",
      "Teacher",
      "Patient explanations and examples",
      "Custom",
      "Use the instructions below",
      "Add from device",
      "Your uploaded avatars are saved in this browser.",
      "Bot settings",
      "Password recovery",
      "Get started",
      "Access management",
    ]) {
      expect(chinese, message).toMatch(
        new RegExp(`msgid ${JSON.stringify(message)}\\nmsgstr ".+"`),
      );
    }
  });

  it("keeps Chinese messages translated and uses the selected product terms", () => {
    const chinese = readFileSync(
      fileURLToPath(new URL("../locales/zh-CN/messages.po", import.meta.url)),
      "utf8",
    );
    expect(chinese).not.toMatch(/^msgid ".+"\r?\nmsgstr ""(?:\r?\n|$)/m);
    expect(chinese).not.toMatch(/^msgstr ".*(?:机器人|群组)/m);
  });
});
