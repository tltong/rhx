const assert = require("node:assert/strict");
const test = require("node:test");

const {
  assessCompletedStudentPractice,
} = require("./student_practice_completion_trigger");

function createProcessingRepository(calls) {
  return {
    async markProcessing(input) {
      calls.push(["processing", input]);
    },
    async markGenerating(input) {
      calls.push(["generating", input]);
    },
    async markCompleted(input) {
      calls.push(["completed", input]);
    },
    async markFailed(input) {
      calls.push(["failed", input]);
    },
  };
}

test("awaits assessment and readiness writes before generating the next practice", async () => {
  let levelWriteCompleted = false;
  let readinessWriteCompleted = false;
  const calls = [];
  const result = await assessCompletedStudentPractice({
    eventId: "event-1",
    studentId: "student-1",
    practiceId: "pre-assessment-1",
  }, {
    processingRepository: createProcessingRepository(calls),
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
    calculateReadiness: async (input) => {
      assert.equal(levelWriteCompleted, true);
      calls.push(["calculate-readiness", input]);
      return 85;
    },
    saveReadiness: async (input) => {
      calls.push(["save-readiness", input]);
      await Promise.resolve();
      readinessWriteCompleted = true;
      return {score: input.score};
    },
    generatePractice: async (input) => {
      assert.equal(levelWriteCompleted, true);
      assert.equal(readinessWriteCompleted, true);
      calls.push(["generate", input]);

      return {
        practice: {id: "assessment-1"},
      };
    },
  });

  assert.deepEqual(calls, [
    [
      "processing",
      {
        eventId: "event-1",
        studentId: "student-1",
        practiceId: "pre-assessment-1",
      },
    ],
    [
      "assess",
      {
        studentId: "student-1",
        practiceId: "pre-assessment-1",
      },
    ],
    [
      "calculate-readiness",
      {
        studentId: "student-1",
        syllabusId: "syllabus-1",
        topicId: "topic-1",
      },
    ],
    [
      "save-readiness",
      {
        studentId: "student-1",
        syllabusId: "syllabus-1",
        topicId: "topic-1",
        score: 85,
        practiceId: "pre-assessment-1",
      },
    ],
    [
      "generating",
      {
        eventId: "event-1",
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
    [
      "completed",
      {
        eventId: "event-1",
        studentId: "student-1",
        practiceId: "pre-assessment-1",
        generatedPracticeId: "assessment-1",
        outcome: "practice-generated",
      },
    ],
  ]);
  assert.equal(result.generation.practice.id, "assessment-1");
});

test("does not generate when assessment was skipped", async () => {
  let generatorCalls = 0;
  const processingCalls = [];
  const result = await assessCompletedStudentPractice({
    eventId: "event-2",
    studentId: "student-1",
    practiceId: "assessment-1",
  }, {
    processingRepository: createProcessingRepository(processingCalls),
    assessPractice: async () => ({
      assessed: false,
      reason: "assessment-not-supported",
    }),
    calculateReadiness: async () => { throw new Error("must not be called without topic scope"); },
    saveReadiness: async () => { throw new Error("must not be called without topic scope"); },
    generatePractice: async () => {
      generatorCalls += 1;
    },
  });

  assert.equal(generatorCalls, 0);
  assert.equal(result.generation, null);
  assert.equal(processingCalls.at(-1)[0], "completed");
  assert.equal(
    processingCalls.at(-1)[1].outcome,
    "practice-not-assessed",
  );
});

test("does not generate after the framework end level", async () => {
  let generatorCalls = 0;
  let readinessSaved = false;
  const processingCalls = [];
  const result = await assessCompletedStudentPractice({
    eventId: "event-3",
    studentId: "student-1",
    practiceId: "pre-assessment-1",
  }, {
    processingRepository: createProcessingRepository(processingCalls),
    assessPractice: async () => ({
      assessed: true,
      isFrameworkCompleted: true,
      syllabusId: "syllabus-1",
      topicId: "topic-1",
    }),
    calculateReadiness: async () => 100,
    saveReadiness: async (input) => {
      readinessSaved = true;
      return {score: input.score};
    },
    generatePractice: async () => {
      generatorCalls += 1;
    },
  });

  assert.equal(generatorCalls, 0);
  assert.equal(readinessSaved, true);
  assert.equal(result.generation, null);
  assert.equal(processingCalls.at(-1)[0], "completed");
  assert.equal(
    processingCalls.at(-1)[1].outcome,
    "framework-completed",
  );
});

test("records a terminal processing failure before rethrowing", async () => {
  const processingCalls = [];
  const expectedError = new Error("assessment failed");

  await assert.rejects(
    () => assessCompletedStudentPractice({
      eventId: "event-4",
      studentId: "student-1",
      practiceId: "assessment-1",
    }, {
      processingRepository: createProcessingRepository(processingCalls),
      assessPractice: async () => {
        throw expectedError;
      },
      generatePractice: async () => {
        throw new Error("must not be called");
      },
    }),
    expectedError,
  );
  assert.deepEqual(processingCalls.at(-1), [
    "failed",
    {
      eventId: "event-4",
      studentId: "student-1",
      practiceId: "assessment-1",
      errorCode: "COMPLETION_PROCESSING_FAILED",
    },
  ]);
});

test("does not repeat assessment after processing already completed", async () => {
  let assessmentCalls = 0;
  const result = await assessCompletedStudentPractice({
    eventId: "event-5",
    studentId: "student-1",
    practiceId: "assessment-1",
  }, {
    processingRepository: {
      async markProcessing() {
        return {shouldProcess: false};
      },
      async markGenerating() {
        throw new Error("must not be called");
      },
      async markCompleted() {
        throw new Error("must not be called");
      },
      async markFailed() {
        throw new Error("must not be called");
      },
    },
    assessPractice: async () => {
      assessmentCalls += 1;
    },
    calculateReadiness: async () => { throw new Error("must not be called after processing completed"); },
    saveReadiness: async () => { throw new Error("must not be called after processing completed"); },
    generatePractice: async () => {
      throw new Error("must not be called");
    },
  });

  assert.equal(assessmentCalls, 0);
  assert.equal(result.alreadyProcessed, true);
});

test("updates readiness for scoped completions when level assessment is skipped", async () => {
  const calls = [];
  await assessCompletedStudentPractice({
    eventId: "event-skipped", studentId: "student-1", practiceId: "assessment-1",
  }, {
    processingRepository: createProcessingRepository(calls),
    assessPractice: async () => ({
      assessed: false, reason: "framework-already-completed",
      isFrameworkCompleted: true, syllabusId: "syllabus-1", topicId: "topic-1",
    }),
    calculateReadiness: async (input) => {
      calls.push(["calculate-readiness", input]);
      return 0;
    },
    saveReadiness: async (input) => {
      calls.push(["save-readiness", input]);
      return {score: input.score};
    },
    generatePractice: async () => { throw new Error("must not generate"); },
  });
  assert.deepEqual(calls.map(([name]) => name), [
    "processing", "calculate-readiness", "save-readiness", "completed",
  ]);
  assert.deepEqual(calls[2][1], {
    studentId: "student-1", syllabusId: "syllabus-1", topicId: "topic-1",
    score: 0, practiceId: "assessment-1",
  });
});

test("a null readiness calculation does not save an invented score", async () => {
  const calls = [];
  await assessCompletedStudentPractice({
    eventId: "event-empty", studentId: "student-1", practiceId: "assessment-1",
  }, {
    processingRepository: createProcessingRepository(calls),
    assessPractice: async () => ({
      assessed: true, isFrameworkCompleted: true,
      syllabusId: "syllabus-1", topicId: "topic-1",
    }),
    calculateReadiness: async () => null,
    saveReadiness: async () => { throw new Error("must not save a null score"); },
    generatePractice: async () => { throw new Error("must not generate"); },
  });
  assert.deepEqual(calls.map(([name]) => name), ["processing", "completed"]);
});

for (const operation of ["calculate", "save"]) {
  test(`records readiness ${operation} failures before any generation or completion`, async () => {
    const calls = [];
    const error = new Error(`readiness ${operation} failed`);
    await assert.rejects(() => assessCompletedStudentPractice({
      eventId: "event-failure", studentId: "student-1", practiceId: "assessment-1",
    }, {
      processingRepository: createProcessingRepository(calls),
      assessPractice: async () => ({
        assessed: true, isFrameworkCompleted: false,
        syllabusId: "syllabus-1", topicId: "topic-1",
      }),
      calculateReadiness: async () => {
        if (operation === "calculate") throw error;
        return 80;
      },
      saveReadiness: async () => { throw error; },
      generatePractice: async () => { throw new Error("must not generate"); },
    }), error);
    assert.deepEqual(calls.map(([name]) => name), ["processing", "failed"]);
    assert.equal(calls.at(-1)[1].errorCode, "COMPLETION_PROCESSING_FAILED");
  });
}
