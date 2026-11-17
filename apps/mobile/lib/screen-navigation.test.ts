import { describe, expect, it } from "vitest";
import { isAllowedScreenNavigation } from "./screen-navigation";

describe("screen navigation", () => {
  const source = "https://192.0.2.10/novnc/session/view/1.token/vnc.html";

  it("allows only the loaded screen path and origin", () => {
    expect(isAllowedScreenNavigation(source, source)).toBe(true);
    expect(isAllowedScreenNavigation(source, `${source}#reconnect`)).toBe(false);
    expect(isAllowedScreenNavigation(source, `${source}?`)).toBe(false);
    expect(isAllowedScreenNavigation(source, `${source}#`)).toBe(false);
    expect(isAllowedScreenNavigation(source, `${source}?path=other`)).toBe(false);
    expect(isAllowedScreenNavigation(source, "https://192.0.2.10/other")).toBe(false);
    expect(
      isAllowedScreenNavigation(source, "https://192.0.2.10/novnc/session/view/1.other/vnc.html"),
    ).toBe(false);
    expect(isAllowedScreenNavigation(source, "http://192.0.2.10/other")).toBe(false);
    expect(isAllowedScreenNavigation(source, "https://192.0.2.10:444/other")).toBe(false);
    expect(isAllowedScreenNavigation(source, "https://example.test/other")).toBe(false);
    expect(isAllowedScreenNavigation(source, "https://user@192.0.2.10/other")).toBe(false);
  });

  it("rejects invalid and non-network URLs", () => {
    expect(isAllowedScreenNavigation(source, "javascript:alert(1)")).toBe(false);
    expect(isAllowedScreenNavigation(source, "about:blank")).toBe(false);
    expect(isAllowedScreenNavigation("not a URL", source)).toBe(false);
  });

  it("preserves the issued screen query exactly", () => {
    const issued = `${source}?autoconnect=true&resize=scale&view_only=true&path=%2Fnovnc%2Fsession%2Fview%2F1.token%2Fwebsockify`;
    expect(isAllowedScreenNavigation(issued, issued)).toBe(true);
    expect(isAllowedScreenNavigation(issued, `${issued}&view_only=true`)).toBe(false);
    expect(isAllowedScreenNavigation(issued, issued.replace("resize=scale&", ""))).toBe(false);
    expect(isAllowedScreenNavigation(issued, issued.replace("scale", "remote"))).toBe(false);
    expect(
      isAllowedScreenNavigation(
        issued,
        `${source}?resize=scale&autoconnect=true&view_only=true&path=%2Fnovnc%2Fsession%2Fview%2F1.token%2Fwebsockify`,
      ),
    ).toBe(false);
    expect(isAllowedScreenNavigation(issued, issued.replace("scale", "%73cale"))).toBe(false);
  });

  it("retains local HTTP support without allowing another origin", () => {
    const local = "http://192.168.1.2/novnc";
    expect(isAllowedScreenNavigation(local, "http://192.168.1.2/novnc")).toBe(true);
    expect(isAllowedScreenNavigation(local, "http://192.168.1.3/page")).toBe(false);
  });
});
