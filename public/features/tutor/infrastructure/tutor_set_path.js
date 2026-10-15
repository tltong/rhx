import {TUTOR_COLLECTION, TUTOR_COUNTS_SUBCOLLECTION, TUTOR_LANGUAGES_SUBCOLLECTION} from "../../../config/firebase/tutor_schema.js?v=20261015-tutor-count-variants-v1";
import {normalizeTutorSetVariantReference, toTutorLanguageDocumentId} from "../domain/tutor_mini_question_set.js?v=20261015-tutor-count-variants-v1";

function tutorSetPath(input) {
  const {questionId, language, miniQuestionCount} = normalizeTutorSetVariantReference(input);
  return {
    collectionPath: [TUTOR_COLLECTION, questionId, TUTOR_COUNTS_SUBCOLLECTION,
      String(miniQuestionCount), TUTOR_LANGUAGES_SUBCOLLECTION].join("/"),
    documentId: toTutorLanguageDocumentId(language),
  };
}

export {tutorSetPath};
