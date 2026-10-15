const {TUTOR_COLLECTION, TUTOR_COUNTS_SUBCOLLECTION, TUTOR_LANGUAGES_SUBCOLLECTION} = require("../../../schema/tutor_schema");
const {normalizeTutorSetVariantReference, toTutorLanguageDocumentId} = require("../domain/tutor_mini_question_set");

function tutorSetPath(input) {
  const {questionId, language, miniQuestionCount} = normalizeTutorSetVariantReference(input);
  return {
    collectionPath: [TUTOR_COLLECTION, questionId, TUTOR_COUNTS_SUBCOLLECTION,
      String(miniQuestionCount), TUTOR_LANGUAGES_SUBCOLLECTION].join("/"),
    documentId: toTutorLanguageDocumentId(language),
  };
}

module.exports = {tutorSetPath};
