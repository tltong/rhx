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
    if (this.disabled) {
      return undefined;
    }

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
    isTopicPausable: async () => true,
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
  await section.ready;
  await findByText(container, "Daily Mission").click();
  assert.equal(section.workspace.hidden, false);
  await findByText(container, "Mathematics - English").click();
  assert.deepEqual(calls, [
    ["get", {studentId: "student-1", syllabusId: "syllabus-1"}]
  ]);
  assert.ok(findByText(container, "Get next mission?"));
  await findByText(container, "Get Next Mission").click();
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
    isTopicPausable: async () => true,
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
    async onTopicPaused(input) {
      calls.push(["refresh", input]);
    },
    navigate() {},
    documentRef: fakeDocument
  });

  section.mount(container);
  await section.ready;
  await findByText(container, "Daily Mission").click();
  await findByText(container, "Mathematics - English").click();
  await findByText(container, "Get Next Mission").click();
  await findByText(container, "Not learned yet").click();

  assert.deepEqual(calls, [
    "get",
    ["pause", {studentId: "student-1", practiceId: "practice-1"}],
    ["refresh", {
      studentId: "student-1",
      syllabusId: "syllabus-1",
      topicId: "topic-1"
    }],
    "get"
  ]);
  assert.ok(findByText(container, "Geometry"));
});

