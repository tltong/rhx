export const QUESTIONS_COLLECTION = "questions";

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
};

export default {
  QUESTIONS_COLLECTION,
  questionDocumentIdPattern,
  questionOptionKeys,
  questionLanguages,
  questionSchema
};
