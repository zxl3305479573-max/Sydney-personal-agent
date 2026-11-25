import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SCROLL_TAGS = new Set([
  "ScrollView",
  "FlatList",
  "SectionList",
  "Animated.ScrollView",
  "Animated.FlatList",
]);

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkTsx(full, out);
    else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) out.push(full);
  }
  return out;
}

describe("mobile native scroll hygiene", () => {
  it("hides exposed vertical and horizontal scrollbars across all mobile screens and components", () => {
    const mobileRoot = resolve(import.meta.dirname, "..");
    const files = [...walkTsx(join(mobileRoot, "app")), ...walkTsx(join(mobileRoot, "components"))];
    const violations: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (!/(ScrollView|FlatList|SectionList)/.test(source)) continue;
      const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText(sf);
          if (SCROLL_TAGS.has(tag)) {
            let isHorizontal = false;
            let hasVerticalFalse = false;
            let hasHorizontalFalse = false;
            for (const attr of node.attributes.properties) {
              if (!ts.isJsxAttribute(attr)) continue;
              const name = attr.name.getText(sf);
              const expr =
                attr.initializer && ts.isJsxExpression(attr.initializer)
                  ? attr.initializer.expression?.getText(sf)
                  : undefined;
              if (name === "horizontal" && (!attr.initializer || expr !== "false")) {
                isHorizontal = true;
              }
              if (name === "showsVerticalScrollIndicator" && expr === "false") {
                hasVerticalFalse = true;
              }
              if (name === "showsHorizontalScrollIndicator" && expr === "false") {
                hasHorizontalFalse = true;
              }
            }
            const missing = isHorizontal ? !hasHorizontalFalse : !hasVerticalFalse;
            if (missing) {
              const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
              const rel = file.slice(mobileRoot.length + 1).replace(/\\/g, "/");
              violations.push(
                `${rel}:${line} <${tag}> missing ${isHorizontal ? "showsHorizontalScrollIndicator={false}" : "showsVerticalScrollIndicator={false}"}`,
              );
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }

    expect(violations).toEqual([]);
  });
});
