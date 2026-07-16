import { LlmPromptConfig } from "../domain/llm_prompt_config.js";
import {
  LlmPromptConfigRepository
} from "../domain/llm_prompt_config_repository.js";
import {
  LLM_PROMPT_CONFIGS_COLLECTION,
  llmPromptConfigLevelTypes,
  llmPromptConfigYearNumbers
} from "../../../config/firebase/llm_prompt_config_schema.js";
import {
  deleteDocument,
  readCollection,
  readDocument,
  writeDocument
} from "../../../utils/firebase/firebase_ops.js";

const LEVEL_TYPES = new Set(llmPromptConfigLevelTypes);
const YEAR_NUMBERS = new Set(llmPromptConfigYearNumbers);

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value.trim();
}

function requireObject(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be a non-null object.`);
  }

  return value;
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function buildConfigId(identifier) {
  const normalizedIdentifier = requireNonEmptyString(
    identifier,
    "identifier"
  );

  return normalizedIdentifier
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "llm_prompt_config";
}

function normalizeYearInstructions(instructions = {}) {
  const source = requireObject(instructions, "year instructions");
  const normalizedInstructions = {};

  Object.entries(source).forEach(([year, value]) => {
    if (!YEAR_NUMBERS.has(year)) {
      throw new Error(`year must be one of: ${llmPromptConfigYearNumbers.join(", ")}.`);
    }

    if (typeof value === "string") {
      normalizedInstructions[year] = {
        additionalInstructions: value
      };
      return;
    }

    const yearInstruction = requireObject(value, `year ${year}`);

    normalizedInstructions[year] = {
      additionalInstructions: normalizeText(
        yearInstruction.additionalInstructions
      )
    };
  });

  return normalizedInstructions;
}

function toLlmPromptConfig(data) {
  if (!data) {
    return null;
  }

  return new LlmPromptConfig({
    id: data.id,
    identifier: data.identifier,
    primaryContext: normalizeText(data.primaryContext),
    secondaryContext: normalizeText(data.secondaryContext),
    overallAdditionalInstructions: normalizeText(
      data.overallAdditionalInstructions
    ),
    primary: normalizeYearInstructions(data.primary || {}),
    secondary: normalizeYearInstructions(data.secondary || {})
  });
}

function toLlmPromptConfigRecord(llmPromptConfig) {
  return {
    identifier: requireNonEmptyString(
      llmPromptConfig.identifier,
      "identifier"
    ),
    primaryContext: normalizeText(llmPromptConfig.primaryContext),
    secondaryContext: normalizeText(llmPromptConfig.secondaryContext),
    overallAdditionalInstructions: normalizeText(
      llmPromptConfig.overallAdditionalInstructions
    ),
    primary: normalizeYearInstructions(llmPromptConfig.primary || {}),
    secondary: normalizeYearInstructions(llmPromptConfig.secondary || {})
  };
}

function requireLevel(level) {
  const selectedLevel = requireNonEmptyString(level, "level").toLowerCase();

  if (!LEVEL_TYPES.has(selectedLevel)) {
    throw new Error(`level must be one of: ${llmPromptConfigLevelTypes.join(", ")}.`);
  }

  return selectedLevel;
}

function requireYear(year) {
  const selectedYear = requireNonEmptyString(String(year), "year");

  if (!YEAR_NUMBERS.has(selectedYear)) {
    throw new Error(`year must be one of: ${llmPromptConfigYearNumbers.join(", ")}.`);
  }

  return selectedYear;
}

export class FirestoreLlmPromptConfigRepository
  extends LlmPromptConfigRepository {
  async getById(llmPromptConfigId) {
    const data = await readDocument(
      LLM_PROMPT_CONFIGS_COLLECTION,
      llmPromptConfigId
    );

    return toLlmPromptConfig(data);
  }

  async findByIdentifier(identifier) {
    const selectedIdentifier = requireNonEmptyString(
      identifier,
      "identifier"
    );
    const configs = await readCollection(
      LLM_PROMPT_CONFIGS_COLLECTION,
      (collection) => collection.where(
        "identifier",
        "==",
        selectedIdentifier
      ).limit(1)
    );

    return toLlmPromptConfig(configs[0] || null);
  }

  async list() {
    const configs = await readCollection(LLM_PROMPT_CONFIGS_COLLECTION);

    return configs
      .map((data) => {
        try {
          return toLlmPromptConfig(data);
        } catch (error) {
          console.warn("Skipping invalid LLM prompt config document.", data?.id, error);
          return null;
        }
      })
      .filter(Boolean)
      .sort((first, second) => first.identifier.localeCompare(second.identifier));
  }

  async save(llmPromptConfig) {
    const record = toLlmPromptConfigRecord(llmPromptConfig);
    const configId = llmPromptConfig.id || buildConfigId(record.identifier);

    await writeDocument(
      LLM_PROMPT_CONFIGS_COLLECTION,
      configId,
      record,
      { merge: false }
    );

    llmPromptConfig.id = configId;

    return llmPromptConfig;
  }

  async delete(llmPromptConfigId) {
    await deleteDocument(LLM_PROMPT_CONFIGS_COLLECTION, llmPromptConfigId);
  }

  validateLevel(level) {
    return requireLevel(level);
  }

  validateYear(year) {
    return requireYear(year);
  }
}
