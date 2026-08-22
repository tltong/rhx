const {
  SYLLABUS_PROMPT_INSTRUCTIONS_COLLECTION,
  SYLLABUS_PROMPT_INSTRUCTION_TOPICS_SUBCOLLECTION,
} = require("../../../schema/syllabus_prompt_instructions_schema");
const {
  readDocument,
} = require("../../../utils/firebase/firebase_ops");
const {
  SyllabusPromptInstructionsRepository,
} = require("../domain/syllabus_prompt_instructions_repository");

function requireIdentifier(value, fieldName) {
  const identifier = String(value || "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function getTopicsCollectionPath(syllabusId) {
  return [
    SYLLABUS_PROMPT_INSTRUCTIONS_COLLECTION,
    syllabusId,
    SYLLABUS_PROMPT_INSTRUCTION_TOPICS_SUBCOLLECTION,
  ].join("/");
}

class FirestoreSyllabusPromptInstructionsRepository
  extends SyllabusPromptInstructionsRepository {
  async getSyllabusInstructions(syllabusId) {
    const id = requireIdentifier(syllabusId, "syllabusId");
    const data = await readDocument(
      SYLLABUS_PROMPT_INSTRUCTIONS_COLLECTION,
      id,
    );

    return data ? String(data.additionalInstructions || "") : "";
  }

  async getTopicInstructions(syllabusId, topicId) {
    const selectedSyllabusId = requireIdentifier(syllabusId, "syllabusId");
    const selectedTopicId = requireIdentifier(topicId, "topicId");
    const data = await readDocument(
      getTopicsCollectionPath(selectedSyllabusId),
      selectedTopicId,
    );

    return data ? String(data.additionalInstructions || "") : "";
  }
}

module.exports = {
  FirestoreSyllabusPromptInstructionsRepository,
};
