const LLM_PROMPT_CONFIGS_COLLECTION = "llmPromptConfigs";

const DEFAULT_LLM_PROMPT_CONFIG_ID = "default";
const llmPromptConfigDocumentIdPattern = "[config_id]";
const llmPromptConfigYearIdPattern = "[year_number]";

const llmPromptConfigLevelTypes = Object.freeze([
  "primary",
  "secondary"
]);

const llmPromptConfigYearNumbers = Object.freeze([
  "1",
  "2",
  "3",
  "4",
  "5",
  "6"
]);

const llmPromptConfigYearInstructionsSchema = {
  type: "map",
  allowedKeys: llmPromptConfigYearNumbers,
  entries: {
    [llmPromptConfigYearIdPattern]: {
      type: "map",
      fields: {
        additionalInstructions: "string"
      }
    }
  }
};

const llmPromptConfigSchema = {
  collection: LLM_PROMPT_CONFIGS_COLLECTION,
  documentId: llmPromptConfigDocumentIdPattern,
  fields: {
    identifier: "string",
    primaryContext: "string",
    secondaryContext: "string",
    overallAdditionalInstructions: "string",
    primary: llmPromptConfigYearInstructionsSchema,
    secondary: llmPromptConfigYearInstructionsSchema
  }
};

module.exports = {
  LLM_PROMPT_CONFIGS_COLLECTION,
  DEFAULT_LLM_PROMPT_CONFIG_ID,
  llmPromptConfigDocumentIdPattern,
  llmPromptConfigYearIdPattern,
  llmPromptConfigLevelTypes,
  llmPromptConfigYearNumbers,
  llmPromptConfigYearInstructionsSchema,
  llmPromptConfigSchema
};
