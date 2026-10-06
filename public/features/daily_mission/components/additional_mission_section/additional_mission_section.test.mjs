import assert from "node:assert/strict";
import test from "node:test";

import {
  AdditionalMissionSection
} from "./additional_mission_section.js";

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
    this.title = "";
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
      topicId: "topic-core",
      topicName: "Fractions",
      completedPractices: completedPracticeIds.map((practiceId) => ({
        practiceId
      }))
    }, {
      topicId: "topic-additional",
      topicName: "Geometry",
      completedPractices: []
    }, {
      topicId: "topic-another",
      topicName: "Algebra",
      completedPractices: []
    }]
  };
}

function coreMission(isAccepted = true) {
  return {
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-core",
    practiceId: "core-practice",
    date: "2026-10-01",
    isAccepted
  };
}

test("additional subject stays locked until its core mission is complete", async () => {
  let listCalls = 0;
  const container = new FakeElement("div");
  const section = new AdditionalMissionSection({
    isTopicPausable: async () => true,
    studentId: "student-1",
    syllabuses: [syllabus()],
    async getNextCoreDailyMission() {
      return coreMission();
    },
    async listAdditionalMissionPracticeIds() {
      listCalls += 1;
      return [];
    },
    async acceptAdditionalDailyMission() {},
    async pauseCoreDailyMission() {},
    async getPracticeById() {},
    navigate() {},
    documentRef: fakeDocument
  });

  section.mount(container);
  await section.ready;
  await findByText(container, "Additional Mission").click();

  const subjectButton = findByText(container, "Mathematics - English");

  assert.equal(subjectButton.disabled, true);
  assert.equal(
    subjectButton.title,
    "Complete today's Daily Mission for this subject first"
  );
  await subjectButton.click();
  assert.equal(listCalls, 0);
  assert.ok(findByText(
    container,
    "Complete a Daily Mission to unlock additional practice."
  ));
});

test("an unaccepted core suggestion does not unlock additional missions", async () => {
  const container = new FakeElement("div");
  const section = new AdditionalMissionSection({
    isTopicPausable: async () => true,
    studentId: "student-1",
    syllabuses: [syllabus(["core-practice"])],
    async getNextCoreDailyMission() {
      return coreMission(false);
    },
    async listAdditionalMissionPracticeIds() {
      throw new Error("must not be called");
    },
    async acceptAdditionalDailyMission() {},
    async pauseCoreDailyMission() {},
    async getPracticeById() {},
    navigate() {},
    documentRef: fakeDocument
  });

  section.mount(container);
  await section.ready;
  await findByText(container, "Additional Mission").click();

  assert.equal(
    findByText(container, "Mathematics - English").disabled,
    true
  );
});

