const {
  practiceTypes,
} = require("./practice_schema");

const QUESTIONS_COLLECTION = "questions";
const QUESTION_TOPICS_SUBCOLLECTION = "topics";
const QUESTION_ITEMS_SUBCOLLECTION = "questionItems";

const questionSyllabusDocumentIdPattern = "[syllabus_id]";
const questionTopicDocumentIdPattern = "[topic_id]";
const questionDocumentIdPattern = "[auto_generated_id]";

const questionOptionKeys = {
  A: "a",
  B: "b",
  C: "c",
  D: "d"
};

const questionSchema = {
  collection: QUESTIONS_COLLECTION,
  documentId: questionSyllabusDocumentIdPattern,
  fields: {},
  subcollections: {
    topics: {
      collection: QUESTION_TOPICS_SUBCOLLECTION,
      documentId: questionTopicDocumentIdPattern,
      fields: {},
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
};

module.exports = {
  QUESTIONS_COLLECTION,
  QUESTION_TOPICS_SUBCOLLECTION,
  QUESTION_ITEMS_SUBCOLLECTION,
  questionSyllabusDocumentIdPattern,
  questionTopicDocumentIdPattern,
  questionDocumentIdPattern,
  questionOptionKeys,
  practiceTypes,
  questionSchema
};
