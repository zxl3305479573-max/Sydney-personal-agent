import { expect, it } from "vitest";
import { DE_MESSAGES } from "./locales/de";
import { ES_MESSAGES } from "./locales/es";
import { JA_MESSAGES } from "./locales/ja";
import { NL_MESSAGES } from "./locales/nl";
import { RU_MESSAGES } from "./locales/ru";
import { ZH_MESSAGES } from "./locales/zh";
import { ZH_TW_MESSAGES } from "./locales/zh-TW";

it.each([
  ["de", DE_MESSAGES],
  ["es", ES_MESSAGES],
  ["ja", JA_MESSAGES],
  ["nl", NL_MESSAGES],
  ["ru", RU_MESSAGES],
  ["zh-CN", ZH_MESSAGES],
  ["zh-TW", ZH_TW_MESSAGES],
])("translates the device screen in %s", (_locale, messages) => {
  for (const key of [
    "Computers",
    "Could not load devices.",
    "No computers paired with this account.",
    "Offline",
    "Refresh",
    "Connected",
    "Retry",
    "Loading…",
    "Status at {time}; refresh to check again.",
    "Your session is unavailable or expired. Sign in again.",
    "The device API is unavailable. Check the server configuration.",
    "Could not reach the server. Check your connection.",
    "The device request timed out. Try again.",
  ]) {
    expect(messages[key], key).toBeTruthy();
    if (key.includes("{time}")) expect(messages[key]).toContain("{time}");
  }
});
