const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CheckPausedTopicValidity,
} = require("./application/check_paused_topic_validity");

test("checks the requested topic using the current date", async () => {
  const calls = [];
  const useCase = new CheckPausedTopicValidity({
    dailyMissionRepository: {
      async checkPausedTopicValidity(input) {
        calls.push(input);
        return {
          pausedDate: "2026-09-01",
          isPaused: false,
          unpaused: true,
        };
      },
    },
    async getCurrentDate() {
      return "2026-09-27";
    },
  });

  assert.deepEqual(await useCase.execute({
    studentId: " student-1 ",
    syllabusId: " syllabus-1 ",
    topicId: " topic-1 ",
  }), {
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    pausedDate: "2026-09-01",
    isPaused: false,
    unpaused: true,
  });
  assert.deepEqual(calls, [{
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    currentDate: "2026-09-27",
  }]);
});
