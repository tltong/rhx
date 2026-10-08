import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {runInNewContext} from "node:vm";

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.style = {};
    this.className = "";
    this.textContent = "";
    this.hidden = false;
  }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  addEventListener() {}
}

const flatten = (element) => [element, ...element.children.flatMap(flatten)];
const script = await readFile(new URL("./landing.js", import.meta.url), "utf8");
const functions = ["formatReadinessScore", "formatReliabilityScore", "createMetric", "createTopicRow", "createSyllabusPanel"].map((name) => {
  const match = script.match(new RegExp("function " + name + "\\([\\s\\S]*?\\n}"));
  assert.ok(match, name + " must exist");
  return match[0];
}).join("\n");
const fakeDocument = {createElement: (tagName) => new Element(tagName)};
const scope = {
  document: fakeDocument,
  readinessScoreFormatter: new Intl.NumberFormat("en", {maximumFractionDigits: 2}),
  getPreAssessmentPresentation: () => ({label: "Completed", className: "completed"}),
  createTopicProcessingIndicator: () => new Element("div"),
  createCompletedPracticeHistory: () => new Element("details"),
  handleTopicUnpause: async () => {},
  updateTopicPauseStatus: async () => {},
  topicKey: (syllabusId, topicId) => JSON.stringify([syllabusId, topicId]),
  topicPauseControlKey: (studentId, syllabusId, topicId) => JSON.stringify([studentId, syllabusId, topicId]),
  topicProcessingIndicators: new Map(),
  topicPauseControls: new Map(),
  activeProcessingTopicKey: ""
};
runInNewContext(functions, scope);

function renderReadiness(changes = {}) {
  const row = scope.createTopicRow({
    topicId: "topic-1", topicName: "Fractions", preAssessmentState: "completed",
    currentLevelName: "Developing", nextLevelName: "Secure", finalLevelName: "Ready",
    progressPercentage: 50, totalLevelCount: 4, completedPractices: [],
    ...changes
  }, "student-1", "math");
  const readinessMetric = row.children.find((element) => (
    element.children.some(({textContent}) => textContent === "Readiness score")
  ));
  assert.ok(readinessMetric, "Each topic row must include readiness");
  assert.equal(flatten(row).filter(({textContent}) => textContent === "Readiness score").length, 1);
  return readinessMetric.children.find(({className}) => className === "metric-value").textContent;
}

test("student topic rows show saved readiness rounded to at most two decimals", () => {
  for (const [readinessScore, expected] of [[80, "80"], [80.5, "80.5"], [80.125, "80.13"], [105.625, "105.63"], [175, "175"]]) {
    assert.equal(renderReadiness({readinessScore}), expected);
  }
});

test("zero readiness is a score and absent readiness has a distinct message", () => {
  assert.equal(renderReadiness({readinessScore: 0}), "0");
  for (const readinessScore of [null, undefined, NaN, Infinity, -1, "80"]) {
    assert.equal(renderReadiness({readinessScore}), "No score yet");
  }
});

test("read failures show Unavailable instead of implying that no readiness exists", () => {
  assert.equal(renderReadiness({readinessScore: null, readinessUnavailable: true}), "Unavailable");
});

function renderSubjectReadiness(changes = {}) {
  const panel = scope.createSyllabusPanel({
    syllabusId: "math", subject: "Mathematics", language: "English",
    topics: [{
      topicId: "topic-1", topicName: "Fractions", preAssessmentState: "completed",
      currentLevelName: "Developing", nextLevelName: "Secure", finalLevelName: "Ready",
      progressPercentage: 50, totalLevelCount: 4, completedPractices: [], readinessScore: 70
    }],
    ...changes
  }, "student-1");
  const heading = panel.children.find(({className}) => className === "syllabus-heading");
  const metric = flatten(heading).find(({className}) => className === "subject-readiness");
  assert.ok(metric, "Each syllabus heading must include subject readiness");
  assert.equal(flatten(heading).filter(({textContent}) => textContent === "Subject readiness score").length, 1);
  assert.ok(flatten(heading).some(({textContent}) => textContent === "Mathematics"));
  assert.ok(flatten(heading).some(({textContent}) => textContent === "English"));
  return {
    panel,
    value: metric.children.find(({className}) => className === "metric-value").textContent
  };
}

