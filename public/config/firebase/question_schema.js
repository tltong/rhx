export const QUESTIONS_COLLECTION = "questions";
export const QUESTION_TOPICS_SUBCOLLECTION = "topics";
export const QUESTION_ITEMS_SUBCOLLECTION = "questionItems";

export const questionSyllabusDocumentIdPattern = "[syllabus_id]";
export const questionTopicDocumentIdPattern = "[topic_id]";
export const questionDocumentIdPattern = "[auto_generated_id]";

export const questionOptionKeys = {
  A: "a",
  B: "b",
  C: "c",
  D: "d"
};

export const questionLanguages = {
  ENGLISH: "English",
  CHINESE: "Chinese",
  MALAY: "Malay",
  TAMIL: "Tamil"
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
            difficulty: "string",
            specialInstruction: "string",
            language: {
              type: "string",
              enum: Object.values(questionLanguages)
            },
            syllabusId: "string",
            topicId: "string"
          }
        }
      }
    }
  }
};

export default {
  QUESTIONS_COLLECTION,
  QUESTION_TOPICS_SUBCOLLECTION,
  QUESTION_ITEMS_SUBCOLLECTION,
  questionSyllabusDocumentIdPattern,
  questionTopicDocumentIdPattern,
  questionDocumentIdPattern,
  questionOptionKeys,
  questionLanguages,
  questionSchema
};
