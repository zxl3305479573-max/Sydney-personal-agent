const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod } = require("expo/config-plugins");

const MODULE_NAME = "sydney-companion";

function withSydneyCompanionAutolinking(config) {
  return withDangerousMod(config, [
    "ios",
    async (mod) => {
      const podfile = path.join(mod.modRequest.platformProjectRoot, "Podfile");
      const source = fs.readFileSync(podfile, "utf8");
      const marker = "use_expo_modules!";
      const excluded = `${marker}(exclude: ["${MODULE_NAME}"])`;
      if (process.env.SYDNEY_COMPANION_EXPERIMENT === "1") {
        if (source.includes(excluded))
          fs.writeFileSync(podfile, source.replace(excluded, marker), "utf8");
        return mod;
      }
      if (source.includes(excluded)) return mod;
      const bareCall = /^([ \t]*)use_expo_modules![ \t]*$/gm;
      if ((source.match(new RegExp(marker, "g")) ?? []).length !== 1 || !bareCall.test(source)) {
        throw new Error(
          "Expected exactly one bare use_expo_modules! call in the generated Podfile.",
        );
      }
      fs.writeFileSync(podfile, source.replace(bareCall, `$1${excluded}`), "utf8");
      return mod;
    },
  ]);
}

module.exports = withSydneyCompanionAutolinking;
