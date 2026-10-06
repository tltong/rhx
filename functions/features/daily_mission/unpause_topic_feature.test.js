const assert = require("node:assert/strict");
const test = require("node:test");

const {
  UnpauseTopic,
} = require("./application/unpause_topic");
const {
  unpauseTopic,
} = require("./daily_mission_module");

test("backend Daily Mission exposes internal topic unpausing", () => {
  assert.equal(typeof unpauseTopic, "function");
});

test("unpauses exactly the requested topic", async () => {
  const calls = [];
  const useCase = new UnpauseTopic({
    dailyMissionRepository: {
      async unpauseTopic(input) {
        calls.push(input);
      },
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
    isPaused: false,
  });
  assert.deepEqual(calls, [{
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
  }]);
});
