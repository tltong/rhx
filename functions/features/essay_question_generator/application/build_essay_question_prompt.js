const {normalizeGenerationInput} = require("../domain/essay_question");
const {normalizeConfiguration} = require("../domain/essay_question_generator_config");
const {ESSAY_QUESTION_PROMPT_TEMPLATE, ESSAY_IMAGE_PROMPT_INSTRUCTIONS} = require("../config/essay_question_prompt_template");


function buildEssayQuestionPrompt(input, configuration) {
  const {level, standard, language, difficulty, seed} = normalizeGenerationInput(input);
  const config = normalizeConfiguration({...configuration});
  const sections = [
    ESSAY_QUESTION_PROMPT_TEMPLATE,
    "Target learner:\n" + JSON.stringify({level, standard, language, difficulty}),
  ];
  if (input.syllabusId !== undefined) sections.push("Required syllabus topic context (JSON data). The writing task must assess this topic:\n" + JSON.stringify({syllabusId: input.syllabusId, topicId: input.topicId, topicName: input.topicName, subject: input.subject}));
  if (config.additionalLlmInstructions) sections.push("Common additional instructions:\n" + config.additionalLlmInstructions);
  if (config.gradeInstructions[level][standard]) sections.push("Additional instructions for " + level + " standard " + standard + ":\n" + config.gradeInstructions[level][standard]);
  if (config.difficultyInstructions[difficulty]) sections.push("Additional instructions for " + difficulty + " difficulty:\n" + config.difficultyInstructions[difficulty]);
  sections.push("Picture composition enabled: " + config.gradeSupport[level][standard].pictureEnabled);
  const requirement = config.gradeWordCountRequirements[level][standard];
  sections.push("Direct essay word-count requirement:\n" + JSON.stringify(requirement) + "\n"
    + (requirement.minWords === null
      ? "No minimum word count is configured. Do not include an essay word-count requirement in questionText."
      : "The student's essay must contain at least " + requirement.minWords + " words. Explicitly include this minimum in the student-facing questionText in the requested language. This minimum applies to the student's essay, not the length of the generated question. Do not add a maximum word count."));
  sections.push("Caller-supplied seed (JSON string):\n" + JSON.stringify(seed));
  sections.push(config.gradeSupport[level][standard].pictureEnabled
    ? ESSAY_IMAGE_PROMPT_INSTRUCTIONS
    : 'Required output format: {"questionText":"Complete essay question and writing instructions."}');
  return sections.join("\n\n");
}


module.exports = {buildEssayQuestionPrompt};
