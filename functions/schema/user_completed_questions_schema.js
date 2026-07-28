const USER_COMPLETED_QUESTIONS_COLLECTION = "userCompletedQuestions";
const USER_COMPLETED_QUESTIONS_SYLLABUSES_SUBCOLLECTION = "syllabuses";
const USER_COMPLETED_QUESTIONS_TOPICS_SUBCOLLECTION = "topics";
const USER_COMPLETED_QUESTIONS_QUESTIONS_SUBCOLLECTION = "questions";

const userCompletedQuestionsDocumentIdPattern = "[student_id]";
const userCompletedQuestionsSyllabusDocumentIdPattern = "[syllabus_id]";
const userCompletedQuestionsTopicDocumentIdPattern = "[topic_id]";
const userCompletedQuestionsQuestionDocumentIdPattern = "[question_id]";

const userCompletedQuestionsSchema = {
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

module.exports = {
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
