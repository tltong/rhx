const {ESSAY_SCORING_PROMPT_TEMPLATE} = require("../config/essay_scoring_prompt_template");

function buildEssayScoringPrompt(question, answer) {
  const reference = {
    level: question.level,
    grade: question.standard,
    language: question.language,
    difficulty: question.difficulty,
    question: question.questionText,
    wordCountRequirement: question.wordCountRequirement ?? {minWords: null},
    answer,
  };
  return ESSAY_SCORING_PROMPT_TEMPLATE.replace("{{essayDataJson}}", () => JSON.stringify(reference, null, 2));
}

module.exports = {buildEssayScoringPrompt};

