import assert from "node:assert/strict";
import test from "node:test";

import {
  DailyMissionSection
} from "./daily_mission_section.js";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.className = "";
    this.disabled = false;
    this.hidden = false;
    this.href = "";
    this.listeners = new Map();
    this.textContent = "";
    this.type = "";
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

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  async click() {
    return this.listeners.get("click")?.();
  }
}

const fakeDocument = {
  createElement(tagName) {
    return new FakeElement(tagName);
  }
};

function flatten(element) {
  return [element, ...element.children.flatMap(flatten)];
}

function findByText(element, text) {
  return flatten(element).find((candidate) => candidate.textContent === text);
}

function syllabus(completedPracticeIds = []) {
  return {
    syllabusId: "syllabus-1",
    subject: "Mathematics",
    language: "English",
    topics: [{
      topicId: "topic-1",
      topicName: "Fractions",
      completedPractices: completedPracticeIds.map((practiceId) => ({
        practiceId
      }))
    }, {
      topicId: "topic-2",
      topicName: "Geometry",
      completedPractices: []
    }]
  };
}

test("accepting a suggested mission starts its existing practice flow", async () => {
  const calls = [];
  const navigations = [];
  const container = new FakeElement("div");
  const section = new DailyMissionSection({
    studentId: "student-1",
    syllabuses: [syllabus()],
    async getNextCoreDailyMission(input) {
      calls.push(["get", input]);
      return {
        ...input,
        topicId: "topic-1",
        practiceId: "practice-1",
        date: "2026-09-27",
        isAccepted: false
      };
    },
    async acceptCoreDailyMission(input) {
      calls.push(["accept", input]);
      return {
        ...input,
        syllabusId: "syllabus-1",
        topicId: "topic-1",
        date: "2026-09-27",
        isAccepted: true,
        created: true
      };
    },
    async pauseCoreDailyMission() {
      throw new Error("must not be called");
    },
    navigate(url) {
      navigations.push(url);
    },
    documentRef: fakeDocument
  });

  section.mount(container);
  await findByText(container, "Daily Mission").click();
  assert.equal(section.workspace.hidden, false);
  await findByText(container, "Mathematics · English").click();
  assert.ok(findByText(container, "Fractions"));
  await findByText(container, "Accept Mission").click();

  assert.deepEqual(calls, [
    ["get", {studentId: "student-1", syllabusId: "syllabus-1"}],
    ["accept", {studentId: "student-1", practiceId: "practice-1"}]
  ]);
  assert.deepEqual(navigations, [
    "/features/practice_session/pages/commence_practice/"
      + "commence_practice.html?practiceId=practice-1"
  ]);
});

test("not learned pauses the topic and loads a replacement mission", async () => {
  const calls = [];
  const missions = [
    {
      studentId: "student-1",
      syllabusId: "syllabus-1",
      topicId: "topic-1",
      practiceId: "practice-1",
      date: "2026-09-27",
      isAccepted: false
    },
    {
      studentId: "student-1",
      syllabusId: "syllabus-1",
      topicId: "topic-2",
      practiceId: "practice-2",
      date: "2026-09-27",
      isAccepted: false
    }
  ];
  const container = new FakeElement("div");
  const section = new DailyMissionSection({
    studentId: "student-1",
    syllabuses: [syllabus()],
    async getNextCoreDailyMission() {
      calls.push("get");
      return missions.shift();
    },
    async acceptCoreDailyMission() {
      throw new Error("must not be called");
    },
    async pauseCoreDailyMission(input) {
      calls.push(["pause", input]);
      return {isPaused: true};
    },
    navigate() {},
    documentRef: fakeDocument
  });

  section.mount(container);
  await findByText(container, "Daily Mission").click();
  await findByText(container, "Mathematics · English").click();
  await findByText(container, "Not learned yet").click();

  assert.deepEqual(calls, [
    "get",
    ["pause", {studentId: "student-1", practiceId: "practice-1"}],
    "get"
  ]);
  assert.ok(findByText(container, "Geometry"));
});

test("an accepted completed mission cannot be started again", async () => {
  const container = new FakeElement("div");
  const section = new DailyMissionSection({
    studentId: "student-1",
    syllabuses: [syllabus(["practice-1"])],
    async getNextCoreDailyMission(input) {
      return {
        ...input,
        topicId: "topic-1",
        practiceId: "practice-1",
        date: "2026-09-27",
        isAccepted: true
      };
    },
    async acceptCoreDailyMission() {},
    async pauseCoreDailyMission() {},
    navigate() {},
    documentRef: fakeDocument
  });

  section.mount(container);
  await findByText(container, "Daily Mission").click();
  await findByText(container, "Mathematics · English").click();

  assert.ok(findByText(container, "Today's mission is complete."));
  assert.equal(findByText(container, "Start Mission"), undefined);
});
