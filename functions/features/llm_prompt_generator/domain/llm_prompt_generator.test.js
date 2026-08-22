const assert = require("node:assert/strict");
const test = require("node:test");

const {
  LlmPromptGenerator,
} = require("./llm_prompt_generator");

function createInput() {
  return {
    llmPromptConfig: {
      primaryContext: "Primary context",
      secondaryContext: "Secondary context",
      overallAdditionalInstructions: "",
      primary: {1: {additionalInstructions: ""}},
      secondary: {},
    },
    syllabus: {
      country: "Malaysia",
      level: "primary",
      year: 1,
      subject: "Mathematics",
      languages: ["English"],
      topics: [{id: "topic-1", topicName: "Numbers", subtopics: {}}],
    },
    topicId: "topic-1",
    language: "English",
  };
}

test("normal prompt includes previous-practice question texts", () => {
  const generator = new LlmPromptGenerator();
  const prompt = generator.generate({
    ...createInput(),
    numberOfQuestions: 2,
    difficultyLevel: "Easy",
    avoidQuestionTexts: ["Previous question one"],
  });

  assert.match(prompt, /Previous practice question texts to avoid/);
  assert.match(prompt, /Previous question one/);
});

test("planned prompt does not include normal avoidance texts", () => {
  const generator = new LlmPromptGenerator();
  const prompt = generator.generateFromPlan({
    ...createInput(),
    categories: [{
      numberOfQuestions: 2,
      difficultyLevel: "Easy",
      hasDiagram: false,
    }],
    avoidQuestionTexts: ["Must not appear"],
  });

  assert.doesNotMatch(prompt, /Previous practice question texts to avoid/);
  assert.doesNotMatch(prompt, /Must not appear/);
});
