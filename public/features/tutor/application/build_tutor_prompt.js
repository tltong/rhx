import {TUTOR_LLM_PROMPT_TEMPLATE} from "../config/tutor_prompt_template.js?v=20261015-tutor-simple-answers-v1";
import {requireMiniQuestionCount} from "../domain/tutor_config.js?v=20261014-tutor-config-v1";
import {tutorQuestionData} from "../domain/tutor_guide_version.js?v=20261109-shared-tutor-v1";

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

export {buildTutorPrompt};
