const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createDailyMissionHandlers,
} = require("./daily_mission");

test("additional acceptance callable forwards authenticated input", async () => {
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
    async acceptAdditionalMission(input) {
      calls.push(input);
      return expected;
    },
  });

  assert.deepEqual(
    await handlers.acceptAdditionalDailyMissionHandler({
      auth: {uid: "student-1"},
      data: {
        studentId: " student-1 ",
        practiceId: " practice-1 ",
      },
    }),
    expected,
  );
  assert.deepEqual(calls, [{
    studentId: "student-1",
    practiceId: "practice-1",
  }]);
});

test("additional acceptance callable enforces student ownership", async () => {
  const handlers = createDailyMissionHandlers({
    async acceptAdditionalMission() {
      throw new Error("must not be called");
    },
  });

  await assert.rejects(
    () => handlers.acceptAdditionalDailyMissionHandler({
      auth: {uid: "student-2"},
      data: {
        studentId: "student-1",
        practiceId: "practice-1",
      },
    }),
    (error) => error.code === "permission-denied",
  );
});

test("additional acceptance callable preserves missing-practice errors", async () => {
  const handlers = createDailyMissionHandlers({
    async acceptAdditionalMission() {
      const error = new Error("Practice could not be found.");

      error.code = "not-found";
      throw error;
    },
  });

  await assert.rejects(
    () => handlers.acceptAdditionalDailyMissionHandler({
      auth: {uid: "student-1"},
      data: {
        studentId: "student-1",
        practiceId: "practice-1",
      },
    }),
    (error) => error.code === "not-found",
  );
});
