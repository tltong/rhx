const assert = require("node:assert/strict");
const test = require("node:test");

const {
  GenerateAssessmentPractice,
} = require("./generate_assessment_practice");

function question(id, hasDiagram = false) {
  return {
    id,
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    language: "English",
    hasDiagram,
    difficulty: "Easy",
    questionText: `Question ${id}`,
  };
}

function createDependencies(overrides = {}) {
  return {
    getStudentTopicLevel: async () => "level-1",
    getTopicAssessmentFrameworkId: async () => "framework-1",
    getAssessmentLevelCriteria: async () => ({
      criteria: {
        questionsPerPractice: 4,
        difficultyLevel: "Easy",
      },
    }),
    getStudentSyllabusSubscriptionLanguage: async () => "English",
    getTopicDiagramPercentage: async () => 25,
    getDefaultLlmPromptConfig: async () => ({id: "prompt-1"}),
    allocateAssessmentQuestions: () => ({
      totalQuestions: 4,
      diagramPercentage: 25,
      withoutDiagram: 3,
      withDiagram: 1,
    }),
    listQuestionsByTopic: async () => [],
    getQuestionsForPractice: async () => [],
    listAssignedPracticeIds: async () => [],
    listCompletedPracticeIds: async () => [],
    getPracticeById: async () => null,
    generateQuestions: async () => ({prompts: [], questions: []}),
    generateQuestionsWithDiagram: async () => ({
      prompts: [],
      questions: [],
    }),
    createPractice: async (input) => ({
      id: "practice-new",
      ...input,
    }),
    deletePractice: async () => {},
    assignPracticeToStudent: async (input) => input,
    assessmentPracticeType: "assessment",
    assessmentFrameworkEndLevelId: "framework-complete",
    ...overrides,
  };
}

test("reuses eligible questions and generates only the shortage", async () => {
  const generatedInputs = [];
  let diagramGeneratorCalls = 0;
  let promptConfigCalls = 0;
  const useCase = new GenerateAssessmentPractice(createDependencies({
    getDefaultLlmPromptConfig: async () => {
      promptConfigCalls += 1;
      return {id: "prompt-1"};
    },
    listAssignedPracticeIds: async () => ["assigned-1"],
    listCompletedPracticeIds: async () => ["pre-assessment-1"],
    getPracticeById: async (practiceId) => (
      practiceId === "assigned-1"
        ? {
          id: practiceId,
          type: "assessment",
          questions: [{
            syllabusId: "syllabus-1",
            topicId: "topic-1",
            language: "English",
            hasDiagram: false,
            questionId: "used-1",
          }],
        }
        : {
          id: practiceId,
          type: "pre assessment",
          questions: [{
            syllabusId: "syllabus-1",
            topicId: "topic-1",
            questionId: "pre-1",
          }],
        }
    ),
    getQuestionsForPractice: async (references) => {
      assert.equal(references.length, 1);
      return [question("used-1")];
    },
    listQuestionsByTopic: async (_syllabusId, _topicId, options) => (
      options.hasDiagram
        ? [question("diagram-reuse", true)]
        : [question("used-1"), question("plain-reuse")]
    ),
    generateQuestions: async (_configId, _syllabusId, input) => {
      generatedInputs.push(input);
      return {
        prompts: ["plain prompt"],
        questions: [question("generated-1"), question("generated-2")],
      };
    },
    generateQuestionsWithDiagram: async () => {
      diagramGeneratorCalls += 1;
      return {prompts: [], questions: []};
    },
  }));

  const result = await useCase.execute({
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
  });

  assert.equal(promptConfigCalls, 1);
  assert.equal(diagramGeneratorCalls, 0);
  assert.equal(generatedInputs[0].numberOfQuestions, 2);
  assert.deepEqual(
    result.questions.map((item) => item.id),
    ["plain-reuse", "generated-1", "generated-2", "diagram-reuse"],
  );
  assert.equal(result.questionSets.withoutDiagram.reusedQuestionCount, 1);
  assert.equal(result.questionSets.withoutDiagram.generatedQuestionCount, 2);
  assert.equal(result.practice.id, "practice-new");
  assert.deepEqual(result.assignment, {
    studentId: "student-1",
    practiceId: "practice-new",
  });
});

