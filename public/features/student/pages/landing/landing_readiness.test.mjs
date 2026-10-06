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
const functions = ["formatReadinessScore", "createMetric", "createTopicRow"].map((name) => {
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

