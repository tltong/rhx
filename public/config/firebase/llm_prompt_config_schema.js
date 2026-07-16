export const LLM_PROMPT_CONFIGS_COLLECTION = "llmPromptConfigs";

export const DEFAULT_LLM_PROMPT_CONFIG_ID = "default";
export const llmPromptConfigDocumentIdPattern = "[config_id]";
export const llmPromptConfigYearIdPattern = "[year_number]";

export const llmPromptConfigLevelTypes = Object.freeze([
  "primary",
  "secondary"
]);

export const llmPromptConfigYearNumbers = Object.freeze([
  "1",
  "2",
  "3",
  "4",
  "5",
  "6"
]);

export const llmPromptConfigYearInstructionsSchema = {
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

export const llmPromptConfigSchema = {
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

export default {
  LLM_PROMPT_CONFIGS_COLLECTION,
  DEFAULT_LLM_PROMPT_CONFIG_ID,
  llmPromptConfigDocumentIdPattern,
  llmPromptConfigYearIdPattern,
  llmPromptConfigLevelTypes,
  llmPromptConfigYearNumbers,
  llmPromptConfigYearInstructionsSchema,
  llmPromptConfigSchema
};
