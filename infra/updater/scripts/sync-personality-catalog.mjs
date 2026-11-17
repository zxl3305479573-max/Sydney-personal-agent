import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const revision = "75146c9126e1614750eeead3da165d61a3fc2188";
const categories = ["personality", "speech", "archetype", "hobby"];
const root = process.argv[2];
if (!root) throw new Error(`Provide a local Hersona checkout at revision ${revision}`);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const manifestBytes = await readFile(path.join(root, "checksums.json"));
if (sha256(manifestBytes) !== "aee89f97728972a66f11565112817667d0e4d5bf731f527f651f0c061fbdfdf6")
  throw new Error("The source does not match the pinned Hersona checksum manifest");
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const output = fileURLToPath(
  new URL("../../../packages/contracts/src/personality-catalog-data.json", import.meta.url),
);

function render(category, data) {
  const language = data.content_lang ?? "ja";
  const content = language === "zh" ? data : (data.content_i18n?.en ?? data);
  const traits = Array.isArray(content.core_traits) ? content.core_traits : [];
  const phrases = Array.isArray(content.catchphrases) ? content.catchphrases : [];
  const parts = [];
  if (category === "speech") {
    if (data.register) parts.push(`语体：${data.register}。`);
    if (data.second_person) parts.push(`称呼：${data.second_person}。`);
    if (data.first_person) parts.push(`第一人称：${data.first_person}。`);
    if (data.speech_style) parts.push(data.speech_style);
    else if (content.tone) parts.push(content.tone);
    if (data.lexical_markers?.length)
      parts.push(`常用词：${data.lexical_markers.slice(0, 12).join("、")}。`);
    if (data.sentence_endings?.length)
      parts.push(`句尾：${data.sentence_endings.slice(0, 6).join("、")}。`);
  } else {
    if (traits.length) parts.push(`核心特质：${traits.slice(0, 7).join("、")}。`);
    if (content.tone) parts.push(`语气：${content.tone}`);
  }
  const examples = phrases
    .slice(0, 6)
    .map((item) => (typeof item === "string" ? item : item?.phrase))
    .filter(Boolean);
  if (examples.length) parts.push(`口头禅参考：${examples.join(" / ")}。`);
  if (language === "zh") parts.push("使用自然、口语化的中文表达。");
  return `【${data.display_name ?? data.attribute_name}】${parts.join("")}`;
}

const attributes = [];
for (const category of categories) {
  const directory = path.join(root, "attributes", category);
  for (const filename of (await readdir(directory))
    .filter((name) => name.endsWith(".yaml"))
    .sort()) {
    const slug = filename.slice(0, -5);
    const bytes = await readFile(path.join(directory, filename));
    if (sha256(bytes) !== manifest.files[`attributes/${category}/${filename}`])
      throw new Error(`Attribute checksum mismatch: ${category}/${filename}`);
    const data = parse(bytes.toString("utf8"));
    if (!data || typeof data !== "object") throw new Error(`Invalid attribute: ${filename}`);
    const name = data.display_name?.trim() || slug;
    attributes.push({
      id: `${category}/${slug}`,
      category,
      slug,
      name,
      description: (data.description?.replace(/\s+/g, " ").trim() || name).slice(0, 480),
      source: "hersona",
      instruction: render(category, data),
      conflictsWith: Array.isArray(data.conflicts_with)
        ? data.conflicts_with.filter((item) => typeof item === "string").slice(0, 16)
        : [],
    });
  }
}
if (attributes.length !== 300) throw new Error(`Unexpected catalog size ${attributes.length}`);
await writeFile(
  output,
  `${JSON.stringify({ source: "https://github.com/shiro-0x/hersona", revision, license: "CC0-1.0", attributes }, null, 1)}\n`,
  "utf8",
);
process.stdout.write(`wrote ${attributes.length} attributes -> ${output}\n`);
