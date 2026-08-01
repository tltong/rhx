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
import {
  getSyllabusById,
  listSyllabuses
} from "../syllabus/syllabus_module.js?v=20260801-syllabus-topic-instructions";
import {
  FirestoreSyllabusPromptInstructionsRepository
} from "./infrastructure/firestore_syllabus_prompt_instructions_repository.js?v=20260801-syllabus-topic-instructions";
import {
  GetSyllabusPromptInstructions
} from "./application/get_syllabus_prompt_instructions.js?v=20260801-syllabus-topic-instructions";
import {
  SetSyllabusPromptInstructions
} from "./application/set_syllabus_prompt_instructions.js?v=20260801-syllabus-topic-instructions";
import {
  DeleteSyllabusPromptInstructions
} from "./application/delete_syllabus_prompt_instructions.js?v=20260801-syllabus-topic-instructions";
import {
  GetTopicPromptInstructions
} from "./application/get_topic_prompt_instructions.js?v=20260801-syllabus-topic-instructions";
import {
  ListTopicPromptInstructions
} from "./application/list_topic_prompt_instructions.js?v=20260801-syllabus-topic-instructions";
import {
  SetTopicPromptInstructions
} from "./application/set_topic_prompt_instructions.js?v=20260801-syllabus-topic-instructions";
import {
  DeleteTopicPromptInstructions
} from "./application/delete_topic_prompt_instructions.js?v=20260801-syllabus-topic-instructions";
import {
  GetSyllabusTopicPromptInstructions
} from "./application/get_syllabus_topic_prompt_instructions.js?v=20260801-syllabus-topic-instructions";
import {
  LoadSyllabusPromptInstructionOptions
} from "./application/load_syllabus_prompt_instruction_options.js?v=20260801-syllabus-instruction-admin";

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
const syllabusPromptInstructionsRepository =
  new FirestoreSyllabusPromptInstructionsRepository();
const getSyllabusPromptInstructionsUseCase =
  new GetSyllabusPromptInstructions(
    syllabusPromptInstructionsRepository,
    getSyllabusById
  );
const setSyllabusPromptInstructionsUseCase =
  new SetSyllabusPromptInstructions(
    syllabusPromptInstructionsRepository,
    getSyllabusById
  );
const deleteSyllabusPromptInstructionsUseCase =
  new DeleteSyllabusPromptInstructions(
    syllabusPromptInstructionsRepository,
    getSyllabusById
  );
const getTopicPromptInstructionsUseCase = new GetTopicPromptInstructions(
  syllabusPromptInstructionsRepository,
  getSyllabusById
);
const listTopicPromptInstructionsUseCase =
  new ListTopicPromptInstructions(
    syllabusPromptInstructionsRepository,
    getSyllabusById
  );
const setTopicPromptInstructionsUseCase = new SetTopicPromptInstructions(
  syllabusPromptInstructionsRepository,
  getSyllabusById
);
const deleteTopicPromptInstructionsUseCase =
  new DeleteTopicPromptInstructions(
    syllabusPromptInstructionsRepository,
    getSyllabusById
  );
const getSyllabusTopicPromptInstructionsUseCase =
  new GetSyllabusTopicPromptInstructions(
    syllabusPromptInstructionsRepository,
    getSyllabusById
  );
const loadSyllabusPromptInstructionOptionsUseCase =
  new LoadSyllabusPromptInstructionOptions(listSyllabuses);

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

async function getSyllabusPromptInstructions(syllabusId) {
  return getSyllabusPromptInstructionsUseCase.execute(syllabusId);
}

async function setSyllabusPromptInstructions(
  syllabusId,
  additionalInstructions
) {
  return setSyllabusPromptInstructionsUseCase.execute(
    syllabusId,
    additionalInstructions
  );
}

async function deleteSyllabusPromptInstructions(syllabusId) {
  return deleteSyllabusPromptInstructionsUseCase.execute(syllabusId);
}

async function getTopicPromptInstructions(syllabusId, topicId) {
  return getTopicPromptInstructionsUseCase.execute(syllabusId, topicId);
}

async function listTopicPromptInstructions(syllabusId) {
  return listTopicPromptInstructionsUseCase.execute(syllabusId);
}

async function setTopicPromptInstructions(
  syllabusId,
  topicId,
  additionalInstructions
) {
  return setTopicPromptInstructionsUseCase.execute(
    syllabusId,
    topicId,
    additionalInstructions
  );
}

async function deleteTopicPromptInstructions(syllabusId, topicId) {
  return deleteTopicPromptInstructionsUseCase.execute(syllabusId, topicId);
}

async function getSyllabusTopicPromptInstructions(syllabusId, topicId) {
  return getSyllabusTopicPromptInstructionsUseCase.execute(
    syllabusId,
    topicId
  );
}

async function loadSyllabusPromptInstructionOptions() {
  return loadSyllabusPromptInstructionOptionsUseCase.execute();
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
  setSecondaryYearAdditionalInstructions,
  getSyllabusPromptInstructions,
  setSyllabusPromptInstructions,
  deleteSyllabusPromptInstructions,
  getTopicPromptInstructions,
  listTopicPromptInstructions,
  setTopicPromptInstructions,
  deleteTopicPromptInstructions,
  getSyllabusTopicPromptInstructions,
  loadSyllabusPromptInstructionOptions
};
