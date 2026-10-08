import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const htmlUrl = new URL("./landing.html", import.meta.url);
const scriptUrl = new URL("./landing.js", import.meta.url);
const stylesheetUrl = new URL("./landing.css", import.meta.url);

test("student landing places Additional Mission below Daily Mission", async () => {
  const html = await readFile(htmlUrl, "utf8");
  const dailyMissionIndex = html.indexOf("student-daily-mission-section");
  const additionalMissionIndex = html.indexOf(
    "student-additional-mission-section"
  );
  const syllabusProgressIndex = html.indexOf("syllabus-progress-section");

  assert.ok(dailyMissionIndex >= 0);
  assert.ok(dailyMissionIndex < additionalMissionIndex);
  assert.ok(additionalMissionIndex < syllabusProgressIndex);
  assert.match(html, /firebase-functions-compat\.js/);
  assert.match(html, /landing\.css\?v=20261009-reliability-landing-v1/);
  assert.match(html, /landing\.js\?v=20261009-reliability-landing-v1/);
});

test("student landing wires the Additional Mission feature", async () => {
  const script = await readFile(scriptUrl, "utf8");

  assert.match(script, /AdditionalMissionSection/);
  assert.match(script, /listAdditionalMissionPracticeIds/);
  assert.match(script, /acceptAdditionalDailyMission/);
  assert.match(script, /getPracticeById/);
  assert.match(script, /student-additional-mission-root/);
  assert.match(
    script,
    /additional_mission_section\.js\?v=20261004-pausable-missions-v1/
  );
  assert.match(script, /onTopicPaused:\s*refreshTopicPauseStatus/);
});

test("student landing uses Daily Mission as its practice entry point", async () => {
  const script = await readFile(scriptUrl, "utf8");

  assert.match(script, /getNextCoreDailyMission/);
  assert.match(script, /acceptCoreDailyMission/);
  assert.match(script, /pauseCoreDailyMission/);
  assert.match(script, /daily_mission_module\.js\?v=20261004-pausable-missions-v1/);
  assert.match(
    script,
    /daily_mission_section\.js\?v=20261004-pausable-missions-v1/
  );
  assert.doesNotMatch(script, /createPracticeMetric/);
  assert.doesNotMatch(script, /Start practice/);
});

test("syllabus progress displays paused topics", async () => {
  const [script, stylesheet] = await Promise.all([
    readFile(scriptUrl, "utf8"),
    readFile(stylesheetUrl, "utf8")
  ]);

  assert.match(script, /isTopicPaused/);
  assert.match(script, /studentId,\s*syllabusId,\s*topicId/);
  assert.match(script, /pauseBadge\.textContent = "Paused"/);
  assert.match(script, /row\.classList\.toggle\("is-paused", paused\)/);
  assert.match(script, /pauseBadge\.hidden = !paused/);
  assert.match(stylesheet, /\.topic-row\.is-paused/);
  assert.match(stylesheet, /\.topic-pause-badge/);
});

test("paused syllabus topics can be unpaused through the web feature", async () => {
  const [script, stylesheet] = await Promise.all([
    readFile(scriptUrl, "utf8"),
    readFile(stylesheetUrl, "utf8")
  ]);

  assert.match(script, /unpauseTopic/);
  assert.match(script, /unpauseButton\.textContent = "Unpause"/);
  assert.match(script, /unpauseButton\.hidden = !paused/);
  assert.match(
    script,
    /await unpauseTopic\(\{studentId, syllabusId, topicId\}\)/
  );
  assert.match(script, /row\.classList\.remove\("is-paused"\)/);
  assert.match(script, /pauseBadge\.hidden = true/);
  assert.match(script, /unpauseButton\.hidden = true/);
  assert.match(stylesheet, /\.topic-unpause-button/);
  assert.match(stylesheet, /\.topic-unpause-button\[hidden\]/);
});

test("pausing a Daily Mission refreshes its syllabus topic status", async () => {
  const script = await readFile(scriptUrl, "utf8");

  assert.match(script, /onTopicPaused:\s*refreshTopicPauseStatus/);
  assert.match(script, /topicPauseControls\.get/);
  assert.match(script, /await updateTopicPauseStatus\(\{/);
  assert.match(script, /studentId,\s*syllabusId,\s*topicId,\s*\.\.\.controls/);
});

test("student landing presents pre-assessments as first assessments", async () => {
  const script = await readFile(scriptUrl, "utf8");

  assert.match(script, /return "First assessment"/);
  assert.match(script, /assessmentLabel\.textContent = "First assessment"/);
  assert.doesNotMatch(script, /"Pre-assessment"/);
});

test("student landing refreshes after backend practice processing", async () => {
  const [html, script, stylesheet] = await Promise.all([
    readFile(htmlUrl, "utf8"),
    readFile(scriptUrl, "utf8"),
    readFile(stylesheetUrl, "utf8")
  ]);

  assert.match(script, /watchPracticeCompletionProcessing/);
  assert.match(script, /CompletionProcessingRefreshController/);
  assert.match(script, /completedPracticeIdFromUrl/);
  assert.match(script, /loadAndRenderDashboard/);
  assert.match(script, /clearCompletedPracticeContext/);
  assert.match(script, /completionProcessingRefreshController\.start/);
  assert.match(script, /setTopicProcessingActive/);
  assert.match(script, /createTopicProcessingIndicator/);
  assert.match(script, /getPracticeById\(completedPracticeId\)/);
  assert.match(script, /syllabusId: completedTopic\.syllabusId/);
  assert.match(script, /topicId: completedTopic\.topicId/);
  assert.doesNotMatch(html, /id="syllabus-progress-processing"/);
  assert.match(stylesheet, /\.topic-processing/);
  assert.match(stylesheet, /@keyframes topic-processing/);
  assert.match(stylesheet, /prefers-reduced-motion: reduce/);
});
