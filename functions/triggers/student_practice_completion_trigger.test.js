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

function createReliabilityOperations(calls) {
  return {
    async calculateTopicReliability(input) {
      calls.push(["calculate-topic-reliability", input]);
      return {score: 10, completedPracticeCount: 1};
    },
    async saveTopicReliability(input) {
      calls.push(["save-topic-reliability", input]);
      return {score: input.score, completedPracticeCount: input.completedPracticeCount};
    },
    async calculateSubjectReliability(input) {
      calls.push(["calculate-subject-reliability", input]);
      return 5;
    },
    async saveSubjectReliability(input) {
      calls.push(["save-subject-reliability", input]);
      return {score: input.score};
    },
  };
}

test("awaits assessment, readiness and reliability writes before generating the next practice", async () => {
  let levelWriteCompleted = false;
  let readinessWriteCompleted = false;
  let subjectReadinessWriteCompleted = false;
  let reliabilityWriteCompleted = false;
  let subjectReliabilityWriteCompleted = false;
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
    calculateSubjectReadiness: async (input) => {
      assert.equal(readinessWriteCompleted, true);
      calls.push(["calculate-subject-readiness", input]);
      return 75;
    },
    saveSubjectReadiness: async (input) => {
      calls.push(["save-subject-readiness", input]);
      await Promise.resolve();
      subjectReadinessWriteCompleted = true;
      return {score: input.score};
    },
    calculateTopicReliability: async (input) => {
      assert.equal(subjectReadinessWriteCompleted, true);
      calls.push(["calculate-topic-reliability", input]);
      return {score: 20, completedPracticeCount: 2};
    },
    saveTopicReliability: async (input) => {
      calls.push(["save-topic-reliability", input]);
      await Promise.resolve();
      reliabilityWriteCompleted = true;
      return {score: input.score, completedPracticeCount: input.completedPracticeCount};
    },
    calculateSubjectReliability: async (input) => {
      assert.equal(reliabilityWriteCompleted, true);
      calls.push(["calculate-subject-reliability", input]);
      return 10;
    },
    saveSubjectReliability: async (input) => {
      calls.push(["save-subject-reliability", input]);
      await Promise.resolve();
      subjectReliabilityWriteCompleted = true;
      return {score: input.score};
    },
    generatePractice: async (input) => {
      assert.equal(levelWriteCompleted, true);
      assert.equal(readinessWriteCompleted, true);
      assert.equal(subjectReadinessWriteCompleted, true);
      assert.equal(reliabilityWriteCompleted, true);
      assert.equal(subjectReliabilityWriteCompleted, true);
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
    ["calculate-subject-readiness", {studentId: "student-1", syllabusId: "syllabus-1"}],
    ["save-subject-readiness", {
      studentId: "student-1", syllabusId: "syllabus-1",
      score: 75, practiceId: "pre-assessment-1",
    }],
    ["calculate-topic-reliability", {
      studentId: "student-1", syllabusId: "syllabus-1", topicId: "topic-1",
    }],
    ["save-topic-reliability", {
      studentId: "student-1", syllabusId: "syllabus-1", topicId: "topic-1",
      score: 20, completedPracticeCount: 2,
    }],
    ["calculate-subject-reliability", {studentId: "student-1", syllabusId: "syllabus-1"}],
    ["save-subject-reliability", {studentId: "student-1", syllabusId: "syllabus-1", score: 10}],
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
    calculateSubjectReadiness: async () => { throw new Error("must not be called without topic scope"); },
    saveSubjectReadiness: async () => { throw new Error("must not be called without topic scope"); },
    calculateTopicReliability: async () => { throw new Error("must not be called without topic scope"); },
    saveTopicReliability: async () => { throw new Error("must not be called without topic scope"); },
    calculateSubjectReliability: async () => { throw new Error("must not be called without topic scope"); },
    saveSubjectReliability: async () => { throw new Error("must not be called without topic scope"); },
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
  let subjectReadinessSaved = false;
  const processingCalls = [];
  const result = await assessCompletedStudentPractice({
    eventId: "event-3",
    studentId: "student-1",
    practiceId: "pre-assessment-1",
  }, {
    processingRepository: createProcessingRepository(processingCalls),
    ...createReliabilityOperations(processingCalls),
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
    calculateSubjectReadiness: async () => {
      assert.equal(readinessSaved, true);
      return 90;
    },
    saveSubjectReadiness: async (input) => {
      subjectReadinessSaved = true;
      assert.equal(input.score, 90);
      return {score: input.score};
    },
    generatePractice: async () => {
      generatorCalls += 1;
    },
  });

  assert.equal(generatorCalls, 0);
  assert.equal(readinessSaved, true);
  assert.equal(subjectReadinessSaved, true);
  assert.deepEqual(processingCalls.map(([name]) => name), [
    "processing", "calculate-topic-reliability", "save-topic-reliability",
    "calculate-subject-reliability", "save-subject-reliability", "completed",
  ]);
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
    calculateSubjectReadiness: async () => { throw new Error("must not be called after processing completed"); },
    saveSubjectReadiness: async () => { throw new Error("must not be called after processing completed"); },
    calculateTopicReliability: async () => { throw new Error("must not be called after processing completed"); },
    saveTopicReliability: async () => { throw new Error("must not be called after processing completed"); },
    calculateSubjectReliability: async () => { throw new Error("must not be called after processing completed"); },
    saveSubjectReliability: async () => { throw new Error("must not be called after processing completed"); },
    generatePractice: async () => {
      throw new Error("must not be called");
    },
  });

  assert.equal(assessmentCalls, 0);
  assert.equal(result.alreadyProcessed, true);
});

