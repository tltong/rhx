import {ESSAY_SCORING_PROMPT_TEMPLATE} from "../config/essay_scoring_prompt_template.js?v=20261018-essay-review-comment-v1";

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

export {buildEssayScoringPrompt};

