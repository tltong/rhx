import {
  DEFAULT_LLM_PROMPT_CONFIG_ID
} from "../../config/firebase/llm_prompt_config_schema.js?v=20260717-llm-prompt-config";
import {
  FirestoreLlmPromptConfigRepository
} from "./infrastructure/firestore_llm_prompt_config_repository.js?v=20260717-llm-prompt-config";
import {
  GetLlmPromptConfig
} from "./application/get_llm_prompt_config.js?v=20260717-llm-prompt-config";
import {
  ListLlmPromptConfigs
} from "./application/list_llm_prompt_configs.js?v=20260717-llm-prompt-config";
import {
  CreateLlmPromptConfig
} from "./application/create_llm_prompt_config.js?v=20260717-llm-prompt-config";
import {
  UpdateLlmPromptConfig
} from "./application/update_llm_prompt_config.js?v=20260717-llm-prompt-config";
import {
  DeleteLlmPromptConfig
} from "./application/delete_llm_prompt_config.js?v=20260717-llm-prompt-config";

const llmPromptConfigRepository =
  new FirestoreLlmPromptConfigRepository();
const getLlmPromptConfig =
  new GetLlmPromptConfig(llmPromptConfigRepository);
const listLlmPromptConfigsUseCase =
  new ListLlmPromptConfigs(llmPromptConfigRepository);
const createLlmPromptConfig =
  new CreateLlmPromptConfig(llmPromptConfigRepository);
const updateLlmPromptConfig =
  new UpdateLlmPromptConfig(llmPromptConfigRepository);
const deleteLlmPromptConfig =
  new DeleteLlmPromptConfig(llmPromptConfigRepository);

async function requireLlmPromptConfig(llmPromptConfigId) {
  const llmPromptConfig = await getLlmPromptConfigById(llmPromptConfigId);

  if (!llmPromptConfig) {
    throw new Error("LLM prompt config could not be found.");
  }

  return llmPromptConfig;
}

async function saveExistingLlmPromptConfig(llmPromptConfig) {
  await llmPromptConfigRepository.save(llmPromptConfig);

  return llmPromptConfig;
}

async function getLlmPromptConfigById(llmPromptConfigId) {
  return getLlmPromptConfig.execute(llmPromptConfigId);
}

async function getDefaultLlmPromptConfig() {
  const configById = await getLlmPromptConfigById(
    DEFAULT_LLM_PROMPT_CONFIG_ID
  );

  if (configById) {
    return configById;
  }

  return findLlmPromptConfigByIdentifier(DEFAULT_LLM_PROMPT_CONFIG_ID);
}

async function findLlmPromptConfigByIdentifier(identifier) {
  return llmPromptConfigRepository.findByIdentifier(identifier);
}

async function listLlmPromptConfigs() {
  return listLlmPromptConfigsUseCase.execute();
}

async function createLlmPromptConfigRecord(data) {
  return createLlmPromptConfig.execute(data);
}

async function updateLlmPromptConfigRecord(llmPromptConfig, changes) {
  return updateLlmPromptConfig.execute(llmPromptConfig, changes);
}

async function deleteLlmPromptConfigRecord(llmPromptConfigId) {
  return deleteLlmPromptConfig.execute(llmPromptConfigId);
}

async function setPrimaryContext(llmPromptConfigId, primaryContext) {
  const llmPromptConfig = await requireLlmPromptConfig(llmPromptConfigId);

  llmPromptConfig.setPrimaryContext(primaryContext);

  return saveExistingLlmPromptConfig(llmPromptConfig);
}

async function setSecondaryContext(llmPromptConfigId, secondaryContext) {
  const llmPromptConfig = await requireLlmPromptConfig(llmPromptConfigId);

  llmPromptConfig.setSecondaryContext(secondaryContext);

  return saveExistingLlmPromptConfig(llmPromptConfig);
}

async function setOverallAdditionalInstructions(
  llmPromptConfigId,
  overallAdditionalInstructions
) {
  const llmPromptConfig = await requireLlmPromptConfig(llmPromptConfigId);

  llmPromptConfig.setOverallAdditionalInstructions(
    overallAdditionalInstructions
  );

  return saveExistingLlmPromptConfig(llmPromptConfig);
}

async function setPrimaryYearAdditionalInstructions(
  llmPromptConfigId,
  year,
  additionalInstructions
) {
  const llmPromptConfig = await requireLlmPromptConfig(llmPromptConfigId);
  const selectedYear = llmPromptConfigRepository.validateYear(year);

  llmPromptConfig.setYearAdditionalInstructions(
    "primary",
    selectedYear,
    additionalInstructions
  );

  return saveExistingLlmPromptConfig(llmPromptConfig);
}

async function setSecondaryYearAdditionalInstructions(
  llmPromptConfigId,
  year,
  additionalInstructions
) {
  const llmPromptConfig = await requireLlmPromptConfig(llmPromptConfigId);
  const selectedYear = llmPromptConfigRepository.validateYear(year);

  llmPromptConfig.setYearAdditionalInstructions(
    "secondary",
    selectedYear,
    additionalInstructions
  );

  return saveExistingLlmPromptConfig(llmPromptConfig);
}

export {
  getLlmPromptConfigById,
  getDefaultLlmPromptConfig,
  findLlmPromptConfigByIdentifier,
  listLlmPromptConfigs,
  createLlmPromptConfigRecord,
  updateLlmPromptConfigRecord,
  deleteLlmPromptConfigRecord,
  setPrimaryContext,
  setSecondaryContext,
  setOverallAdditionalInstructions,
  setPrimaryYearAdditionalInstructions,
  setSecondaryYearAdditionalInstructions
};
