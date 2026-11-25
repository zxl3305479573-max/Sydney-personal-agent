import { BRAND_LOGOS } from "./brand";
import { DOCS_URL, GITHUB_URL, IOS_SETUP_URL, RELEASES_URL, SITE_DESCRIPTION, SITE_NAME } from "./site";

export const HOME_MARKDOWN = `# ${SITE_NAME}

${SITE_DESCRIPTION}

- [Windows releases](${RELEASES_URL})
- [iPhone setup guide](${IOS_SETUP_URL})
- [Project docs](${DOCS_URL})
- [Source code](${GITHUB_URL})
`;

export const BRAND_MARKDOWN = `# Sydney brand assets

${BRAND_LOGOS.map((logo) => `- [${logo.name}](${logo.file})`).join("\n")}
`;

export const AGENT_INSTRUCTIONS = HOME_MARKDOWN;

export function markdownResponse(content: string, method: string) {
  return new Response(method === "HEAD" ? null : content, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
