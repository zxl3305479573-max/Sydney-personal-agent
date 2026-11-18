import path from "node:path";
import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sideloadAssetPath = require("../sideload-asset-path.js") as (asset: {
  fileSystemLocation?: string;
  httpServerLocation: string;
}) => {
  fileSystemLocation?: string;
  httpServerLocation: string;
};

describe("sideload-asset-path", () => {
  it("produces identical directory paths across Expo bundle transform and asset copy phases", () => {
    const botAvatarsDir = path.resolve(__dirname, "../assets/bot-avatars");
    const fromTransform = sideloadAssetPath({
      fileSystemLocation: botAvatarsDir,
      httpServerLocation: "/assets?export_path=/assets/assets/bot-avatars",
    });
    const fromSaveAssets = sideloadAssetPath({
      fileSystemLocation: botAvatarsDir,
      httpServerLocation: "/assets/assets/bot-avatars",
    });
    const fromDevServer = sideloadAssetPath({
      fileSystemLocation: botAvatarsDir,
      httpServerLocation: "/assets/?unstable_path=./assets/bot-avatars",
    });

    expect(fromTransform.httpServerLocation).toMatch(/^\/assets\/sydney\/[0-9a-f]{24}$/);
    expect(fromSaveAssets.httpServerLocation).toBe(fromTransform.httpServerLocation);
    expect(fromDevServer.httpServerLocation).toBe(fromTransform.httpServerLocation);
  });

  it("keeps monorepo workspace assets stable across publicPath variants and repeated invocations", () => {
    const sharedIconDir = path.resolve(
      __dirname,
      "../../../packages/ui-tokens/assets/Sydney.icon/Assets",
    );
    const first = sideloadAssetPath({
      fileSystemLocation: sharedIconDir,
      httpServerLocation:
        "/assets?export_path=/assets/../../packages/ui-tokens/assets/Sydney.icon/Assets",
    });
    const copied = sideloadAssetPath({
      fileSystemLocation: sharedIconDir,
      httpServerLocation: "/assets/../../packages/ui-tokens/assets/Sydney.icon/Assets",
    });
    const twice = sideloadAssetPath(first);

    expect(first.httpServerLocation).toMatch(/^\/assets\/sydney\/[0-9a-f]{24}$/);
    expect(copied.httpServerLocation).toBe(first.httpServerLocation);
    expect(twice.httpServerLocation).toBe(first.httpServerLocation);
  });

  it("normalizes query-prefixed httpServerLocation when fileSystemLocation is absent", () => {
    const exported = sideloadAssetPath({
      httpServerLocation: "/assets?export_path=/assets/assets/bot-avatars",
    });
    const plain = sideloadAssetPath({
      httpServerLocation: "/assets/assets/bot-avatars",
    });

    expect(exported.httpServerLocation).toBe(plain.httpServerLocation);
  });
});
