import {ESSAY_SCORING_PROMPT_TEMPLATE, ESSAY_SCORING_REQUIRED_INSTRUCTIONS} from "../config/essay_scoring_prompt_template.js?v=20261020-scoring-config-v1";
import {normalizeConfiguration, createDefaultConfiguration} from "../domain/essay_scoring_config.js?v=20261020-scoring-config-v1";
import {ESSAY_SCORING_LEVELS, ESSAY_SCORING_GRADES} from "../../../config/firebase/essay_scoring_schema.js?v=20261020-scoring-config-v1";

function buildEssayScoringInstructions({level, grade}, configuration = createDefaultConfiguration()) {
  if (!ESSAY_SCORING_LEVELS.includes(level) || !ESSAY_SCORING_GRADES.includes(grade)) throw new Error("Select a valid level and grade.");
  const config = normalizeConfiguration({...configuration});
  const gradeInstructions = config.gradeInstructions[level][grade];
  return [
    "Base marking instructions:\n" + config.markingInstructions,
    config.additionalLlmInstructions ? "Global additional instructions:\n" + config.additionalLlmInstructions : "",
    gradeInstructions ? "Grade instructions (" + level + " grade " + grade + "):\n" + gradeInstructions : "",
    "Required response rules:\n" + ESSAY_SCORING_REQUIRED_INSTRUCTIONS,
  ].filter(Boolean).join("\n\n");
}

function buildEssayScoringPrompt(question, answer, configuration = createDefaultConfiguration()) {
  const reference = {
    level: question.level,
    grade: question.standard,
    language: question.language,
    difficulty: question.difficulty,
    question: question.questionText,
    wordCountRequirement: question.wordCountRequirement ?? {minWords: null},
    answer,
  };
  const replacements = {scoringInstructions: buildEssayScoringInstructions({level: question.level, grade: question.standard}, configuration),
    essayDataJson: JSON.stringify(reference, null, 2)};
  return ESSAY_SCORING_PROMPT_TEMPLATE.replace(/\{\{(scoringInstructions|essayDataJson)\}\}/g, (_match, key) => replacements[key]);
}

export {buildEssayScoringPrompt, buildEssayScoringInstructions};

