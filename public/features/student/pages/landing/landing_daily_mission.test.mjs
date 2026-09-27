import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const htmlUrl = new URL("./landing.html", import.meta.url);
const scriptUrl = new URL("./landing.js", import.meta.url);

test("student landing places Daily Mission before syllabus progress", async () => {
  const html = await readFile(htmlUrl, "utf8");
  const dailyMissionIndex = html.indexOf("student-daily-mission-section");
  const syllabusProgressIndex = html.indexOf("syllabus-progress-section");

  assert.ok(dailyMissionIndex >= 0);
  assert.ok(dailyMissionIndex < syllabusProgressIndex);
  assert.match(html, /firebase-functions-compat\.js/);
});

test("student landing uses Daily Mission as its practice entry point", async () => {
  const script = await readFile(scriptUrl, "utf8");

  assert.match(script, /getNextCoreDailyMission/);
  assert.match(script, /acceptCoreDailyMission/);
  assert.match(script, /pauseCoreDailyMission/);
  assert.doesNotMatch(script, /createPracticeMetric/);
  assert.doesNotMatch(script, /Start practice/);
});
