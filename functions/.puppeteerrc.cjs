const path = require("node:path");

module.exports = {
  cacheDirectory: path.join(__dirname, "node_modules", ".puppeteer_cache"),
  chrome: {
    skipDownload: false,
  },
  "chrome-headless-shell": {
    skipDownload: true,
  },
};
