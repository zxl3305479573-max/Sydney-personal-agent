import { shippedBotAvatarShapePath } from "@rakazo/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BotAvatar, resolvePersonaColorDef } from "./bot-avatar.js";
import { GroupAvatar } from "./group-avatar.js";

describe("Sydney bot avatar", () => {
  it("renders the saved avatar shape rather than a generic outline", () => {
    const html = renderToStaticMarkup(<BotAvatar color="#10B981::shape_2" />);
    expect(html).toContain(shippedBotAvatarShapePath(2));
    expect(html).toContain('data-color="#10B981"');
  });

  it("uses the separate saved avatar colour and exposes working state", () => {
    const html = renderToStaticMarkup(
      <BotAvatar color="#123456::fluid_#10B981" status="running" size={24} />,
    );
    expect(html).toContain('data-color="#10B981"');
    expect(html).toContain('data-working="true"');
    expect(html).toContain("width:24px;height:24px");
    expect(html.match(/<rect /g)).toHaveLength(2);
    expect(html).not.toContain("<canvas");
  });

  it("keeps uploaded images and rejects remote image addresses", () => {
    expect(renderToStaticMarkup(<BotAvatar color="data:image/png;base64,abc" />)).toContain(
      'src="data:image/png;base64,abc"',
    );
    const remote = renderToStaticMarkup(
      <BotAvatar color="https://example.test/avatar.png" identity="sample" />,
    );
    expect(remote).not.toContain("example.test");
    expect(remote).toContain(`data-color="${resolvePersonaColorDef("sample").hex}"`);
  });

  it("uses legible dark marks for a white avatar", () => {
    const html = renderToStaticMarkup(<BotAvatar color="#FFFFFF" />);
    expect(html).toContain('fill="#141414"');
  });

  it("renders group members with their individual colours", () => {
    const html = renderToStaticMarkup(
      <GroupAvatar members={[{ color: "#8B5CF6" }, { color: "#10B981" }]} />,
    );
    expect(html).toContain('data-color="#8B5CF6"');
    expect(html).toContain('data-color="#10B981"');
    expect(html.match(/sydney-bot-avatar shrink/g)).toHaveLength(2);
  });
});
