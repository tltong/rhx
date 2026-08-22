import {
  practiceTypes
} from "./practice_schema.js";

export { practiceTypes };

export const QUESTIONS_COLLECTION = "questions";
export const QUESTION_TOPICS_SUBCOLLECTION = "topics";
export const QUESTION_LANGUAGES_SUBCOLLECTION = "languages";
export const QUESTION_DIAGRAM_GROUPS_SUBCOLLECTION = "diagramGroups";
export const QUESTION_ITEMS_SUBCOLLECTION = "questionItems";

export const questionSyllabusDocumentIdPattern = "[syllabus_id]";
export const questionTopicDocumentIdPattern = "[topic_id]";
export const questionLanguageDocumentIdPattern = "[language_id]";
export const questionDiagramGroupDocumentIdPattern = "[diagram_group]";
export const questionDocumentIdPattern = "[auto_generated_id]";

export const questionDiagramGroups = Object.freeze({
  WITH_DIAGRAM: "withDiagram",
  WITHOUT_DIAGRAM: "withoutDiagram"
});

export const questionOptionKeys = {
  A: "a",
  B: "b",
  C: "c",
  D: "d"
};

export const questionSchema = {
  collection: QUESTIONS_COLLECTION,
  documentId: questionSyllabusDocumentIdPattern,
  fields: {},
  subcollections: {
    topics: {
      collection: QUESTION_TOPICS_SUBCOLLECTION,
      documentId: questionTopicDocumentIdPattern,
      fields: {},
      subcollections: {
        languages: {
          collection: QUESTION_LANGUAGES_SUBCOLLECTION,
          documentId: questionLanguageDocumentIdPattern,
          fields: {
            language: "string"
          },
          subcollections: {
            diagramGroups: {
              collection: QUESTION_DIAGRAM_GROUPS_SUBCOLLECTION,
              documentId: questionDiagramGroupDocumentIdPattern,
              fields: {
                hasDiagram: "boolean"
              },
              subcollections: {
                questionItems: {
                  collection: QUESTION_ITEMS_SUBCOLLECTION,
                  documentId: questionDocumentIdPattern,
                  fields: {
                    questionText: "string",
                    options: {
                      type: "map",
                      fields: {
                        a: "string",
                        b: "string",
                        c: "string",
                        d: "string"
                      }
                    },
                    correctAnswer: "string",
                    group: {
                      type: "string",
                      enum: Object.values(practiceTypes)
                    },
                    hasDiagram: "boolean",
                    svg: "string",
                    explanation: "string",
                    difficulty: "string",
                    specialInstruction: "string",
                    language: "string",
                    syllabusId: "string",
                    topicId: "string"
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

export default {
  QUESTIONS_COLLECTION,
  QUESTION_TOPICS_SUBCOLLECTION,
  QUESTION_LANGUAGES_SUBCOLLECTION,
  QUESTION_DIAGRAM_GROUPS_SUBCOLLECTION,
  QUESTION_ITEMS_SUBCOLLECTION,
  questionSyllabusDocumentIdPattern,
  questionTopicDocumentIdPattern,
  questionLanguageDocumentIdPattern,
  questionDiagramGroupDocumentIdPattern,
  questionDocumentIdPattern,
  questionDiagramGroups,
  questionOptionKeys,
  practiceTypes,
  questionSchema
};
