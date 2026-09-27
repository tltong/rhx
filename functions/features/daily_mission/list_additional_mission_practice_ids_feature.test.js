const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ListAdditionalMissionPracticeIds,
} = require("./application/list_additional_mission_practice_ids");

function practice(syllabusId, topicId) {
  return {
    questions: [{syllabusId, topicId, questionId: "question-1"}],
  };
}

test("lists eligible additional practices without invoking core selection", async () => {
  const acceptedCandidateCalls = [];
  const practices = new Map([
    ["additional-2", practice("syllabus-1", "topic-2")],
    ["core-1", practice("syllabus-1", "topic-1")],
    ["paused-1", practice("syllabus-1", "topic-paused")],
    ["accepted-1", practice("syllabus-1", "topic-3")],
    ["additional-1", practice("syllabus-1", "topic-2")],
    ["other-syllabus", practice("syllabus-2", "topic-4")],
  ]);
  const useCase = new ListAdditionalMissionPracticeIds({
    dailyMissionRepository: {
      async getCoreMission(input) {
        assert.deepEqual(input, {
          studentId: "student-1",
          syllabusId: "syllabus-1",
          date: "2026-09-27",
        });
        return {topicId: "topic-1", practiceId: "core-1"};
      },
      async listPausedTopicIds(input) {
        assert.deepEqual(input, {
          studentId: "student-1",
          syllabusId: "syllabus-1",
        });
        return ["topic-paused"];
      },
      async listAcceptedAdditionalPracticeIds(input) {
        acceptedCandidateCalls.push(input);
        return ["accepted-1"];
      },
    },
    async listAssignedPracticeIds() {
      return [
        "additional-2",
        "core-1",
        "paused-1",
        "accepted-1",
        "additional-1",
        "other-syllabus",
        "additional-1",
        "missing",
      ];
    },
    async getPracticeById(practiceId) {
      return practices.get(practiceId) ?? null;
    },
    async checkPausedTopicValidity(input) {
      return {
        ...input,
        pausedDate: "2026-09-01",
        isPaused: true,
        unpaused: false,
      };
    },
    async getCurrentDate() {
      return "2026-09-27";
    },
  });

  assert.deepEqual(await useCase.execute({
    studentId: "student-1",
    syllabusId: "syllabus-1",
  }), ["additional-1", "additional-2"]);
  assert.deepEqual(acceptedCandidateCalls, [{
    studentId: "student-1",
    syllabusId: "syllabus-1",
    date: "2026-09-27",
    candidates: [
      {topicId: "topic-2", practiceId: "additional-2"},
      {topicId: "topic-3", practiceId: "accepted-1"},
      {topicId: "topic-2", practiceId: "additional-1"},
    ],
  }]);
});

test("unpauses expired topics before building the additional selection pool", async () => {
  const validityCalls = [];
  const practices = new Map([
    ["practice-expired", practice("syllabus-1", "topic-expired")],
    ["practice-active", practice("syllabus-1", "topic-active")],
  ]);
  const useCase = new ListAdditionalMissionPracticeIds({
    dailyMissionRepository: {
      async getCoreMission() {
        return null;
      },
      async listPausedTopicIds() {
        return ["topic-expired", "topic-active"];
      },
      async listAcceptedAdditionalPracticeIds() {
        return [];
      },
    },
    async listAssignedPracticeIds() {
      return [...practices.keys()];
    },
    async getPracticeById(practiceId) {
      return practices.get(practiceId);
    },
    async checkPausedTopicValidity(input) {
      validityCalls.push(input);
      const isPaused = input.topicId === "topic-active";

      return {
        ...input,
        pausedDate: "2026-09-01",
        isPaused,
        unpaused: !isPaused,
      };
    },
    async getCurrentDate() {
      return "2026-09-27";
    },
  });

  assert.deepEqual(await useCase.execute({
    studentId: "student-1",
    syllabusId: "syllabus-1",
  }), ["practice-expired"]);
  assert.deepEqual(validityCalls, [
    {
      studentId: "student-1",
      syllabusId: "syllabus-1",
      topicId: "topic-expired",
    },
    {
      studentId: "student-1",
      syllabusId: "syllabus-1",
      topicId: "topic-active",
    },
  ]);
});

test("returns an empty list without reading accepted records when none qualify", async () => {
  let acceptedReads = 0;
  const useCase = new ListAdditionalMissionPracticeIds({
    dailyMissionRepository: {
      async getCoreMission() {
        return {topicId: "topic-1", practiceId: "practice-1"};
      },
      async listPausedTopicIds() {
        return [];
      },
      async listAcceptedAdditionalPracticeIds() {
        acceptedReads += 1;
        return [];
      },
    },
    async listAssignedPracticeIds() {
      return ["practice-1"];
    },
    async getPracticeById() {
      return practice("syllabus-1", "topic-1");
    },
    async checkPausedTopicValidity(input) {
      return {
        ...input,
        pausedDate: "2026-09-01",
        isPaused: true,
        unpaused: false,
      };
    },
    async getCurrentDate() {
      return "2026-09-27";
    },
  });

  assert.deepEqual(await useCase.execute({
    studentId: "student-1",
    syllabusId: "syllabus-1",
  }), []);
  assert.equal(acceptedReads, 0);
});
