const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createDailyMissionHandlers,
} = require("./daily_mission");

test("daily mission callable passes validated student input", async () => {
  const calls = [];
  const expected = {
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    practiceId: "practice-1",
    date: "2026-09-27",
    isAccepted: false,
  };
  const handlers = createDailyMissionHandlers({
    async getNextCoreMission(input) {
      calls.push(input);
      return expected;
    },
  });
  const result = await handlers.getNextCoreDailyMissionHandler({
    auth: {uid: "student-1"},
    data: {
      studentId: " student-1 ",
      syllabusId: " syllabus-1 ",
    },
  });

  assert.deepEqual(result, expected);
  assert.deepEqual(calls, [{
    studentId: "student-1",
    syllabusId: "syllabus-1",
  }]);
});

test("daily mission callable requires authentication", async () => {
  const handlers = createDailyMissionHandlers();

  await assert.rejects(
    () => handlers.getNextCoreDailyMissionHandler({
      data: {studentId: "student-1", syllabusId: "syllabus-1"},
    }),
    (error) => error.code === "unauthenticated",
  );
});

test("daily mission callable prevents access to another student", async () => {
  const handlers = createDailyMissionHandlers();

  await assert.rejects(
    () => handlers.getNextCoreDailyMissionHandler({
      auth: {uid: "student-2"},
      data: {studentId: "student-1", syllabusId: "syllabus-1"},
    }),
    (error) => error.code === "permission-denied",
  );
});
