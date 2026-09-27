const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createDailyMissionHandlers,
} = require("./daily_mission");

test("acceptCoreDailyMission callable forwards authenticated input", async () => {
  const calls = [];
  const expected = {
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    practiceId: "practice-1",
    date: "2026-09-27",
    isAccepted: true,
    created: true,
  };
  const handlers = createDailyMissionHandlers({
    async acceptCoreMission(input) {
      calls.push(input);
      return expected;
    },
  });

  assert.deepEqual(await handlers.acceptCoreDailyMissionHandler({
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

test("acceptCoreDailyMission callable enforces student ownership", async () => {
  const handlers = createDailyMissionHandlers({
    async acceptCoreMission() {
      throw new Error("must not be called");
    },
  });

  await assert.rejects(
    () => handlers.acceptCoreDailyMissionHandler({
      auth: {uid: "student-2"},
      data: {
        studentId: "student-1",
        practiceId: "practice-1",
      },
    }),
    (error) => error.code === "permission-denied",
  );
});

test("acceptCoreDailyMission callable preserves expected domain errors", async () => {
  const handlers = createDailyMissionHandlers({
    async acceptCoreMission() {
      const error = new Error("The topic is paused.");

      error.code = "failed-precondition";
      throw error;
    },
  });

  await assert.rejects(
    () => handlers.acceptCoreDailyMissionHandler({
      auth: {uid: "student-1"},
      data: {
        studentId: "student-1",
        practiceId: "practice-1",
      },
    }),
    (error) => (
      error.code === "failed-precondition"
      && error.message === "The topic is paused."
    ),
  );
});
