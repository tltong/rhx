export const USER_COMPLETED_QUESTIONS_COLLECTION = "userCompletedQuestions";
export const USER_COMPLETED_QUESTIONS_SYLLABUSES_SUBCOLLECTION = "syllabuses";
export const USER_COMPLETED_QUESTIONS_TOPICS_SUBCOLLECTION = "topics";
export const USER_COMPLETED_QUESTIONS_QUESTIONS_SUBCOLLECTION = "questions";

export const userCompletedQuestionsDocumentIdPattern = "[student_id]";
export const userCompletedQuestionsSyllabusDocumentIdPattern = "[syllabus_id]";
export const userCompletedQuestionsTopicDocumentIdPattern = "[topic_id]";
export const userCompletedQuestionsQuestionDocumentIdPattern = "[question_id]";

export const userCompletedQuestionsSchema = {
  collection: USER_COMPLETED_QUESTIONS_COLLECTION,
  documentId: userCompletedQuestionsDocumentIdPattern,
  fields: {},
  subcollections: {
    syllabuses: {
      collection: USER_COMPLETED_QUESTIONS_SYLLABUSES_SUBCOLLECTION,
      documentId: userCompletedQuestionsSyllabusDocumentIdPattern,
      fields: {},
      subcollections: {
        topics: {
          collection: USER_COMPLETED_QUESTIONS_TOPICS_SUBCOLLECTION,
          documentId: userCompletedQuestionsTopicDocumentIdPattern,
          fields: {},
          subcollections: {
            questions: {
              collection: USER_COMPLETED_QUESTIONS_QUESTIONS_SUBCOLLECTION,
              documentId: userCompletedQuestionsQuestionDocumentIdPattern,
              fields: {}
            }
          }
        }
      }
    }
  }
};

export default {
  USER_COMPLETED_QUESTIONS_COLLECTION,
  USER_COMPLETED_QUESTIONS_SYLLABUSES_SUBCOLLECTION,
  USER_COMPLETED_QUESTIONS_TOPICS_SUBCOLLECTION,
  USER_COMPLETED_QUESTIONS_QUESTIONS_SUBCOLLECTION,
  userCompletedQuestionsDocumentIdPattern,
  userCompletedQuestionsSyllabusDocumentIdPattern,
  userCompletedQuestionsTopicDocumentIdPattern,
  userCompletedQuestionsQuestionDocumentIdPattern,
  userCompletedQuestionsSchema
};
