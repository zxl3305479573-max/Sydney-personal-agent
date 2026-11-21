import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const sitemap = site ? new URL("sitemap-index.xml", site) : undefined;
  const body = `User-agent: *\nAllow: /\n${sitemap ? `\nSitemap: ${sitemap.href}\n` : ""}`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};
