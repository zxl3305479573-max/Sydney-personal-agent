import type {
  PersonalityAttribute,
  PersonalityAttributeCategory,
  PersonalitySelection,
} from "./personality.js";
import catalogData from "./personality-catalog-data.json" with { type: "json" };

/**
 * The bundled Hersona attribute catalog's runtime shape. The catalog files are
 * CC0 templates from shiro-0x/hersona (MIT code); see docx/DEVELOPMENT_LOG.md.
 */
export interface PersonalityCatalogAttribute extends PersonalityAttribute {
  /** Category-local name such as "intellectual" or "mandarin_casual". */
  slug: string;
  /** The canonical rendered sentence used when this attribute is blended. */
  instruction: string;
  conflictsWith: readonly string[];
}

export type PersonalityCatalog = readonly PersonalityCatalogAttribute[];
export const PERSONALITY_CATALOG = catalogData.attributes as PersonalityCatalog;

export function renderPersonalitySelections(selections: readonly PersonalitySelection[]): string {
  const selected = selections.map((selection) => {
    const attribute = PERSONALITY_CATALOG.find((item) => item.id === selection.attributeId);
    if (!attribute) throw new Error(`Unknown personality attribute: ${selection.attributeId}`);
    return { attribute, weight: selection.weight };
  });
  if (new Set(selected.map(({ attribute }) => attribute.id)).size !== selected.length) {
    throw new Error("Duplicate personality attribute");
  }
  for (const [index, left] of selected.entries()) {
    for (const right of selected.slice(index + 1)) {
      if (
        left.attribute.conflictsWith.includes(right.attribute.slug) ||
        right.attribute.conflictsWith.includes(left.attribute.slug)
      ) {
        throw new Error(
          `Conflicting personality attributes: ${left.attribute.name}, ${right.attribute.name}`,
        );
      }
    }
  }
  const weights = { mild: "轻度", moderate: "适度", strong: "明显" } as const;
  return selected
    .map(({ attribute, weight }) => `${weights[weight]}体现以下特征：${attribute.instruction}`)
    .join("\n");
}

export const PERSONALITY_CATEGORY_LABEL: Record<PersonalityAttributeCategory, string> = {
  personality: "Personality",
  speech: "Speech",
  archetype: "Role",
  hobby: "Interests",
};

export function personalityAttributeId(
  category: PersonalityAttributeCategory,
  slug: string,
): string {
  return `${category}/${slug}`;
}
