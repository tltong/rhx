const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PauseCoreDailyMission,
} = require("./application/pause_core_daily_mission");

function practice() {
  return {
    id: "practice-1",
    questions: [{
      syllabusId: "syllabus-1",
      topicId: "topic-1",
      questionId: "question-1",
    }],
  };
}

test("pauses the practice topic without selecting another mission", async () => {
  const calls = [];
  const useCase = new PauseCoreDailyMission({
    dailyMissionRepository: {
      async pauseTopic(input) {
        calls.push(["pause", input]);
        return {
          pausedDate: "2026-09-27",
          created: true,
        };
      },
    },
    async getPracticeById(practiceId) {
      calls.push(["practice", practiceId]);
      return practice();
    },
    async getCurrentDate() {
      calls.push(["date"]);
      return "2026-09-27";
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
    pausedDate: "2026-09-27",
    isPaused: true,
    created: true,
  });
  assert.deepEqual(calls, [
    ["practice", "practice-1"],
    ["date"],
    ["pause", {
      studentId: "student-1",
      syllabusId: "syllabus-1",
      topicId: "topic-1",
      pausedDate: "2026-09-27",
    }],
  ]);
});

test("returns the original date when the topic was already paused", async () => {
  const useCase = new PauseCoreDailyMission({
    dailyMissionRepository: {
      async pauseTopic() {
        return {
          pausedDate: "2026-09-20",
          created: false,
        };
      },
    },
    async getPracticeById() {
      return practice();
    },
    async getCurrentDate() {
      return "2026-09-27";
    },
  });

  const result = await useCase.execute({
    studentId: "student-1",
    practiceId: "practice-1",
  });

  assert.equal(result.pausedDate, "2026-09-20");
  assert.equal(result.created, false);
});

test("rejects an unknown practice without pausing a topic", async () => {
  let pauseCalls = 0;
  const useCase = new PauseCoreDailyMission({
    dailyMissionRepository: {
      async pauseTopic() {
        pauseCalls += 1;
      },
    },
    async getPracticeById() {
      return null;
    },
  });

  await assert.rejects(
    () => useCase.execute({
      studentId: "student-1",
      practiceId: "practice-1",
    }),
    (error) => error.code === "not-found",
  );
  assert.equal(pauseCalls, 0);
});
