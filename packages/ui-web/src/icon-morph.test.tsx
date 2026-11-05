import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChevronIcon, CopyCheckIcon, HeartIcon, IconMorph, MenuIcon } from "./icon-morph.js";

describe("IconMorph", () => {
  it("renders both states hidden from assistive tech with a fixed hit box", () => {
    const html = renderToStaticMarkup(<IconMorph name="menu" size={20} />);
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(2);
    expect(html).toContain('focusable="false"');
    expect(html).toContain('width="20"');
    expect(html).toContain('height="20"');
    expect(html).toContain('data-state="off"');
    expect(html).toContain("motion-reduce:transition-none");
  });

  it("exposes the second state and a chevron turn", () => {
    const html = renderToStaticMarkup(
      <ChevronIcon state turn={180} pointing="right" className="chevron" />,
    );
    expect(html).toContain('data-state="on"');
    expect(html).toContain("rotate:180deg");
    expect(html).toContain("chevron");
  });

  it("keeps named pair exports available", () => {
    expect(renderToStaticMarkup(<MenuIcon state />)).toContain('data-state="on"');
    expect(renderToStaticMarkup(<CopyCheckIcon />)).toContain('data-state="off"');
    expect(renderToStaticMarkup(<HeartIcon size={16} />)).toContain('width="16"');
  });
});
