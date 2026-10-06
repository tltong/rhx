import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const scriptUrl = new URL("./commence_practice.js", import.meta.url);
const htmlUrl = new URL("./commence_practice.html", import.meta.url);

test("completed practice redirects with its processing context", async () => {
  const [script, html] = await Promise.all([
    readFile(scriptUrl, "utf8"),
    readFile(htmlUrl, "utf8")
  ]);

  assert.match(script, /completedPracticeId=/);
  assert.match(script, /createStudentLandingUrl\(result\.practiceId\)/);
  assert.match(
    html,
    /commence_practice\.js\?v=20261003-completion-processing-v1/
  );
});
