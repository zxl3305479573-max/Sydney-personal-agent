import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RollingNumber } from "./rolling-number.js";

describe("RollingNumber", () => {
  it("gives assistive tech the formatted total and hides the rolling digits", () => {
    const html = renderToString(<RollingNumber value={1230527} />);
    expect(html).toContain('<span class="sr-only">1,230,527</span>');
    // Seven digits plus the two group separators.
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(9);
  });

  it("rolls digits in their own column and leaves separators in place", () => {
    const html = renderToString(<RollingNumber value={98} />);
    expect(html.match(/h-\[1em\] w-\[1ch\]/g)).toHaveLength(2);
    // Two digit columns and nothing static: a number without separators stays two parts.
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(2);
  });

  it("speaks the label when a prefix or suffix carries meaning", () => {
    const html = renderToString(
      <RollingNumber value={1234} prefix="$" decimals={2} label="US$1,234.00" />,
    );
    expect(html).toContain('<span class="sr-only">US$1,234.00</span>');
    expect(html).toContain('class="me-[0.1em]">$</span>');
    // Six digits, the group and decimal separators, and the prefix.
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(9);
  });
});
