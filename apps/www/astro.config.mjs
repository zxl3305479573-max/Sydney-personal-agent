import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import { LOCALE_HREFLANG, LOCALES } from "./src/i18n/locales.ts";
import { resolveWwwPort } from "./www-port.mjs";

const wwwPort = resolveWwwPort();
const site = process.env.SYDNEY_SITE_URL?.trim() || undefined;

export default defineConfig({
  site,
  output: "static",
  i18n: {
    defaultLocale: "en",
    locales: [...LOCALES],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  integrations: site
    ? [sitemap({ i18n: { defaultLocale: "en", locales: LOCALE_HREFLANG } })]
    : [],
  server: {
    host: "127.0.0.1",
    port: wwwPort,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: wwwPort,
  },
});
