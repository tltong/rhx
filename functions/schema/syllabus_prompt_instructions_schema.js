const SYLLABUS_PROMPT_INSTRUCTIONS_COLLECTION =
  "syllabusPromptInstructions";
const SYLLABUS_PROMPT_INSTRUCTION_TOPICS_SUBCOLLECTION = "topics";

const syllabusPromptInstructionDocumentIdPattern = "[syllabus_id]";
const syllabusPromptInstructionTopicDocumentIdPattern = "[topic_id]";

const syllabusPromptInstructionsSchema = {
  collection: SYLLABUS_PROMPT_INSTRUCTIONS_COLLECTION,
  documentId: syllabusPromptInstructionDocumentIdPattern,
  fields: {
    additionalInstructions: "string",
  },
  subcollections: {
    topics: {
      collection: SYLLABUS_PROMPT_INSTRUCTION_TOPICS_SUBCOLLECTION,
      documentId: syllabusPromptInstructionTopicDocumentIdPattern,
      fields: {
        additionalInstructions: "string",
      },
    },
  },
};

module.exports = {
  SYLLABUS_PROMPT_INSTRUCTIONS_COLLECTION,
  SYLLABUS_PROMPT_INSTRUCTION_TOPICS_SUBCOLLECTION,
  syllabusPromptInstructionDocumentIdPattern,
  syllabusPromptInstructionTopicDocumentIdPattern,
  syllabusPromptInstructionsSchema,
};
