const { createHash } = require("node:crypto");

module.exports = (asset) => {
  const directory = createHash("sha256")
    .update(asset.httpServerLocation)
    .digest("hex")
    .slice(0, 24);
  return { ...asset, httpServerLocation: `/assets/sydney/${directory}` };
};
