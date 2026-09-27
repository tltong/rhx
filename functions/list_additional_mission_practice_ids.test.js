const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createDailyMissionHandlers,
} = require("./daily_mission");

test("additional mission callable forwards authenticated input", async () => {
  const calls = [];
  const handlers = createDailyMissionHandlers({
    async listAdditionalMissionIds(input) {
      calls.push(input);
      return ["practice-1", "practice-2"];
    },
  });

  assert.deepEqual(
    await handlers.listAdditionalMissionPracticeIdsHandler({
      auth: {uid: "student-1"},
      data: {
        studentId: " student-1 ",
        syllabusId: " syllabus-1 ",
      },
    }),
    ["practice-1", "practice-2"],
  );
  assert.deepEqual(calls, [{
    studentId: "student-1",
    syllabusId: "syllabus-1",
  }]);
});

test("additional mission callable enforces student ownership", async () => {
  const handlers = createDailyMissionHandlers({
    async listAdditionalMissionIds() {
      throw new Error("must not be called");
    },
  });

  await assert.rejects(
    () => handlers.listAdditionalMissionPracticeIdsHandler({
      auth: {uid: "student-2"},
      data: {
        studentId: "student-1",
        syllabusId: "syllabus-1",
      },
    }),
    (error) => error.code === "permission-denied",
  );
});
