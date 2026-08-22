const assert = require("node:assert/strict");
const test = require("node:test");

const {
  assessCompletedStudentPractice,
} = require("./student_practice_completion_trigger");

test("awaits the level write before generating the next practice", async () => {
  let levelWriteCompleted = false;
  const calls = [];
  const result = await assessCompletedStudentPractice({
    studentId: "student-1",
    practiceId: "pre-assessment-1",
  }, {
    assessPractice: async (input) => {
      calls.push(["assess", input]);
      await Promise.resolve();
      levelWriteCompleted = true;

      return {
        assessed: true,
        isFrameworkCompleted: false,
        syllabusId: "syllabus-1",
        topicId: "topic-1",
      };
    },
    generatePractice: async (input) => {
      assert.equal(levelWriteCompleted, true);
      calls.push(["generate", input]);

      return {
        practice: {id: "assessment-1"},
      };
    },
  });

  assert.deepEqual(calls, [
    [
      "assess",
      {
        studentId: "student-1",
        practiceId: "pre-assessment-1",
      },
    ],
    [
      "generate",
      {
        studentId: "student-1",
        syllabusId: "syllabus-1",
        topicId: "topic-1",
      },
    ],
  ]);
  assert.equal(result.generation.practice.id, "assessment-1");
});

test("does not generate when assessment was skipped", async () => {
  let generatorCalls = 0;
  const result = await assessCompletedStudentPractice({
    studentId: "student-1",
    practiceId: "assessment-1",
  }, {
    assessPractice: async () => ({
      assessed: false,
      reason: "assessment-not-supported",
    }),
    generatePractice: async () => {
      generatorCalls += 1;
    },
  });

  assert.equal(generatorCalls, 0);
  assert.equal(result.generation, null);
});

test("does not generate after the framework end level", async () => {
  let generatorCalls = 0;
  const result = await assessCompletedStudentPractice({
    studentId: "student-1",
    practiceId: "pre-assessment-1",
  }, {
    assessPractice: async () => ({
      assessed: true,
      isFrameworkCompleted: true,
      syllabusId: "syllabus-1",
      topicId: "topic-1",
    }),
    generatePractice: async () => {
      generatorCalls += 1;
    },
  });

  assert.equal(generatorCalls, 0);
  assert.equal(result.generation, null);
});
