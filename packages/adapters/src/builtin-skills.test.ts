import { describe, expect, it } from "vitest";
import { BUILTIN_AGENT_SKILLS } from "./builtin-skills.js";

describe("built-in skills", () => {
  it("does not direct agents to the upstream product or its documentation", () => {
    expect(BUILTIN_AGENT_SKILLS).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Rakazo" })]),
    );
    for (const skill of BUILTIN_AGENT_SKILLS) {
      expect(skill.content).not.toContain("rakazo.com/docs");
    }
  });
});
