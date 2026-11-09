/**
 * One standalone subject assessment configuration per syllabus/language.
 * getSubjectAssessmentConfig({syllabusId, language}) -> Config|null
 * getSubjectAssessmentConfigOptions({syllabusId, language}) -> {syllabusId, language, languageKey, topics, configuration}
 * saveSubjectAssessmentConfig({syllabusId, language, expectedVersion, topics}) -> Config
 * getSubjectAssessmentSettings() -> global Settings|null
 * saveSubjectAssessmentSettings({repeatMode: "interval"|"none", intervalDays: number|null, expectedVersion}) -> global Settings
 * topics: [{topicId, questionType?, totalCount, difficultyCounts: {easy, medium, hard}}]
 * questionType, when supplied, checks the current topic format; it cannot override it.
 * All APIs require a verified site administrator. No HTTP endpoints or student writes.
 */
import {requireCurrentFirebaseAuthUser} from "../../utils/firebase/firebase_auth.js";
import {requireCurrentSiteAdmin} from "../site_admin/site_admin_module.js?v=20260827-site-admin-guard-v1";
import {configurationError} from "./domain/subject_assessment_config.js?v=20261109-assessment-repeat-policy-v1";
import {SubjectAssessmentConfigService} from "./application/subject_assessment_config_service.js?v=20261109-assessment-repeat-policy-v1";
import {FirestoreSubjectAssessmentConfigRepository} from "./infrastructure/firestore_subject_assessment_config_repository.js?v=20261109-assessment-repeat-policy-v1";

async function requireAdministrator() {
  const user = requireCurrentFirebaseAuthUser();
  const assertAccess = () => {
    const current = requireCurrentFirebaseAuthUser();
    if (current.uid !== user.uid || current.email !== user.email || current.emailVerified !== user.emailVerified) {
      throw configurationError("The signed-in account changed. Reload the page.", "unauthenticated");
    }
  };
  const status = await requireCurrentSiteAdmin();
  assertAccess();
  if (!user.emailVerified || status.email !== user.email?.trim().toLowerCase()) {
    throw configurationError("A verified site administrator is required.", "permission-denied");
  }
  return {uid: user.uid, assertAccess};
}

function createSubjectAssessmentConfigFeature({repository = new FirestoreSubjectAssessmentConfigRepository(), authorize = requireAdministrator} = {}) {
  const service = new SubjectAssessmentConfigService({repository, authorize});
  return {
    getSubjectAssessmentSettings: () => service.getSettings(),
    saveSubjectAssessmentSettings: input => service.saveSettings(input),
    getSubjectAssessmentConfig: input => service.get(input),
    getSubjectAssessmentConfigOptions: input => service.options(input),
    saveSubjectAssessmentConfig: input => service.save(input),
  };
}

const {getSubjectAssessmentConfig, getSubjectAssessmentConfigOptions, saveSubjectAssessmentConfig,
  getSubjectAssessmentSettings, saveSubjectAssessmentSettings} = createSubjectAssessmentConfigFeature();
export {getSubjectAssessmentConfig, getSubjectAssessmentConfigOptions, saveSubjectAssessmentConfig,
  getSubjectAssessmentSettings, saveSubjectAssessmentSettings, createSubjectAssessmentConfigFeature};
