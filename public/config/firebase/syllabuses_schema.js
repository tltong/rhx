export const SYLLABUSES_COLLECTION = "syllabuses";
export const SYLLABUS_TOPICS_SUBCOLLECTION = "topics";

export const syllabusDocumentIdPattern = "[auto_generated_id]";
export const syllabusTopicDocumentIdPattern = "[auto_generated_id]";
export const syllabusSubtopicIdPattern = "[auto_generated_subtopic_id]";

export const syllabusesSchema = {
  collection: SYLLABUSES_COLLECTION,
  documentId: syllabusDocumentIdPattern,
  fields: {
    country: "string",
    level: "string",
    grade: "number",
    subject: "string"
  },
  subcollections: {
    topics: {
      collection: SYLLABUS_TOPICS_SUBCOLLECTION,
      documentId: syllabusTopicDocumentIdPattern,
      fields: {
        topicName: "string",
        subtopics: {
          type: "map",
          entries: {
            [syllabusSubtopicIdPattern]: "string"
          }
        }
      }
    }
  }
};

export default {
  SYLLABUSES_COLLECTION,
  SYLLABUS_TOPICS_SUBCOLLECTION,
  syllabusDocumentIdPattern,
  syllabusTopicDocumentIdPattern,
  syllabusSubtopicIdPattern,
  syllabusesSchema
};
