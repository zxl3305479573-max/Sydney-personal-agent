const { createHash } = require("node:crypto");
const path = require("node:path");

const SHORTENED_LOCATION = /^\/assets\/sydney\/[0-9a-f]{24}$/;

function normalizeHttpServerLocation(location) {
  return String(location ?? "").replace(
    /^\/assets\/?\?(?:export_path=\/assets|unstable_path=\.)(?=\/|$)/,
    "/assets",
  );
}

module.exports = (asset) => {
  if (SHORTENED_LOCATION.test(asset.httpServerLocation)) {
    return asset;
  }
  const sourceKey =
    typeof asset.fileSystemLocation === "string" && asset.fileSystemLocation.length > 0
      ? path.relative(__dirname, asset.fileSystemLocation).replace(/\\/g, "/")
      : normalizeHttpServerLocation(asset.httpServerLocation);
  const directory = createHash("sha256").update(sourceKey).digest("hex").slice(0, 24);
  return { ...asset, httpServerLocation: `/assets/sydney/${directory}` };
};
