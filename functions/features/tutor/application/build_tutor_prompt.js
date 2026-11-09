const {TUTOR_LLM_PROMPT_TEMPLATE} = require("../config/tutor_prompt_template");
const {requireMiniQuestionCount} = require("../domain/tutor_config");
const {tutorQuestionData} = require("../domain/tutor_guide_version");

function buildTutorPrompt({question, configuration, language}) {
  const miniQuestionCount = requireMiniQuestionCount(configuration.miniQuestionCount);
  const questionData = tutorQuestionData(question);
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
