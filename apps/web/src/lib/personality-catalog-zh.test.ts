import { PERSONALITY_CATALOG } from "@rakazo/contracts";
import { expect, it } from "vitest";
import { personalityCatalogLabel } from "./personality-catalog-zh";

it("provides Chinese names for every bundled attribute and retains English names", () => {
  for (const item of PERSONALITY_CATALOG) {
    expect(personalityCatalogLabel(item, "zh-CN"), item.id).toMatch(/[\u3400-\u9fff]/);
    expect(personalityCatalogLabel(item, "en")).toBe(item.name);
  }
});