test("updates readiness and reliability for scoped completions when level assessment is skipped", async () => {
  const calls = [];
  await assessCompletedStudentPractice({
    eventId: "event-skipped", studentId: "student-1", practiceId: "assessment-1",
  }, {
    processingRepository: createProcessingRepository(calls),
    ...createReliabilityOperations(calls),
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
    calculateSubjectReadiness: async (input) => {
      calls.push(["calculate-subject-readiness", input]);
      return 0;
    },
    saveSubjectReadiness: async (input) => {
      calls.push(["save-subject-readiness", input]);
      return {score: input.score};
    },
    generatePractice: async () => { throw new Error("must not generate"); },
  });
  assert.deepEqual(calls.map(([name]) => name), [
    "processing", "calculate-readiness", "save-readiness",
    "calculate-subject-readiness", "save-subject-readiness",
    "calculate-topic-reliability", "save-topic-reliability",
    "calculate-subject-reliability", "save-subject-reliability", "completed",
  ]);
  assert.deepEqual(calls[2][1], {
    studentId: "student-1", syllabusId: "syllabus-1", topicId: "topic-1",
    score: 0, practiceId: "assessment-1",
  });
  assert.deepEqual(calls[4][1], {
    studentId: "student-1", syllabusId: "syllabus-1",
    score: 0, practiceId: "assessment-1",
  });
});

test("a null readiness calculation skips readiness writes and still updates reliability", async () => {
  const calls = [];
  await assessCompletedStudentPractice({
    eventId: "event-empty", studentId: "student-1", practiceId: "assessment-1",
  }, {
    processingRepository: createProcessingRepository(calls),
    ...createReliabilityOperations(calls),
    assessPractice: async () => ({
      assessed: true, isFrameworkCompleted: true,
      syllabusId: "syllabus-1", topicId: "topic-1",
    }),
    calculateReadiness: async () => null,
    saveReadiness: async () => { throw new Error("must not save a null score"); },
    calculateSubjectReadiness: async () => { throw new Error("must not calculate without a topic save"); },
    saveSubjectReadiness: async () => { throw new Error("must not save without a topic save"); },
    generatePractice: async () => { throw new Error("must not generate"); },
  });
  assert.deepEqual(calls.map(([name]) => name), [
    "processing", "calculate-topic-reliability", "save-topic-reliability",
    "calculate-subject-reliability", "save-subject-reliability", "completed",
  ]);
});

