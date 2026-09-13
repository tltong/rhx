const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(__dirname, ".codex_patch_product_data.js");
const source = fs.readFileSync(filePath, "utf8");
const before = "if (occurrences !== 1)";

if (source.split(before).length - 1 !== 1) {
  throw new Error("Could not locate the helper occurrence check.");
}

fs.writeFileSync(filePath, source.replace(before, "if (occurrences < 1)"));