test("does not invoke the LLM when the question bank is sufficient", async () => {
  let promptConfigCalls = 0;
  let generatorCalls = 0;
  const useCase = new GenerateAssessmentPractice(createDependencies({
    getDefaultLlmPromptConfig: async () => {
      promptConfigCalls += 1;
      return {id: "prompt-1"};
    },
    listQuestionsByTopic: async (_syllabusId, _topicId, options) => (
      options.hasDiagram
        ? [question("diagram-1", true)]
        : [question("plain-1"), question("plain-2"), question("plain-3")]
    ),
    generateQuestions: async () => {
      generatorCalls += 1;
      return {prompts: [], questions: []};
    },
    generateQuestionsWithDiagram: async () => {
      generatorCalls += 1;
      return {prompts: [], questions: []};
    },
  }));

  const result = await useCase.execute({
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
  });

  assert.equal(promptConfigCalls, 0);
  assert.equal(generatorCalls, 0);
  assert.equal(result.questions.length, 4);
});

test("passes all matching completed practice texts to generation when fewer than three exist", async () => {
  const generationInputs = [];
  const practiceQuestion = (questionId, hasDiagram) => ({
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    language: "English",
    hasDiagram,
    questionId,
  });
  const practices = {
    old: {
      id: "old",
      type: "assessment",
      dateGenerated: new Date("2026-08-01T00:00:00Z"),
      questions: [practiceQuestion("old-plain", false)],
    },
    latest: {
      id: "latest",
      type: "assessment",
      dateGenerated: new Date("2026-08-20T00:00:00Z"),
      questions: [
        practiceQuestion("latest-plain", false),
        practiceQuestion("latest-diagram", true),
      ],
    },
  };
  const useCase = new GenerateAssessmentPractice(createDependencies({
    getAssessmentLevelCriteria: async () => ({
      criteria: {
        questionsPerPractice: 2,
        difficultyLevel: "Easy",
      },
    }),
    allocateAssessmentQuestions: () => ({
      totalQuestions: 2,
      diagramPercentage: 50,
      withoutDiagram: 1,
      withDiagram: 1,
    }),
    listCompletedPracticeIds: async () => ["old", "latest"],
    getPracticeById: async (practiceId) => practices[practiceId],
    getQuestionsForPractice: async (references) => references.map(
      (reference) => ({
        ...question(reference.questionId, reference.hasDiagram),
        questionText: reference.questionId,
      }),
    ),
    generateQuestions: async (_configId, _syllabusId, input) => {
      generationInputs.push({type: "plain", input});
      return {prompts: [], questions: [question("generated-plain")]};
    },
    generateQuestionsWithDiagram: async (_configId, _syllabusId, input) => {
      generationInputs.push({type: "diagram", input});
      return {
        prompts: [],
        questions: [question("generated-diagram", true)],
      };
    },
  }));

  await useCase.execute({
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
  });

  assert.deepEqual(
    generationInputs.find(({type}) => type === "plain").input
      .avoidQuestionTexts,
    ["latest-plain", "old-plain"],
  );
  assert.deepEqual(
    generationInputs.find(({type}) => type === "diagram").input
      .avoidQuestionTexts,
    ["latest-diagram"],
  );
});

