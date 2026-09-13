import assert from "node:assert/strict";
import test from "node:test";

import {
  createSyllabusProgressPane,
  renderSyllabusProgressPane
} from "./syllabus_progress_pane.js";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.className = "";
    this.href = "";
    this.style = {};
    this.textContent = "";
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = children;
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
}

const fakeDocument = {
  createElement(tagName) {
    return new FakeElement(tagName);
  }
};

function flattenElements(element) {
  return [element, ...element.children.flatMap(flattenElements)];
}

function collectText(element) {
  return flattenElements(element)
    .map((item) => item.textContent)
    .filter(Boolean)
    .join(" ");
}

const syllabuses = [{
  syllabusId: "syllabus-1",
  subject: "Mathematics",
  language: "English",
  topics: [{
    topicId: "topic-1",
    topicName: "Fractions",
    preAssessmentState: "completed",
    currentLevelName: "Developing",
    nextLevelName: "Secure",
    finalLevelName: "Ready",
    totalLevelCount: 4,
    progressPercentage: 50,
    nextAssignedPractice: {
      practiceId: "assigned-practice"
    },
    completedPractices: [{
      practiceId: "completed-practice",
      dateCompleted: new Date("2026-09-01T00:00:00.000Z"),
      practiceType: "assessment",
      difficulty: "medium",
      score: 85
    }]
  }]
}];

test("progress pane renders syllabus progress without a next-practice control", () => {
  const pane = createSyllabusProgressPane({
    studentId: "student-1",
    syllabuses,
    documentRef: fakeDocument
  });
  const text = collectText(pane);
  const elements = flattenElements(pane);
  const resultLink = elements.find((element) =>
    element.className === "student-dashboard-history-result-link"
  );

  assert.match(text, /Mathematics/);
  assert.match(text, /Fractions/);
  assert.match(text, /Developing/);
  assert.match(text, /Secure/);
  assert.match(text, /50%/);
  assert.match(text, /Past completed practices \(1\)/);
  assert.doesNotMatch(text, /Next practice/i);
  assert.doesNotMatch(text, /Start practice/i);
  assert.equal(elements.some((element) => element.tagName === "button"), false);
  assert.match(resultLink.href, /studentId=student-1/);
  assert.match(resultLink.href, /practiceId=completed-practice/);
});

test("render API replaces the supplied container contents", () => {
  const container = new FakeElement("div");
  container.append(new FakeElement("p"));

  const pane = renderSyllabusProgressPane({
    container,
    studentId: "student-1",
    syllabuses: [],
    documentRef: fakeDocument
  });

  assert.deepEqual(container.children, [pane]);
  assert.match(collectText(pane), /No active syllabus subscriptions/);
});
