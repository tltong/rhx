const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createDailyMissionHandlers,
} = require("./daily_mission");

test("pauseCoreDailyMission callable forwards authenticated input", async () => {
  const calls = [];
  const expected = {
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    practiceId: "practice-1",
    pausedDate: "2026-09-27",
    isPaused: true,
    created: true,
  };
  const handlers = createDailyMissionHandlers({
    async pauseCoreMission(input) {
      calls.push(input);
      return expected;
    },
  });

  assert.deepEqual(await handlers.pauseCoreDailyMissionHandler({
    auth: {uid: "student-1"},
    data: {
      studentId: " student-1 ",
      practiceId: " practice-1 ",
    },
  }), expected);
  assert.deepEqual(calls, [{
    studentId: "student-1",
    practiceId: "practice-1",
  }]);
});

test("pauseCoreDailyMission callable enforces student ownership", async () => {
  const handlers = createDailyMissionHandlers({
    async pauseCoreMission() {
      throw new Error("must not be called");
    },
  });

  await assert.rejects(
    () => handlers.pauseCoreDailyMissionHandler({
      auth: {uid: "student-2"},
      data: {
        studentId: "student-1",
        practiceId: "practice-1",
      },
    }),
    (error) => error.code === "permission-denied",
  );
});

test("pauseCoreDailyMission callable preserves a missing-practice error", async () => {
  const handlers = createDailyMissionHandlers({
    async pauseCoreMission() {
      const error = new Error("Practice could not be found.");

      error.code = "not-found";
      throw error;
    },
  });

  await assert.rejects(
    () => handlers.pauseCoreDailyMissionHandler({
      auth: {uid: "student-1"},
      data: {
        studentId: "student-1",
        practiceId: "practice-1",
      },
    }),
    (error) => (
      error.code === "not-found"
      && error.message === "Practice could not be found."
    ),
  );
});
