const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod } = require("expo/config-plugins");

const MODULE_NAME = "sydney-companion";

function withSydneyCompanionAutolinking(config) {
  return withDangerousMod(config, ["ios", async (mod) => {
    if (process.env.SYDNEY_COMPANION_EXPERIMENT === "1") return mod;

    const podfile = path.join(mod.modRequest.platformProjectRoot, "Podfile");
    const source = fs.readFileSync(podfile, "utf8");
    const marker = "use_expo_modules!";
    if (source.includes('use_expo_modules!(exclude: ["sydney-companion"])')) return mod;
    if ((source.match(new RegExp(marker, "g")) ?? []).length !== 1) {
      throw new Error("Expected exactly one use_expo_modules! call in the generated Podfile.");
    }
    fs.writeFileSync(
      podfile,
      source.replace(marker, `${marker}(exclude: ["${MODULE_NAME}"])`),
      "utf8",
    );
    return mod;
  }]);
}

module.exports = withSydneyCompanionAutolinking;
