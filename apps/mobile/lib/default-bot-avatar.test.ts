import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { DEFAULT_BOT_AVATAR_DATA_URI } from "./default-bot-avatar";

const directory = path.dirname(fileURLToPath(import.meta.url));
const expoRequire = createRequire(
  realpathSync(path.join(directory, "../node_modules/expo/metro-config.js")),
);
const metroRequire = createRequire(expoRequire.resolve("@expo/metro-config"));
const { resolve } = metroRequire("metro-resolver");
const { transformSync } = metroRequire("@babel/core");

function loadAvatarModule(platform: string) {
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  function load(specifier: string, originModulePath: string): Record<string, unknown> | number {
    if (specifier.endsWith(".webp")) {
      expect(existsSync(path.resolve(path.dirname(originModulePath), specifier))).toBe(true);
      return 42;
    }
    const resolution = resolve(
      {
        originModulePath,
        preferNativePlatform: platform !== "web",
        sourceExts: ["ts", "tsx", "js", "jsx", "json"],
        assetExts: new Set(["webp"]),
        mainFields: ["react-native", "browser", "main"],
        getPackageForModule: () => null,
        doesFileExist: existsSync,
        fileSystemLookup: (filePath: string) => {
          if (!existsSync(filePath)) return { exists: false };
          return {
            exists: true,
            type: statSync(filePath).isDirectory() ? "d" : "f",
            realPath: realpathSync(filePath),
          };
        },
      },
      specifier,
      platform,
    );
    const filename = resolution.filePath as string;
    const cached = modules.get(filename);
    if (cached) return cached.exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const compiled = transformSync(readFileSync(filename, "utf8"), {
      filename,
      babelrc: false,
      configFile: false,
      plugins: [
        metroRequire.resolve("@babel/plugin-transform-typescript"),
        metroRequire.resolve("@babel/plugin-transform-modules-commonjs"),
      ],
    });
    runInNewContext(compiled.code, {
      exports: module.exports,
      module,
      require: (dependency: string) => load(dependency, filename),
    });
    return module.exports;
  }
  return load("./default-bot-avatar", path.join(directory, "bot-avatar.ts")) as {
    DEFAULT_BOT_AVATAR_DATA_URI: string;
    DEFAULT_BOT_AVATAR_IMAGE_SOURCE: number | { uri: string };
  };
}

describe("default avatar platform exports", () => {
  it.each(["ios", "android", "web"])(
    "reads the avatar constant through Metro's %s resolution without recursive exports",
    (platform) => {
      const avatar = loadAvatarModule(platform);
      expect(avatar.DEFAULT_BOT_AVATAR_DATA_URI).toBe(DEFAULT_BOT_AVATAR_DATA_URI);
      expect(avatar.DEFAULT_BOT_AVATAR_DATA_URI).toMatch(/^data:image\/jpeg;base64,/);
      expect(avatar.DEFAULT_BOT_AVATAR_IMAGE_SOURCE).toEqual(
        platform === "web" ? { uri: DEFAULT_BOT_AVATAR_DATA_URI } : 42,
      );
    },
  );
});
