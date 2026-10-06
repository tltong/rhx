const assert = require("node:assert/strict");
const test = require("node:test");

const {
  IsTopicPaused,
} = require("./application/is_topic_paused");
const {
  isTopicPaused,
} = require("./daily_mission_module");

test("backend Daily Mission exposes internal topic pause status", () => {
  assert.equal(typeof isTopicPaused, "function");
});

test("checks the requested topic using the current date", async () => {
  const calls = [];
  const useCase = new IsTopicPaused({
    dailyMissionRepository: {
      async isTopicPaused(input) {
        calls.push(input);
        return true;
      },
    },
    async getCurrentDate() {
      return "2026-09-30";
    },
  });

  assert.equal(await useCase.execute({
    studentId: " student-1 ",
    syllabusId: " syllabus-1 ",
    topicId: " topic-1 ",
  }), true);
  assert.deepEqual(calls, [{
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    currentDate: "2026-09-30",
  }]);
});

test("rejects a non-boolean repository result", async () => {
  const useCase = new IsTopicPaused({
    dailyMissionRepository: {
      async isTopicPaused() {
        return {isPaused: true};
      },
    },
  });

  await assert.rejects(
    () => useCase.execute({
      studentId: "student-1",
      syllabusId: "syllabus-1",
      topicId: "topic-1",
    }),
    /status is invalid/,
  );
});
