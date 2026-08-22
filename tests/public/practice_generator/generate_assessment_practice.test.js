import assert from "node:assert/strict";
import test from "node:test";

import {
  GenerateAssessmentPractice
} from "../../../public/features/practice_generator/application/generate_assessment_practice.js";

function question(id, hasDiagram = false) {
  return {
    id,
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    language: "English",
    hasDiagram,
    difficulty: "Easy"
  };
}

function createDependencies(overrides = {}) {
  return {
    getStudentTopicLevel: async () => "level-1",
    getSyllabusAssessmentFrameworkId: async () => "framework-1",
    getAssessmentLevelCriteria: async () => ({
      criteria: {
        questionsPerPractice: 4,
        difficultyLevel: "Easy"
      }
    }),
    getStudentSyllabusSubscriptionLanguage: async () => "English",
    getTopicDiagramPercentage: async () => 25,
    getDefaultLlmPromptConfig: async () => ({ id: "prompt-1" }),
    allocateAssessmentQuestions: () => ({
      totalQuestions: 4,
      diagramPercentage: 25,
      withoutDiagram: 3,
      withDiagram: 1
    }),
    listQuestionsByTopic: async () => [],
    getQuestionsForPractice: async () => [],
    listAssignedPracticeIds: async () => [],
    listCompletedPracticeIds: async () => [],
    getPracticeById: async () => null,
    generateQuestions: async () => ({ prompts: [], questions: [] }),
    generateQuestionsWithDiagram: async () => ({
      prompts: [],
      questions: []
    }),
    createPractice: async (input) => ({
      id: "practice-new",
      ...input
    }),
    deletePractice: async () => {},
    assignPracticeToStudent: async (input) => input,
    assessmentPracticeType: "assessment",
    assessmentFrameworkEndLevelId: "framework-complete",
    ...overrides
  };
}

test("reuses eligible questions and generates only the shortage", async () => {
  const generatedInputs = [];
  const listedOptions = [];
  const createdPractices = [];
  let diagramGeneratorCalls = 0;
  let promptConfigCalls = 0;
  const dependencies = createDependencies({
    getDefaultLlmPromptConfig: async () => {
      promptConfigCalls += 1;
      return { id: "prompt-1" };
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
            questionId: "used-1"
          }]
        }
        : {
          id: practiceId,
          type: "pre assessment",
          questions: [{
            syllabusId: "syllabus-1",
            topicId: "topic-1",
            questionId: "pre-1"
          }]
        }
    ),
    getQuestionsForPractice: async (references) => {
      assert.equal(references.length, 1);
      return [question("used-1")];
    },
    listQuestionsByTopic: async (_syllabusId, _topicId, options) => {
      listedOptions.push(options);

      return options.hasDiagram
        ? [question("diagram-reuse", true)]
        : [question("used-1"), question("plain-reuse")];
    },
    generateQuestions: async (_configId, _syllabusId, input) => {
      generatedInputs.push(input);
      return {
        prompts: ["plain prompt"],
        questions: [question("generated-1"), question("generated-2")]
      };
    },
    generateQuestionsWithDiagram: async () => {
      diagramGeneratorCalls += 1;
      return { prompts: [], questions: [] };
    },
    createPractice: async (input) => {
      createdPractices.push(input);
      return {
        id: "practice-new",
        ...input
      };
    }
  });
  const useCase = new GenerateAssessmentPractice(dependencies);

  const result = await useCase.execute({
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1"
  });

  assert.equal(promptConfigCalls, 1);
  assert.equal(diagramGeneratorCalls, 0);
  assert.equal(generatedInputs.length, 1);
  assert.equal(generatedInputs[0].numberOfQuestions, 2);
  assert.equal(generatedInputs[0].difficultyLevel, "Easy");
  assert.ok(listedOptions.every((options) => options.difficulty === "Easy"));
  assert.deepEqual(
    result.questions.map((item) => item.id),
    ["plain-reuse", "generated-1", "generated-2", "diagram-reuse"]
  );
  assert.equal(result.questionSets.withoutDiagram.reusedQuestionCount, 1);
  assert.equal(result.questionSets.withoutDiagram.generatedQuestionCount, 2);
  assert.equal(result.questionSets.withDiagram.reusedQuestionCount, 1);
  assert.equal(result.questionSets.withDiagram.generatedQuestionCount, 0);
  assert.equal(createdPractices.length, 1);
  assert.deepEqual(
    createdPractices[0].questions.map((item) => item.questionId),
    ["plain-reuse", "generated-1", "generated-2", "diagram-reuse"]
  );
  assert.equal(result.practice.id, "practice-new");
  assert.deepEqual(result.assignment, {
    studentId: "student-1",
    practiceId: "practice-new"
  });
});

test("does not load prompt config or invoke the LLM when all questions exist", async () => {
  let promptConfigCalls = 0;
  let generatorCalls = 0;
  const useCase = new GenerateAssessmentPractice(createDependencies({
    getDefaultLlmPromptConfig: async () => {
      promptConfigCalls += 1;
      return { id: "prompt-1" };
    },
    listQuestionsByTopic: async (_syllabusId, _topicId, options) => (
      options.hasDiagram
        ? [question("diagram-1", true)]
        : [question("plain-1"), question("plain-2"), question("plain-3")]
    ),
    generateQuestions: async () => {
      generatorCalls += 1;
      return { prompts: [], questions: [] };
    },
    generateQuestionsWithDiagram: async () => {
      generatorCalls += 1;
      return { prompts: [], questions: [] };
    }
  }));

  const result = await useCase.execute({
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1"
  });

  assert.equal(promptConfigCalls, 0);
  assert.equal(generatorCalls, 0);
  assert.equal(result.questions.length, 4);
});

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
    }
  }));

  await assert.rejects(
    useCase.execute({
      studentId: "student-1",
      syllabusId: "syllabus-1",
      topicId: "topic-1"
    }),
    /Assignment failed/
  );
  assert.deepEqual(deletedPracticeIds, ["practice-new"]);
});
