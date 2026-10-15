const {TUTOR_LLM_PROMPT_TEMPLATE} = require("../config/tutor_prompt_template");
const {requireMiniQuestionCount} = require("../domain/tutor_config");

function buildTutorPrompt({question, configuration, language}) {
  const miniQuestionCount = requireMiniQuestionCount(configuration.miniQuestionCount);
  const correctAnswerText = question.options?.[question.correctAnswer];
  if (typeof correctAnswerText !== "string" || !correctAnswerText.trim()) {
    throw new Error("Original question must have a valid correct answer.");
  }
  if (question.hasDiagram && (typeof question.svg !== "string" || !question.svg.trim())) {
    throw new Error("Original diagram question must include SVG.");
  }
  const questionData = {
    questionText: question.questionText,
    options: question.options,
    correctAnswer: question.correctAnswer,
    correctAnswerText,
    explanation: question.explanation,
    language: question.language,
    difficulty: question.difficulty,
    specialInstruction: question.specialInstruction,
    hasDiagram: question.hasDiagram,
    svg: question.hasDiagram ? question.svg : "",
  };
  const values = {
    language, miniQuestionCount: String(miniQuestionCount),
    promptInstructions: configuration.promptInstructions,
    questionDataJson: JSON.stringify(questionData, null, 2),
  };
  // Replace once using a callback: dollar signs and nested placeholders in
  // question data or administrator instructions must remain literal.
  return TUTOR_LLM_PROMPT_TEMPLATE.replace(
    /{{(language|miniQuestionCount|promptInstructions|questionDataJson)}}/g,
    (_placeholder, name) => values[name],
  );
}

module.exports = {buildTutorPrompt};
