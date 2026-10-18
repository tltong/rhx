import {normalizeGenerationInput} from "../domain/essay_question.js?v=20261017-essay-grade-min-words-v1";
import {normalizeConfiguration} from "../domain/essay_question_generator_config.js?v=20261017-essay-grade-min-words-v1";
import {ESSAY_QUESTION_PROMPT_TEMPLATE} from "../config/essay_question_prompt_template.js?v=20261017-essay-grade-min-words-v1";


function buildEssayQuestionPrompt(input, configuration) {
  const {level, standard, language, difficulty, seed} = normalizeGenerationInput(input);
  const config = normalizeConfiguration({...configuration});
  const sections = [
    ESSAY_QUESTION_PROMPT_TEMPLATE,
    "Target learner:\n" + JSON.stringify({level, standard, language, difficulty}),
  ];
  if (config.additionalLlmInstructions) sections.push("Common additional instructions:\n" + config.additionalLlmInstructions);
  if (config.gradeInstructions[level][standard]) sections.push("Additional instructions for " + level + " standard " + standard + ":\n" + config.gradeInstructions[level][standard]);
  if (config.difficultyInstructions[difficulty]) sections.push("Additional instructions for " + difficulty + " difficulty:\n" + config.difficultyInstructions[difficulty]);
  const requirement = config.gradeWordCountRequirements[level][standard];
  sections.push("Direct essay word-count requirement:\n" + JSON.stringify(requirement) + "\n"
    + (requirement.minWords === null
      ? "No minimum word count is configured. Do not include an essay word-count requirement in questionText."
      : "The student's essay must contain at least " + requirement.minWords + " words. Explicitly include this minimum in the student-facing questionText in the requested language. This minimum applies to the student's essay, not the length of the generated question. Do not add a maximum word count."));
  sections.push("Caller-supplied seed (JSON string):\n" + JSON.stringify(seed));
  return sections.join("\n\n");
}


export {buildEssayQuestionPrompt};