test("an accepted completed mission is shown as exhausted before opening", async () => {
  const container = new FakeElement("div");
  const section = new DailyMissionSection({
    isTopicPausable: async () => true,
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
  await section.ready;

  assert.equal(section.workspace.hidden, true);
  assert.equal(section.availabilitySummary.hidden, false);
  assert.equal(
    section.availabilitySummary.textContent,
    "No more daily missions available today."
  );
  assert.equal(
    findByText(container, "Mathematics - English — No more missions today").disabled,
    true
  );
  await findByText(container, "Daily Mission").click();

  assert.equal(findByText(container, "Get Next Mission"), undefined);
  assert.equal(findByText(container, "Start Mission"), undefined);
});

function createSection(syllabuses, getNextCoreDailyMission, overrides = {}) {
  return new DailyMissionSection({
    isTopicPausable: async () => true,
    studentId: "student-1",
    syllabuses,
    getNextCoreDailyMission,
    async acceptCoreDailyMission() {},
    async pauseCoreDailyMission() {},
    navigate() {},
    documentRef: fakeDocument,
    ...overrides
  });
}

test("late startup availability cannot overwrite an unpause refresh", async () => {
  let calls = 0;
  let resolveStartup;
  const container = new FakeElement("div");
  const section = createSection([syllabus()], async () => (
    ++calls === 1
      ? new Promise((resolve) => { resolveStartup = resolve; })
      : {topicId: "topic-1", practiceId: "practice-1", isAccepted: false}
  ));

  section.mount(container);
  await section.refreshAvailability();
  resolveStartup(null);
  await section.ready;

  assert.equal(section.subjectButtons[0].button.disabled, false);
  assert.equal(section.availabilitySummary.hidden, true);
});

test("no core suggestion is indicated on the landing page without a click", async () => {
  const container = new FakeElement("div");
  const section = createSection([syllabus()], async () => null);

  section.mount(container);
  await section.ready;

  assert.equal(section.workspace.hidden, true);
  assert.equal(section.availabilitySummary.hidden, false);
  assert.equal(section.subjectButtons[0].button.disabled, true);
  assert.equal(findByText(container, "Get Next Mission"), undefined);
});

test("exhausted subjects do not prevent another subject's mission", async () => {
  const container = new FakeElement("div");
  const science = {...syllabus(), syllabusId: "science", subject: "Science"};
  const section = createSection([syllabus(), science], async ({syllabusId}) => (
    syllabusId === "science"
      ? {syllabusId, topicId: "topic-1", practiceId: "science-practice", isAccepted: false}
      : null
  ));

  section.mount(container);
  await section.ready;

  assert.equal(section.availabilitySummary.hidden, true);
  assert.equal(section.subjectButtons[0].button.disabled, true);
  assert.equal(section.subjectButtons[1].button.disabled, false);
  await findByText(container, "Daily Mission").click();
  await findByText(container, "Science - English").click();
  assert.ok(findByText(container, "Get Next Mission"));
});

test("a failed availability check can retry without claiming exhaustion", async () => {
  let calls = 0;
  const container = new FakeElement("div");
  const section = createSection([syllabus()], async () => {
    if (++calls === 1) {
      throw new Error("offline");
    }
    return {topicId: "topic-1", practiceId: "practice-1", isAccepted: false};
  });

  section.mount(container);
  await section.ready;

  assert.equal(section.availabilitySummary.className, "daily-mission-status is-error");
  assert.equal(section.subjectButtons[0].button.disabled, false);
  await findByText(container, "Daily Mission").click();
  await findByText(container, "Mathematics - English").click();
  await findByText(container, "Get Next Mission").click();
  assert.ok(findByText(container, "Accept Mission"));
  assert.equal(section.availabilitySummary.hidden, true);
});

test("pausing the last mission shows exhaustion and unpausing refreshes availability", async () => {
  let paused = false;
  const container = new FakeElement("div");
  const section = createSection([syllabus()], async () => (
    paused ? null : {topicId: "topic-1", practiceId: "practice-1", isAccepted: false}
  ), {
    async pauseCoreDailyMission() {
      paused = true;
    }
  });

  section.mount(container);
  await section.ready;
  await findByText(container, "Daily Mission").click();
  await findByText(container, "Mathematics - English").click();
  await findByText(container, "Get Next Mission").click();
  await findByText(container, "Not learned yet").click();

  assert.equal(section.availabilitySummary.hidden, false);
  assert.equal(section.subjectButtons[0].button.disabled, true);
  assert.equal(findByText(container, "Get Next Mission"), undefined);
  paused = false;
  await section.refreshAvailability();
  assert.equal(section.subjectButtons[0].button.disabled, false);
  assert.equal(section.availabilitySummary.hidden, true);
  assert.ok(findByText(container, "Get Next Mission"));
});

test("a non-pausable daily topic hides pause controls and can still be accepted", async () => {
  const calls = [];
  let accepted = false;
  const container = new FakeElement("div");
  const section = createSection([syllabus()], async () => ({
    topicId: "topic-1", practiceId: "practice-1", isAccepted: false
  }), {
    async isTopicPausable(syllabusId, topicId) {
      calls.push({syllabusId, topicId});
      return false;
    },
    async acceptCoreDailyMission({practiceId}) {
      accepted = true;
      return {practiceId};
    }
  });

  section.mount(container);
  await section.ready;
  await section.loadMission("syllabus-1");

  assert.deepEqual(calls, [{syllabusId: "syllabus-1", topicId: "topic-1"}]);
  assert.equal(findByText(container, "Not learned yet"), undefined);
  assert.equal(flatten(container).some((element) => (
    element.className === "daily-mission-pause-explanation"
  )), false);
  await findByText(container, "Accept Mission").click();
  assert.equal(accepted, true);
});

test("daily pause eligibility failures offer no pause and can be retried", async () => {
  let fail = true;
  const container = new FakeElement("div");
  const section = createSection([syllabus()], async () => ({
    topicId: "topic-1", practiceId: "practice-1", isAccepted: false
  }), {
    async isTopicPausable() {
      if (fail) {
        throw new Error("Could not check topic eligibility.");
      }
      return true;
    }
  });

  section.mount(container);
  await section.ready;
  await section.loadMission("syllabus-1");
  assert.equal(findByText(container, "Not learned yet"), undefined);
  assert.equal(section.status.className, "daily-mission-status is-error");
  fail = false;
  await section.loadMission("syllabus-1");
  assert.ok(findByText(container, "Not learned yet"));
  assert.ok(flatten(container).some((element) => (
    element.className === "daily-mission-pause-explanation"
  )));
});

test("a late daily pause eligibility check cannot restore an old mission", async () => {
  let topicId = "topic-1";
  let resolveEligibility;
  const container = new FakeElement("div");
  const section = createSection([syllabus()], async () => ({
    topicId, practiceId: `practice-${topicId}`, isAccepted: false
  }), {
    isTopicPausable(syllabusId, selectedTopicId) {
      return selectedTopicId === "topic-1"
        ? new Promise((resolve) => { resolveEligibility = resolve; })
        : Promise.resolve(false);
    }
  });

  section.mount(container);
  await section.ready;
  const pending = section.loadMission("syllabus-1");
  assert.equal(findByText(container, "Not learned yet"), undefined);
  topicId = "topic-2";
  await section.refreshAvailability();
  await section.loadMission("syllabus-1");
  resolveEligibility(true);
  await pending;

  assert.equal(section.currentMission.topicId, "topic-2");
  assert.ok(findByText(container, "Geometry"));
  assert.equal(findByText(container, "Not learned yet"), undefined);
});

test("accepted daily missions resume without a pause eligibility lookup", async () => {
  const container = new FakeElement("div");
  const section = createSection([syllabus()], async () => ({
    topicId: "topic-1", practiceId: "practice-1", isAccepted: true
  }), {
    async isTopicPausable() {
      throw new Error("Accepted daily missions must not offer a pause.");
    }
  });

  section.mount(container);
  await section.ready;
  await section.loadMission("syllabus-1");
  assert.ok(findByText(container, "Start Mission"));
  assert.equal(findByText(container, "Not learned yet"), undefined);
});

test("an essay mission preserves its type through acceptance and navigates to essay submission", async () => {
  const mission = {studentId: "student-1", syllabusId: "syllabus-1", topicId: "topic-1", practiceId: "essay-attempt", practiceType: "essay", date: "2026-10-18", isAccepted: false};
  const navigations = [], accepts = [], container = new FakeElement("div");
  const section = new DailyMissionSection({studentId: "student-1", syllabuses: [syllabus()],
    getNextCoreDailyMission: async () => mission,
    acceptCoreDailyMission: async input => {accepts.push(input); return {...mission, isAccepted: true};},
    pauseCoreDailyMission: async () => {}, isTopicPausable: async () => false,
    navigate: url => navigations.push(url), documentRef: fakeDocument});
  section.mount(container); await section.ready;
  await section.loadMission("syllabus-1");
  assert.ok(findByText(container, "Fractions — Essay assessment"));
  assert.equal(findByText(container, "Not learned yet"), undefined);
  await findByText(container, "Accept Mission").click();
  assert.deepEqual(accepts, [{studentId: "student-1", practiceId: "essay-attempt", practiceType: "essay"}]);
  assert.equal(navigations[0], "/features/essay_practice_session/pages/essay_practice/essay_practice.html?essayPracticeId=essay-attempt");
});
test("a submitted essay counts as a completed accepted mission before grading finishes", async () => {
  const subject = syllabus(); subject.topics[0].completedPractices.push({practiceId: "essay-attempt", practiceType: "essay", score: null});
  const container = new FakeElement("div");
  const section = new DailyMissionSection({studentId: "student-1", syllabuses: [subject],
    getNextCoreDailyMission: async () => ({practiceId: "essay-attempt", practiceType: "essay", topicId: "topic-1", isAccepted: true}),
    acceptCoreDailyMission: async () => assert.fail("Already accepted"), pauseCoreDailyMission: async () => {},
    isTopicPausable: async () => true, documentRef: fakeDocument});
  section.mount(container); await section.ready;
  assert.equal(section.availabilityBySyllabusId.get("syllabus-1").hasMission, false);
});
