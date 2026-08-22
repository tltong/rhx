const {
  getSyllabusById,
} = require("../syllabus/syllabus_module");
const {
  DEFAULT_LLM_PROMPT_CONFIG_ID,
} = require("../../schema/llm_prompt_config_schema");
const {
  GetLlmPromptConfig,
} = require("./application/get_llm_prompt_config");
const {
  GetSyllabusTopicPromptInstructions,
} = require("./application/get_syllabus_topic_prompt_instructions");
const {
  ListLlmPromptConfigs,
} = require("./application/list_llm_prompt_configs");
const {
  FirestoreLlmPromptConfigRepository,
} = require("./infrastructure/firestore_llm_prompt_config_repository");
const {
  FirestoreSyllabusPromptInstructionsRepository,
} = require(
  "./infrastructure/firestore_syllabus_prompt_instructions_repository"
);

const llmPromptConfigRepository = new FirestoreLlmPromptConfigRepository();
const syllabusPromptInstructionsRepository =
  new FirestoreSyllabusPromptInstructionsRepository();
const getLlmPromptConfigUseCase =
  new GetLlmPromptConfig(llmPromptConfigRepository);
const listLlmPromptConfigsUseCase =
  new ListLlmPromptConfigs(llmPromptConfigRepository);
const getSyllabusTopicPromptInstructionsUseCase =
  new GetSyllabusTopicPromptInstructions(
    syllabusPromptInstructionsRepository,
    getSyllabusById,
  );

async function getLlmPromptConfigById(llmPromptConfigId) {
  return getLlmPromptConfigUseCase.execute(llmPromptConfigId);
}

async function getDefaultLlmPromptConfig() {
  const configById = await getLlmPromptConfigById(
    DEFAULT_LLM_PROMPT_CONFIG_ID,
  );

  if (configById) {
    return configById;
  }

  const configs = await listLlmPromptConfigs();

  return configs.find((config) => (
    config.identifier === DEFAULT_LLM_PROMPT_CONFIG_ID
  )) || null;
}

async function listLlmPromptConfigs() {
  return listLlmPromptConfigsUseCase.execute();
}

async function getSyllabusTopicPromptInstructions(syllabusId, topicId) {
  return getSyllabusTopicPromptInstructionsUseCase.execute(
    syllabusId,
    topicId,
  );
}

module.exports = {
  getDefaultLlmPromptConfig,
  getLlmPromptConfigById,
  getSyllabusTopicPromptInstructions,
  listLlmPromptConfigs,
};
