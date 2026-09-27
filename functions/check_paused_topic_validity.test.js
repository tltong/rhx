const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createDailyMissionHandlers,
} = require("./daily_mission");

test("checkPausedTopicValidity forwards authenticated input", async () => {
  const calls = [];
  const expected = {
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    pausedDate: "2026-09-01",
    isPaused: false,
    unpaused: true,
  };
  const handlers = createDailyMissionHandlers({
    async checkPausedTopic(input) {
      calls.push(input);
      return expected;
    },
  });

  assert.deepEqual(await handlers.checkPausedTopicValidityHandler({
    auth: {uid: "student-1"},
    data: {
      studentId: " student-1 ",
      syllabusId: " syllabus-1 ",
      topicId: " topic-1 ",
    },
  }), expected);
  assert.deepEqual(calls, [{
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
  }]);
});

test("checkPausedTopicValidity enforces student ownership", async () => {
  const handlers = createDailyMissionHandlers({
    async checkPausedTopic() {
      throw new Error("must not be called");
    },
  });

  await assert.rejects(
    () => handlers.checkPausedTopicValidityHandler({
      auth: {uid: "student-2"},
      data: {
        studentId: "student-1",
        syllabusId: "syllabus-1",
        topicId: "topic-1",
      },
    }),
    (error) => error.code === "permission-denied",
  );
});
