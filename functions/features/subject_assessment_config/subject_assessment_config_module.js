/**
 * Standalone subject assessment configuration; no assignment, generation or scoring.
 * getSubjectAssessmentConfig({syllabusId, language}) -> Config|null
 * getSubjectAssessmentConfigOptions({syllabusId, language}) -> {syllabusId, language, languageKey, topics, configuration}
 * saveSubjectAssessmentConfig({syllabusId, language, expectedVersion, topics}) -> Config
 * getSubjectAssessmentSettings(context?) -> global Settings|null
 * saveSubjectAssessmentSettings({repeatMode: "interval"|"none", intervalDays: number|null, expectedVersion}, context?) -> global Settings
 * topics: [{topicId, questionType?, totalCount, difficultyCounts: {easy, medium, hard}}]
 * Optional questionType is an expected current format, never an override.
 * Reads and writes require a verified site administrator. These are feature APIs, not HTTP endpoints.
 */
const {getAuth} = require("firebase-admin/auth");
const {getFirebaseApp} = require("../../utils/firebase/firebase_ops");
const {isSiteAdmin} = require("../site_admin/site_admin_module");
const {configurationError} = require("./domain/subject_assessment_config");
const {SubjectAssessmentConfigService} = require("./application/subject_assessment_config_service");
const {FirestoreSubjectAssessmentConfigRepository} = require("./infrastructure/firestore_subject_assessment_config_repository");

async function requireAdministrator(context = {}) {
  if (!context.updatedBy) throw configurationError("Sign in to administer subject assessments.", "unauthenticated");
  const user = await getAuth(getFirebaseApp()).getUser(context.updatedBy);
  if (user.disabled || !user.emailVerified || !user.email || !await isSiteAdmin(user.email)) {
    throw configurationError("A verified site administrator is required.", "permission-denied");
  }
  return {uid: user.uid};
}

function createSubjectAssessmentConfigFeature({repository = new FirestoreSubjectAssessmentConfigRepository(), authorize = requireAdministrator} = {}) {
  const service = new SubjectAssessmentConfigService({repository, authorize});
  return {
    getSubjectAssessmentSettings: context => service.getSettings(context),
    saveSubjectAssessmentSettings: (input, context) => service.saveSettings(input, context),
    getSubjectAssessmentConfig: (input, context) => service.get(input, context),
    getSubjectAssessmentConfigOptions: (input, context) => service.options(input, context),
    saveSubjectAssessmentConfig: (input, context) => service.save(input, context),
  };
}

module.exports = {...createSubjectAssessmentConfigFeature(), createSubjectAssessmentConfigFeature};