test("a completed core mission unlocks and starts an additional mission", async () => {
  const calls = [];
  const navigations = [];
  const container = new FakeElement("div");
  const section = new AdditionalMissionSection({
    isTopicPausable: async () => true,
    studentId: "student-1",
    syllabuses: [syllabus(["core-practice"])],
    async getNextCoreDailyMission(input) {
      calls.push(["core", input]);
      return coreMission();
    },
    async listAdditionalMissionPracticeIds(input) {
      calls.push(["list", input]);
      return ["additional-practice"];
    },
    async getPracticeById(practiceId) {
      calls.push(["practice", practiceId]);
      return {
        id: practiceId,
        questions: [{
          syllabusId: "syllabus-1",
          topicId: "topic-additional",
          questionId: "question-1"
        }]
      };
    },
    async acceptAdditionalDailyMission(input) {
      calls.push(["accept", input]);
      return {
        ...input,
        syllabusId: "syllabus-1",
        topicId: "topic-additional",
        date: "2026-10-01",
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
  await findByText(container, "Additional Mission").click();

  const subjectButton = findByText(container, "Mathematics - English");

  assert.equal(subjectButton.disabled, false);
  await subjectButton.click();
  assert.ok(findByText(container, "Get next additional mission?"));
  assert.deepEqual(calls, [
    ["core", {studentId: "student-1", syllabusId: "syllabus-1"}],
    ["list", {studentId: "student-1", syllabusId: "syllabus-1"}],
    ["practice", "additional-practice"]
  ]);
  await findByText(container, "Get Next Mission").click();
  assert.ok(findByText(container, "Geometry"));
  await findByText(container, "Start Mission").click();

  assert.deepEqual(calls, [
    ["core", {studentId: "student-1", syllabusId: "syllabus-1"}],
    ["list", {studentId: "student-1", syllabusId: "syllabus-1"}],
    ["practice", "additional-practice"],
    ["accept", {
      studentId: "student-1",
      practiceId: "additional-practice"
    }]
  ]);
  assert.deepEqual(navigations, [
    "/features/practice_session/pages/commence_practice/"
      + "commence_practice.html?practiceId=additional-practice"
  ]);
});

test("pausing an additional topic loads the next mission", async () => {
  const calls = [];
  const lists = [["additional-practice"], ["another-practice"]];
  const topics = new Map([
    ["additional-practice", "topic-additional"],
    ["another-practice", "topic-another"]
  ]);
  const container = new FakeElement("div");
  const section = new AdditionalMissionSection({
    isTopicPausable: async () => true,
    studentId: "student-1",
    syllabuses: [syllabus(["core-practice"])],
    async getNextCoreDailyMission() {
      calls.push("core");
      return coreMission();
    },
    async listAdditionalMissionPracticeIds() {
      calls.push("list");
      return lists.shift() || [];
    },
    async getPracticeById(practiceId) {
      calls.push(["practice", practiceId]);
      return {
        id: practiceId,
        questions: [{
          syllabusId: "syllabus-1",
          topicId: topics.get(practiceId),
          questionId: `question-${practiceId}`
        }]
      };
    },
    async acceptAdditionalDailyMission() {
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
  await findByText(container, "Additional Mission").click();
  await findByText(container, "Mathematics - English").click();
  await findByText(container, "Get Next Mission").click();
  assert.ok(findByText(container, "Geometry"));
  await findByText(container, "Not learned yet").click();

  assert.deepEqual(calls, [
    "core",
    "list",
    ["practice", "additional-practice"],
    ["pause", {
      studentId: "student-1",
      practiceId: "additional-practice"
    }],
    ["refresh", {
      studentId: "student-1",
      syllabusId: "syllabus-1",
      topicId: "topic-additional"
    }],
    "list",
    ["practice", "another-practice"]
  ]);
  assert.ok(findByText(container, "Algebra"));
});

function createSection(overrides = {}) {
  return new AdditionalMissionSection({
    isTopicPausable: async () => true,
    studentId: "student-1",
    syllabuses: [syllabus(["core-practice"])],
    async getNextCoreDailyMission() {
      return coreMission();
    },
    async listAdditionalMissionPracticeIds() {
      return [];
    },
    async getPracticeById() {
      return null;
    },
    async acceptAdditionalDailyMission() {},
    async pauseCoreDailyMission() {},
    navigate() {},
    documentRef: fakeDocument,
    ...overrides
  });
}

test("no additional missions are indicated before opening or requesting one", async () => {
  const container = new FakeElement("div");
  const section = createSection();

  section.mount(container);
  await section.ready;

  assert.equal(section.workspace.hidden, true);
  assert.equal(section.availabilitySummary.hidden, false);
  assert.equal(section.availabilitySummary.textContent, "No more additional missions available today.");
  assert.equal(
    findByText(container, "Mathematics - English — No more missions today").disabled,
    true
  );
  assert.equal(findByText(container, "Get Next Mission"), undefined);
});

test("a subject without a core mission has no additional mission to unlock", async () => {
  const container = new FakeElement("div");
  const section = createSection({
    async getNextCoreDailyMission() {
      return null;
    },
    async listAdditionalMissionPracticeIds() {
      throw new Error("must not be called");
    }
  });

  section.mount(container);
  await section.ready;

  assert.equal(section.availabilitySummary.textContent, "No more additional missions available today.");
  assert.equal(section.availabilitySummary.hidden, false);
  assert.equal(section.subjectButtons[0].button.disabled, true);
});

test("invalid practice references do not offer an additional mission", async () => {
  const container = new FakeElement("div");
  const section = createSection({
    async listAdditionalMissionPracticeIds() {
      return ["missing-practice", "other-syllabus-practice"];
    },
    async getPracticeById(practiceId) {
      return practiceId === "missing-practice"
        ? null
        : {questions: [{syllabusId: "another-syllabus", topicId: "topic-1"}]};
    }
  });

  section.mount(container);
  await section.ready;

  assert.equal(section.availabilitySummary.textContent, "No more additional missions available today.");
  assert.equal(section.subjectButtons[0].button.disabled, true);
});

test("an exhausted additional subject leaves another available subject unlocked", async () => {
  const container = new FakeElement("div");
  const section = createSection({
    syllabuses: [
      syllabus(["core-practice"]),
      {...syllabus(["core-practice"]), syllabusId: "science", subject: "Science"}
    ],
    async listAdditionalMissionPracticeIds({syllabusId}) {
      return syllabusId === "science" ? ["science-practice"] : [];
    },
    async getPracticeById() {
      return {questions: [{syllabusId: "science", topicId: "topic-additional"}]};
    }
  });

  section.mount(container);
  await section.ready;

  assert.equal(section.availabilitySummary.hidden, true);
  assert.equal(section.subjectButtons[0].button.disabled, true);
  assert.equal(section.subjectButtons[1].button.disabled, false);
  await findByText(container, "Additional Mission").click();
  await findByText(container, "Science - English").click();
  assert.ok(findByText(container, "Get Next Mission"));
});

test("failed additional availability can retry without claiming exhaustion", async () => {
  let calls = 0;
  const container = new FakeElement("div");
  const section = createSection({
    async listAdditionalMissionPracticeIds() {
      if (++calls <= 2) {
        throw new Error("offline");
      }
      return ["additional-practice"];
    },
    async getPracticeById() {
      return {questions: [{syllabusId: "syllabus-1", topicId: "topic-additional"}]};
    }
  });

  section.mount(container);
  await section.ready;

  assert.equal(section.availabilitySummary.className, "daily-mission-status is-error");
  await findByText(container, "Additional Mission").click();
  assert.equal(section.subjectButtons[0].button.disabled, false);
  assert.equal(section.availabilitySummary.hidden, false);
  await findByText(container, "Mathematics - English").click();
  assert.equal(section.availabilitySummary.hidden, true);
  await findByText(container, "Get Next Mission").click();
  assert.ok(findByText(container, "Start Mission"));
});

test("pausing the last additional mission shows exhaustion and refreshing restores it", async () => {
  let paused = false;
  const container = new FakeElement("div");
  const section = createSection({
    async listAdditionalMissionPracticeIds() {
      return paused ? [] : ["additional-practice"];
    },
    async getPracticeById() {
      return {questions: [{syllabusId: "syllabus-1", topicId: "topic-additional"}]};
    },
    async pauseCoreDailyMission() {
      paused = true;
    }
  });

  section.mount(container);
  await section.ready;
  await findByText(container, "Additional Mission").click();
  await findByText(container, "Mathematics - English").click();
  await findByText(container, "Get Next Mission").click();
  await findByText(container, "Not learned yet").click();

  assert.equal(section.availabilitySummary.textContent, "No more additional missions available today.");
  assert.equal(section.availabilitySummary.hidden, false);
  assert.equal(section.subjectButtons[0].button.disabled, true);
  assert.equal(findByText(container, "Get Next Mission"), undefined);
  paused = false;
  await section.refreshAvailability();
  assert.equal(section.subjectButtons[0].button.disabled, false);
  assert.equal(section.availabilitySummary.hidden, true);
  assert.ok(findByText(container, "Get Next Mission"));
});

test("late startup availability cannot overwrite refreshed additional missions", async () => {
  let calls = 0;
  let resolveStartup;
  const container = new FakeElement("div");
  const section = createSection({
    async getNextCoreDailyMission() {
      return ++calls === 1
        ? new Promise((resolve) => { resolveStartup = resolve; })
        : coreMission();
    },
    async listAdditionalMissionPracticeIds() {
      return ["additional-practice"];
    },
    async getPracticeById() {
      return {questions: [{syllabusId: "syllabus-1", topicId: "topic-additional"}]};
    }
  });

  section.mount(container);
  await section.refreshAvailability();
  resolveStartup(null);
  await section.ready;

  assert.equal(section.subjectButtons[0].button.disabled, false);
  assert.equal(section.availabilitySummary.hidden, true);
});

test("a non-pausable additional topic hides pause controls and can still be started", async () => {
  const calls = [];
  let accepted = false;
  const container = new FakeElement("div");
  const section = createSection({
    async listAdditionalMissionPracticeIds() {
      return ["additional-practice"];
    },
    async getPracticeById() {
      return {questions: [{syllabusId: "syllabus-1", topicId: "topic-additional"}]};
    },
    async isTopicPausable(syllabusId, topicId) {
      calls.push({syllabusId, topicId});
      return false;
    },
    async acceptAdditionalDailyMission({practiceId}) {
      accepted = true;
      return {practiceId};
    }
  });

  section.mount(container);
  await section.ready;
  await section.loadMission("syllabus-1");

  assert.deepEqual(calls, [{syllabusId: "syllabus-1", topicId: "topic-additional"}]);
  assert.equal(findByText(container, "Not learned yet"), undefined);
  assert.equal(flatten(container).some((element) => (
    element.className === "daily-mission-pause-explanation"
  )), false);
  await findByText(container, "Start Mission").click();
  assert.equal(accepted, true);
});

test("additional pause eligibility failures offer no pause and can be retried", async () => {
  let fail = true;
  const container = new FakeElement("div");
  const section = createSection({
    async listAdditionalMissionPracticeIds() {
      return ["additional-practice"];
    },
    async getPracticeById() {
      return {questions: [{syllabusId: "syllabus-1", topicId: "topic-additional"}]};
    },
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

test("a late additional pause eligibility check cannot restore an old mission", async () => {
  let topicId = "topic-additional";
  let resolveEligibility;
  const container = new FakeElement("div");
  const section = createSection({
    async listAdditionalMissionPracticeIds() {
      return [`practice-${topicId}`];
    },
    async getPracticeById() {
      return {questions: [{syllabusId: "syllabus-1", topicId}]};
    },
    isTopicPausable(syllabusId, selectedTopicId) {
      return selectedTopicId === "topic-additional"
        ? new Promise((resolve) => { resolveEligibility = resolve; })
        : Promise.resolve(false);
    }
  });

  section.mount(container);
  await section.ready;
  const pending = section.loadMission("syllabus-1");
  assert.equal(findByText(container, "Not learned yet"), undefined);
  topicId = "topic-another";
  await section.refreshAvailability();
  await section.loadMission("syllabus-1");
  resolveEligibility(true);
  await pending;

  assert.equal(section.currentMission.topicId, "topic-another");
  assert.ok(findByText(container, "Algebra"));
  assert.equal(findByText(container, "Not learned yet"), undefined);
});
