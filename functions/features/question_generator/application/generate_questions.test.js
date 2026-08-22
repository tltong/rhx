const assert = require("node:assert/strict");
const test = require("node:test");

const {
  GenerateQuestions,
} = require("./generate_questions");
const {
  normalizeQuestionGenerationInput,
} = require("../domain/question_generation");

function createLlmQuestion(index, hasDiagram) {
  return {
    questionText: `Question ${index}`,
    topicName: "Numbers",
    hasDiagram,
    ...(hasDiagram
      ? { diagram: { mermaidCode: "flowchart TD; A --> B" } }
      : {}),
    options: {
      a: "One",
      b: "Two",
      c: "Three",
      d: "Four",
    },
    correctAnswer: "a",
    answerExplanation: "One is correct.",
    difficulty: "Easy",
    language: "English",
  };
}

test("diagram generation renders SVG and stores batches of at most five", async () => {
  const requestedBatchSizes = [];
  const avoidLists = [];
  const storedInputs = [];
  const useCase = new GenerateQuestions({
    generatePrompt: async (_configId, _syllabusId, input) => {
      requestedBatchSizes.push(input.numberOfQuestions);
      avoidLists.push([...input.avoidQuestionTexts]);
      return `Generate ${input.numberOfQuestions}`;
    },
    generateLlmText: async (prompt) => {
      const count = Number(prompt.split(" ").at(-1));

      return {
        questions: Array.from(
          { length: count },
          (_, index) => createLlmQuestion(index + 1, true),
        ),
      };
    },
    getSyllabusById: async () => ({
      id: "syllabus-1",
      languages: ["English"],
      topics: [{ id: "topic-1", topicName: "Numbers", subtopics: {} }],
    }),
    writeQuestions: async (inputs) => {
      storedInputs.push(...inputs);
      return inputs.map((input, index) => ({ ...input, id: `q-${index + 1}` }));
    },
    renderMermaidDiagram: async () => ({ svg: "<svg></svg>" }),
    hasDiagram: true,
    llmOptions: { model: "deepseek-v4-pro" },
  });

  const result = await useCase.execute("default", "syllabus-1", {
    numberOfQuestions: 7,
    difficultyLevel: "Easy",
    language: "English",
    group: "assessment",
    topicId: "topic-1",
    avoidQuestionTexts: ["Previous practice question"],
  });

  assert.deepEqual(requestedBatchSizes, [5, 2]);
  assert.deepEqual(avoidLists, [
    ["Previous practice question"],
    [
      "Previous practice question",
      "Question 1",
      "Question 2",
      "Question 3",
      "Question 4",
      "Question 5",
    ],
  ]);
  assert.equal(result.prompts.length, 2);
  assert.equal(result.questions.length, 7);
  assert.equal(storedInputs.length, 7);
  assert.ok(storedInputs.every((question) => question.svg === "<svg></svg>"));
  assert.ok(storedInputs.every((question) => !("mermaidCode" in question)));
});

test("pre-assessment normal generation ignores avoidance texts", () => {
  const input = normalizeQuestionGenerationInput({
    numberOfQuestions: 1,
    difficultyLevel: "Easy",
    language: "English",
    group: "pre assessment",
    topicId: "topic-1",
    avoidQuestionTexts: ["Must not enter the planned path"],
  });

  assert.deepEqual(input.avoidQuestionTexts, []);
});
