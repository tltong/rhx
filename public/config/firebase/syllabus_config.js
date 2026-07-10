import {
  syllabusStandards,
  syllabusSubjects
} from "../syllabus_scope.js";

export {
  syllabusStandards,
  syllabusSubjects
} from "../syllabus_scope.js";

export const SYLLABUSES_COLLECTION = "syllabuses";
export const SYLLABUS_TOPICS_SUBCOLLECTION = "topics";

export const syllabusDocumentIdPattern = "[standard]_[subject]";
export const syllabusTopicDocumentIdPattern = "[auto_generated_id]";
export const syllabusSubtopicIdPattern = "subtopic_[number]";
export const syllabusDocumentIds = Object.freeze(
  syllabusStandards.flatMap((standard) =>
    syllabusSubjects.map((subject) => `${standard}_${subject}`)
  )
);
export const syllabusTopicCollectionPathPattern = `${SYLLABUSES_COLLECTION}/${syllabusDocumentIdPattern}/${SYLLABUS_TOPICS_SUBCOLLECTION}`;
export const syllabusTopicDocumentPathPattern = `${syllabusTopicCollectionPathPattern}/${syllabusTopicDocumentIdPattern}`;
export const syllabusTopicCollectionPaths = Object.freeze(
  syllabusDocumentIds.map((syllabusDocumentId) =>
    `${SYLLABUSES_COLLECTION}/${syllabusDocumentId}/${SYLLABUS_TOPICS_SUBCOLLECTION}`
  )
);

export const syllabusSchema = {
  collection: SYLLABUSES_COLLECTION,
  documentId: syllabusDocumentIdPattern,
  allowedDocumentIds: syllabusDocumentIds,
  fields: {
    standard: {
      type: "string",
      allowedValues: syllabusStandards
    },
    subject: {
      type: "string",
      allowedValues: syllabusSubjects
    }
  },
  subcollections: {
    topics: {
      collection: SYLLABUS_TOPICS_SUBCOLLECTION,
      documentId: syllabusTopicDocumentIdPattern,
      collectionPathPattern: syllabusTopicCollectionPathPattern,
      documentPathPattern: syllabusTopicDocumentPathPattern,
      allowedCollectionPaths: syllabusTopicCollectionPaths,
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
  syllabusStandards,
  syllabusSubjects,
  syllabusDocumentIdPattern,
  syllabusTopicDocumentIdPattern,
  syllabusSubtopicIdPattern,
  syllabusDocumentIds,
  syllabusTopicCollectionPathPattern,
  syllabusTopicDocumentPathPattern,
  syllabusTopicCollectionPaths,
  syllabusSchema
};