for (const operation of ["calculate", "save"]) {
  test(`records readiness ${operation} failures before any generation or completion`, async () => {
    const calls = [];
    const error = new Error(`readiness ${operation} failed`);
    await assert.rejects(() => assessCompletedStudentPractice({
      eventId: "event-failure", studentId: "student-1", practiceId: "assessment-1",
    }, {
      processingRepository: createProcessingRepository(calls),
      ...createReliabilityOperations(calls),
      assessPractice: async () => ({
        assessed: true, isFrameworkCompleted: false,
        syllabusId: "syllabus-1", topicId: "topic-1",
      }),
      calculateReadiness: async () => {
        if (operation === "calculate") throw error;
        return 80;
      },
      saveReadiness: async () => { throw error; },
      calculateSubjectReadiness: async () => { throw new Error("must not calculate after topic failure"); },
      saveSubjectReadiness: async () => { throw new Error("must not save after topic failure"); },
      generatePractice: async () => { throw new Error("must not generate"); },
    }), error);
    assert.deepEqual(calls.map(([name]) => name), ["processing", "failed"]);
    assert.equal(calls.at(-1)[1].errorCode, "COMPLETION_PROCESSING_FAILED");
  });
}

test("a null subject readiness calculation skips its save and still completes processing", async () => {
  const calls = [];
  await assessCompletedStudentPractice({
    studentId: "student-1", practiceId: "assessment-1",
  }, {
    processingRepository: createProcessingRepository(calls),
    ...createReliabilityOperations(calls),
    assessPractice: async () => ({
      assessed: true, isFrameworkCompleted: true,
      syllabusId: "syllabus-1", topicId: "topic-1",
    }),
    calculateReadiness: async () => 80,
    saveReadiness: async (input) => {
      calls.push(["save-readiness", input]);
      return {score: input.score};
    },
    calculateSubjectReadiness: async () => {
      calls.push(["calculate-subject-readiness"]);
      return null;
    },
    saveSubjectReadiness: async () => { throw new Error("must not save a null subject score"); },
    generatePractice: async () => { throw new Error("must not generate"); },
  });
  assert.deepEqual(calls.map(([name]) => name), [
    "processing", "save-readiness", "calculate-subject-readiness",
    "calculate-topic-reliability", "save-topic-reliability",
    "calculate-subject-reliability", "save-subject-reliability", "completed",
  ]);
});

for (const operation of ["calculate", "save"]) {
  for (const isFrameworkCompleted of [false, true]) {
    test(`subject readiness ${operation} failure prevents generation and completion (framework complete: ${isFrameworkCompleted})`, async () => {
      const calls = [];
      const error = new Error(`subject readiness ${operation} failed`);
      await assert.rejects(() => assessCompletedStudentPractice({
        studentId: "student-1", practiceId: "assessment-1",
      }, {
        processingRepository: createProcessingRepository(calls),
        ...createReliabilityOperations(calls),
        assessPractice: async () => ({
          assessed: true, isFrameworkCompleted,
          syllabusId: "syllabus-1", topicId: "topic-1",
        }),
        calculateReadiness: async () => 80,
        saveReadiness: async (input) => {
          calls.push(["save-readiness"]);
          return {score: input.score};
        },
        calculateSubjectReadiness: async () => {
          if (operation === "calculate") throw error;
          return 70;
        },
        saveSubjectReadiness: async () => { throw error; },
        generatePractice: async () => { throw new Error("must not generate"); },
      }), error);
      assert.deepEqual(calls.map(([name]) => name), ["processing", "save-readiness", "failed"]);
      assert.equal(calls.at(-1)[1].errorCode, "COMPLETION_PROCESSING_FAILED");
    });
  }
}

test("updates reliability before completing a scoped practice whose assessment was skipped", async () => {
  const calls = [];
  await assessCompletedStudentPractice({studentId: "student-1", practiceId: "assessment-1"}, {
    processingRepository: createProcessingRepository(calls),
    ...createReliabilityOperations(calls),
    assessPractice: async () => ({
      assessed: false, reason: "progression-skipped", isFrameworkCompleted: false,
      syllabusId: "syllabus-1", topicId: "topic-1",
    }),
    calculateReadiness: async () => null,
    saveReadiness: async () => { throw new Error("must not save null readiness"); },
    generatePractice: async () => { throw new Error("must not generate after skipped assessment"); },
  });
  assert.deepEqual(calls.map(([name]) => name), [
    "processing", "calculate-topic-reliability", "save-topic-reliability",
    "calculate-subject-reliability", "save-subject-reliability", "completed",
  ]);
  assert.equal(calls.at(-1)[1].outcome, "practice-not-assessed");
});