for (const count of [0, 1, 2, 3, 5]) {
  test(`uses up to three latest matching practices from ${count} completed practices in both runtimes`, async () => {
    const {GenerateAssessmentPractice: WebGenerateAssessmentPractice} = await import(
      "../../../../public/features/practice_generator/application/generate_assessment_practice.js"
    );
    for (const Generator of [GenerateAssessmentPractice, WebGenerateAssessmentPractice]) {
      const reference = (questionId, hasDiagram = false) => ({...question(questionId, hasDiagram), questionId});
      const practices = Array.from({length: count}, (_, index) => ({
        id: `practice-${index + 1}`,
        type: "assessment",
        dateGenerated: new Date(Date.UTC(2026, 10, index + 1)),
        questions: [reference(`plain-${index + 1}`), reference(`diagram-${index + 1}`, true)],
      }));
      const unrelated = [
        {id: "other-topic", questions: [{...reference("other-topic"), topicId: "topic-2"}]},
        {id: "other-syllabus", questions: [{...reference("other-syllabus"), syllabusId: "syllabus-2"}]},
        {id: "other-language", questions: [{...reference("other-language"), language: "Malay"}]},
        {id: "pre-assessment", type: "pre assessment", questions: [reference("pre-assessment")]},
      ].map(practice => ({type: "assessment", dateGenerated: new Date("2026-12-01"), ...practice}));
      const records = new Map([...practices, ...unrelated].map(practice => [practice.id, practice]));
      const useCase = new Generator(createDependencies({
        listCompletedPracticeIds: async () => [...records.keys()],
        getPracticeById: async practiceId => records.get(practiceId),
        getQuestionsForPractice: async references => references.map(ref => ({
          ...ref, questionText: ref.hasDiagram ? "Shared diagram question" : ref.questionId,
        })),
      }));

      const texts = await useCase.loadPreviousPracticeQuestionTexts({
        studentId: "student-1", syllabusId: "syllabus-1", topicId: "topic-1", language: "English",
      });
      assert.deepEqual(texts.withoutDiagram, practices.slice(-3).reverse().map(practice => practice.questions[0].questionId));
      assert.deepEqual(texts.withDiagram, count ? ["Shared diagram question"] : []);
    }
  });
}

test("deletes the new practice when assignment fails", async () => {
  const deletedPracticeIds = [];
  const useCase = new GenerateAssessmentPractice(createDependencies({
    listQuestionsByTopic: async (_syllabusId, _topicId, options) => (
      options.hasDiagram
        ? [question("diagram-1", true)]
        : [question("plain-1"), question("plain-2"), question("plain-3")]
    ),
    assignPracticeToStudent: async () => {
      throw new Error("Assignment failed.");
    },
    deletePractice: async (practiceId) => {
      deletedPracticeIds.push(practiceId);
    },
  }));

  await assert.rejects(
    useCase.execute({
      studentId: "student-1",
      syllabusId: "syllabus-1",
      topicId: "topic-1",
    }),
    /Assignment failed/,
  );
  assert.deepEqual(deletedPracticeIds, ["practice-new"]);
});

test("generation resolves topic/language overrides before reading level criteria", async () => {
 const calls = [];
 const useCase = new GenerateAssessmentPractice(createDependencies({
  getSyllabusAssessmentFrameworkId: async () => assert.fail("Do not use the parent when topic resolution is available"),
  getTopicAssessmentFrameworkId: async scope => {calls.push(scope); return "topic-framework";},
  getAssessmentLevelCriteria: async scope => {assert.equal(scope.assessmentFrameworkId, "topic-framework"); return {criteria: {questionsPerPractice: 4, difficultyLevel: "Easy"}};},
  listQuestionsByTopic: async (syllabusId, topicId, options) => Array.from({length: 4}, (_, index) => question((options.hasDiagram ? "diagram" : "plain") + index, options.hasDiagram)),
  generateQuestions: async () => assert.fail("All questions are reusable"),
  generateQuestionsWithDiagram: async () => assert.fail("All questions are reusable"),
 }));
 await useCase.execute({studentId: "student-1", syllabusId: "syllabus-1", topicId: "topic-1"});
 assert.deepEqual(calls, [{syllabusId: "syllabus-1", topicId: "topic-1", language: "English"}]);
});