test("syllabus headings display saved subject readiness with the same formatting as topic scores", () => {
  for (const [readinessScore, expected] of [[0, "0"], [80, "80"], [80.5, "80.5"], [105.625, "105.63"], [175, "175"]]) {
    const {panel, value} = renderSubjectReadiness({readinessScore});
    assert.equal(value, expected);
    const topicRow = flatten(panel).find(({className}) => className === "topic-row");
    assert.ok(flatten(topicRow).some(({textContent}) => textContent === "70"));
  }
});

test("subject readiness distinguishes missing saved scores from unavailable reads", () => {
  assert.equal(renderSubjectReadiness({readinessScore: null}).value, "No score yet");
  assert.equal(renderSubjectReadiness({readinessScore: null, readinessUnavailable: true}).value, "Unavailable");
});

test("subject readiness remains visible for syllabuses without topics or a configured framework", () => {
  const {panel, value} = renderSubjectReadiness({readinessScore: 50, topics: [], error: "Assessment framework is not configured."});
  assert.equal(value, "50");
  assert.ok(flatten(panel).some(({textContent}) => textContent === "No topics are configured for this syllabus."));
  assert.ok(flatten(panel).some(({textContent}) => textContent === "Assessment framework is not configured."));
});

function renderReliability({topicScore, subjectScore, topicUnavailable = false, subjectUnavailable = false} = {}) {
  const panel = scope.createSyllabusPanel({
    syllabusId: "math", subject: "Mathematics", language: "English", readinessScore: 175,
    reliabilityScore: subjectScore, reliabilityUnavailable: subjectUnavailable,
    topics: [{
      topicId: "topic-1", topicName: "Fractions", preAssessmentState: "completed",
      currentLevelName: "Developing", nextLevelName: "Secure", finalLevelName: "Ready",
      progressPercentage: 50, totalLevelCount: 4, completedPractices: [], readinessScore: 70,
      reliabilityScore: topicScore, reliabilityUnavailable: topicUnavailable
    }]
  }, "student-1");
  const elements = flatten(panel);
  const metricValue = (label) => {
    const matches = elements.filter((element) => element.children.some(({textContent}) => textContent === label));
    assert.equal(matches.length, 1, label + " must appear exactly once");
    return matches[0].children.find(({className}) => className === "metric-value").textContent;
  };
  assert.equal(metricValue("Subject readiness score"), "175");
  assert.equal(metricValue("Readiness score"), "70");
  return {topic: metricValue("Reliability score"), subject: metricValue("Subject reliability score")};
}

test("topic and subject reliability display percentages, including zero and 100%, to at most two decimals", () => {
  for (const [score, expected] of [[0, "0%"], [10, "10%"], [17.5, "17.5%"], [33.333333, "33.33%"], [100, "100%"]]) {
    assert.deepEqual(renderReliability({topicScore: score, subjectScore: score}), {topic: expected, subject: expected});
  }
});

test("topic and subject reliability distinguish missing scores from failed reads without affecting readiness", () => {
  assert.deepEqual(renderReliability(), {topic: "No score yet", subject: "No score yet"});
  assert.deepEqual(renderReliability({topicUnavailable: true, subjectScore: 40}), {topic: "Unavailable", subject: "40%"});
  assert.deepEqual(renderReliability({topicScore: 60, subjectUnavailable: true}), {topic: "60%", subject: "Unavailable"});
});

test("invalid reliability values are not presented as valid percentages", () => {
  for (const score of [-1, 101, NaN, Infinity, "50"]) {
    assert.deepEqual(renderReliability({topicScore: score, subjectScore: score}), {topic: "No score yet", subject: "No score yet"});
  }
});