test("zero topic and subject reliability are saved before completing processing", async () => {
  const calls = [];
  await assessCompletedStudentPractice({studentId: "student-1", practiceId: "assessment-1"}, {
    processingRepository: createProcessingRepository(calls),
    ...createReliabilityOperations(calls),
    assessPractice: async () => ({
      assessed: true, isFrameworkCompleted: true,
      syllabusId: "syllabus-1", topicId: "topic-1",
    }),
    calculateReadiness: async () => null,
    calculateTopicReliability: async () => ({score: 0, completedPracticeCount: 0}),
    calculateSubjectReliability: async () => 0,
    generatePractice: async () => { throw new Error("must not generate for a completed framework"); },
  });
  assert.deepEqual(calls.map(([name]) => name), [
    "processing", "save-topic-reliability", "save-subject-reliability", "completed",
  ]);
  assert.deepEqual(calls[1][1], {
    studentId: "student-1", syllabusId: "syllabus-1", topicId: "topic-1",
    score: 0, completedPracticeCount: 0,
  });
  assert.deepEqual(calls[2][1], {studentId: "student-1", syllabusId: "syllabus-1", score: 0});
});

test("a null subject reliability calculation skips its save and still completes processing", async () => {
  const calls = [];
  await assessCompletedStudentPractice({studentId: "student-1", practiceId: "assessment-1"}, {
    processingRepository: createProcessingRepository(calls),
    ...createReliabilityOperations(calls),
    assessPractice: async () => ({
      assessed: true, isFrameworkCompleted: true,
      syllabusId: "syllabus-1", topicId: "topic-1",
    }),
    calculateReadiness: async () => null,
    calculateSubjectReliability: async (input) => {
      calls.push(["calculate-subject-reliability", input]);
      return null;
    },
    saveSubjectReliability: async () => { throw new Error("must not save a null subject score"); },
    generatePractice: async () => { throw new Error("must not generate for a completed framework"); },
  });
  assert.deepEqual(calls.map(([name]) => name), [
    "processing", "calculate-topic-reliability", "save-topic-reliability",
    "calculate-subject-reliability", "completed",
  ]);
});

const reliabilityStages = [
  ["calculateTopicReliability", "calculate-topic-reliability"],
  ["saveTopicReliability", "save-topic-reliability"],
  ["calculateSubjectReliability", "calculate-subject-reliability"],
  ["saveSubjectReliability", "save-subject-reliability"],
];
for (const [index, [operation]] of reliabilityStages.entries()) {
  for (const isFrameworkCompleted of [false, true]) {
    test(`${operation} failure prevents generation and completion (framework complete: ${isFrameworkCompleted})`, async () => {
      const calls = [];
      const error = new Error(`${operation} failed`);
      const reliabilityOperations = createReliabilityOperations(calls);
      const original = reliabilityOperations[operation];
      reliabilityOperations[operation] = async (input) => {
        await original(input);
        throw error;
      };
      await assert.rejects(() => assessCompletedStudentPractice({
        eventId: "event-reliability-failed", studentId: "student-1", practiceId: "assessment-1",
      }, {
        processingRepository: createProcessingRepository(calls),
        ...reliabilityOperations,
        assessPractice: async () => ({
          assessed: true, isFrameworkCompleted,
          syllabusId: "syllabus-1", topicId: "topic-1",
        }),
        calculateReadiness: async () => null,
        generatePractice: async () => { throw new Error("must not generate after reliability failure"); },
      }), (actual) => actual === error);
      assert.deepEqual(calls.map(([name]) => name), [
        "processing", ...reliabilityStages.slice(0, index + 1).map(([, name]) => name), "failed",
      ]);
      assert.deepEqual(calls.at(-1)[1], {
        eventId: "event-reliability-failed", studentId: "student-1", practiceId: "assessment-1",
        errorCode: "COMPLETION_PROCESSING_FAILED",
      });
    });
  }
}
