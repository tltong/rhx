const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ServerMermaidRenderer,
} = require("./server_mermaid_renderer");

test("server renderer rejects Mermaid click actions before browser launch", async () => {
  const renderer = new ServerMermaidRenderer();

  await assert.rejects(
    renderer.render("flowchart TD\nA --> B\nclick A https://example.com"),
    /click actions are not allowed/i,
  );
});
