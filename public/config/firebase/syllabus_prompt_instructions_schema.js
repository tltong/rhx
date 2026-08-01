export const SYLLABUS_PROMPT_INSTRUCTIONS_COLLECTION =
  "syllabusPromptInstructions";
export const SYLLABUS_PROMPT_INSTRUCTION_TOPICS_SUBCOLLECTION = "topics";

export const syllabusPromptInstructionDocumentIdPattern = "[syllabus_id]";
export const syllabusPromptInstructionTopicDocumentIdPattern = "[topic_id]";

export const syllabusPromptInstructionsSchema = {
  collection: SYLLABUS_PROMPT_INSTRUCTIONS_COLLECTION,
  documentId: syllabusPromptInstructionDocumentIdPattern,
  fields: {
    additionalInstructions: "string"
  },
  subcollections: {
    topics: {
      collection: SYLLABUS_PROMPT_INSTRUCTION_TOPICS_SUBCOLLECTION,
      documentId: syllabusPromptInstructionTopicDocumentIdPattern,
      fields: {
        additionalInstructions: "string"
      }
    }
  }
};

export default {
  SYLLABUS_PROMPT_INSTRUCTIONS_COLLECTION,
  SYLLABUS_PROMPT_INSTRUCTION_TOPICS_SUBCOLLECTION,
  syllabusPromptInstructionDocumentIdPattern,
  syllabusPromptInstructionTopicDocumentIdPattern,
  syllabusPromptInstructionsSchema
};
