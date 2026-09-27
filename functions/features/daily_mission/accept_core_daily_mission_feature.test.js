const assert = require("node:assert/strict");
const test = require("node:test");

const {
  AcceptCoreDailyMission,
  practiceMissionRoute,
} = require("./application/accept_core_daily_mission");

function practice(syllabusId = "syllabus-1", topicId = "topic-1") {
  return {
    id: "practice-1",
    questions: [{syllabusId, topicId, questionId: "question-1"}],
  };
}

test("accepts the current core mission and returns its route", async () => {
  const calls = [];
  const useCase = new AcceptCoreDailyMission({
    dailyMissionRepository: {
      async acceptCoreMission(input) {
        calls.push(["accept", input]);
        return {created: true};
      },
    },
    async getPracticeById(practiceId) {
      calls.push(["practice", practiceId]);
      return practice();
    },
    async getNextCoreDailyMission(input) {
      calls.push(["next", input]);
      return {
        ...input,
        topicId: "topic-1",
        practiceId: "practice-1",
        date: "2026-09-27",
        isAccepted: false,
      };
    },
  });

  assert.deepEqual(await useCase.execute({
    studentId: "student-1",
    practiceId: "practice-1",
  }), {
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    practiceId: "practice-1",
    date: "2026-09-27",
    isAccepted: true,
    created: true,
  });
  assert.deepEqual(calls, [
    ["practice", "practice-1"],
    ["next", {studentId: "student-1", syllabusId: "syllabus-1"}],
    ["accept", {
      studentId: "student-1",
      syllabusId: "syllabus-1",
      topicId: "topic-1",
      practiceId: "practice-1",
      date: "2026-09-27",
    }],
  ]);
});

test("preserves an idempotent acceptance result", async () => {
  const useCase = new AcceptCoreDailyMission({
    dailyMissionRepository: {
      async acceptCoreMission() {
        return {created: false};
      },
    },
    async getPracticeById() {
      return practice();
    },
    async getNextCoreDailyMission(input) {
      return {
        ...input,
        topicId: "topic-1",
        practiceId: "practice-1",
        date: "2026-09-27",
        isAccepted: true,
      };
    },
  });

  const result = await useCase.execute({
    studentId: "student-1",
    practiceId: "practice-1",
  });

  assert.equal(result.created, false);
  assert.equal(result.isAccepted, true);
});

test("rejects a practice that is not the current suggestion", async () => {
  let acceptanceCalls = 0;
  const useCase = new AcceptCoreDailyMission({
    dailyMissionRepository: {
      async acceptCoreMission() {
        acceptanceCalls += 1;
        return {created: true};
      },
    },
    async getPracticeById() {
      return practice();
    },
    async getNextCoreDailyMission(input) {
      return {
        ...input,
        topicId: "topic-2",
        practiceId: "practice-2",
        date: "2026-09-27",
        isAccepted: false,
      };
    },
  });

  await assert.rejects(
    () => useCase.execute({
      studentId: "student-1",
      practiceId: "practice-1",
    }),
    (error) => error.code === "failed-precondition",
  );
  assert.equal(acceptanceCalls, 0);
});

test("requires a practice to have one syllabus and topic", () => {
  assert.throws(
    () => practiceMissionRoute({
      questions: [
        {syllabusId: "syllabus-1", topicId: "topic-1"},
        {syllabusId: "syllabus-1", topicId: "topic-2"},
      ],
    }),
    /one syllabus and one topic/,
  );
});
