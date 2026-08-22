const assert = require("node:assert/strict");
const test = require("node:test");

const {
  normalizeMermaidSource,
} = require("./normalize_mermaid_source");

test("quotes multilingual xychart text labels", () => {
  const source = [
    "xychart-beta",
    "  title \u6c34\u679c\u6570\u91cf",
    "  x-axis [\u82f9\u679c, \u9999\u8549, \u6a59\u5b50]",
    "  y-axis \u6570\u91cf 0 --> 10",
    "  bar [5, 7, 3]",
  ].join("\n");

  assert.equal(
    normalizeMermaidSource(source),
    [
      "xychart-beta",
      '  title "\u6c34\u679c\u6570\u91cf"',
      '  x-axis ["\u82f9\u679c", "\u9999\u8549", "\u6a59\u5b50"]',
      '  y-axis "\u6570\u91cf" 0 --> 10',
      "  bar [5, 7, 3]",
    ].join("\n"),
  );
});

test("preserves numeric and already quoted xychart categories", () => {
  const source = [
    "xychart-beta",
    '  x-axis [1, "Year 2", 3]',
    "  y-axis 0 --> 10",
  ].join("\n");

  assert.equal(normalizeMermaidSource(source), source);
});

test("does not alter other Mermaid diagram types", () => {
  const source = "flowchart TD\n  A[Start] --> B[End]";

  assert.equal(normalizeMermaidSource(source), source);
});
