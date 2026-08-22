const {
  LLM_PROMPT_CONFIGS_COLLECTION,
} = require("../../../schema/llm_prompt_config_schema");
const {
  readCollection,
  readDocument,
} = require("../../../utils/firebase/firebase_ops");
const {
  LlmPromptConfig,
} = require("../domain/llm_prompt_config");
const {
  LlmPromptConfigRepository,
} = require("../domain/llm_prompt_config_repository");

function toLlmPromptConfig(data) {
  return data ? new LlmPromptConfig(data) : null;
}

class FirestoreLlmPromptConfigRepository extends LlmPromptConfigRepository {
  async getById(llmPromptConfigId) {
    const id = String(llmPromptConfigId || "").trim();

    if (!id) {
      throw new Error("llmPromptConfigId is required.");
    }

    return toLlmPromptConfig(
      await readDocument(LLM_PROMPT_CONFIGS_COLLECTION, id),
    );
  }

  async list() {
    const configs = await readCollection(LLM_PROMPT_CONFIGS_COLLECTION);

    return configs
      .map(toLlmPromptConfig)
      .sort((first, second) => first.identifier.localeCompare(second.identifier));
  }
}

module.exports = {
  FirestoreLlmPromptConfigRepository,
};
