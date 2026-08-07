import {
  practiceTypes
} from "./practice_schema.js";

export { practiceTypes };

export const PRE_ASSESSMENT_QUESTIONS_COLLECTION =
  "preAssessmentQuestions";
export const PRE_ASSESSMENT_QUESTION_TOPICS_SUBCOLLECTION = "topics";
export const PRE_ASSESSMENT_QUESTION_ITEMS_SUBCOLLECTION =
  "questionItems";

export const preAssessmentQuestionSyllabusDocumentIdPattern =
  "[syllabus_id]";
export const preAssessmentQuestionTopicDocumentIdPattern = "[topic_id]";
export const preAssessmentQuestionDocumentIdPattern =
  "[auto_generated_id]";

export const preAssessmentQuestionOptionKeys = {
  A: "a",
  B: "b",
  C: "c",
  D: "d"
};

export const preAssessmentQuestionSchema = {
  collection: PRE_ASSESSMENT_QUESTIONS_COLLECTION,
  documentId: preAssessmentQuestionSyllabusDocumentIdPattern,
  fields: {},
  subcollections: {
    topics: {
      collection: PRE_ASSESSMENT_QUESTION_TOPICS_SUBCOLLECTION,
      documentId: preAssessmentQuestionTopicDocumentIdPattern,
      fields: {},
      subcollections: {
        questionItems: {
          collection: PRE_ASSESSMENT_QUESTION_ITEMS_SUBCOLLECTION,
          documentId: preAssessmentQuestionDocumentIdPattern,
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
              enum: [practiceTypes.PRE_ASSESSMENT]
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

export default {
  PRE_ASSESSMENT_QUESTIONS_COLLECTION,
  PRE_ASSESSMENT_QUESTION_TOPICS_SUBCOLLECTION,
  PRE_ASSESSMENT_QUESTION_ITEMS_SUBCOLLECTION,
  preAssessmentQuestionSyllabusDocumentIdPattern,
  preAssessmentQuestionTopicDocumentIdPattern,
  preAssessmentQuestionDocumentIdPattern,
  preAssessmentQuestionOptionKeys,
  practiceTypes,
  preAssessmentQuestionSchema
};
