import {
  FirestoreAssessmentFrameworkRepository
} from "./infrastructure/firestore_assessment_framework_repository.js?v=20260729-framework-wide-pre-assessment";
import {
  GetAssessmentFramework
} from "./application/get_assessment_framework.js?v=20260729-framework-wide-pre-assessment";
import {
  CreateAssessmentFramework
} from "./application/create_assessment_framework.js?v=20260729-framework-wide-pre-assessment";
import {
  UpdateAssessmentFramework
} from "./application/update_assessment_framework.js?v=20260729-framework-wide-pre-assessment";
import {
  DeleteAssessmentFramework
} from "./application/delete_assessment_framework.js?v=20260729-framework-wide-pre-assessment";
import {
  SaveAssessmentFrameworkPreAssessment
} from "./application/save_assessment_framework_pre_assessment.js?v=20260729-framework-wide-pre-assessment";
import {
  ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
  assessmentFrameworkPreAssessmentDifficultyLevels,
  assessmentFrameworkPreAssessmentScoreThresholds
} from "../../config/firebase/assessment_framework_schema.js?v=20260729-framework-wide-pre-assessment";

const assessmentFrameworkRepository =
  new FirestoreAssessmentFrameworkRepository();
const getAssessmentFramework =
  new GetAssessmentFramework(assessmentFrameworkRepository);
const createAssessmentFramework =
  new CreateAssessmentFramework(assessmentFrameworkRepository);
const updateAssessmentFramework =
  new UpdateAssessmentFramework(assessmentFrameworkRepository);
const deleteAssessmentFramework =
  new DeleteAssessmentFramework(assessmentFrameworkRepository);
const saveAssessmentFrameworkPreAssessmentUseCase =
  new SaveAssessmentFrameworkPreAssessment(
    assessmentFrameworkRepository
  );

async function getAssessmentFrameworkById(assessmentFrameworkId) {
  return getAssessmentFramework.execute(assessmentFrameworkId);
}

async function listAssessmentFrameworks() {
  return assessmentFrameworkRepository.list();
}

async function createAssessmentFrameworkRecord(data) {
  return createAssessmentFramework.execute(data);
}

async function updateAssessmentFrameworkRecord(assessmentFramework, changes) {
  return updateAssessmentFramework.execute(assessmentFramework, changes);
}

async function deleteAssessmentFrameworkRecord(assessmentFrameworkId) {
  return deleteAssessmentFramework.execute(assessmentFrameworkId);
}

async function saveAssessmentFrameworkPreAssessment(
  assessmentFrameworkId,
  input
) {
  return saveAssessmentFrameworkPreAssessmentUseCase.execute(
    assessmentFrameworkId,
    input
  );
}

export {
  getAssessmentFrameworkById,
  listAssessmentFrameworks,
  createAssessmentFrameworkRecord,
  updateAssessmentFrameworkRecord,
  deleteAssessmentFrameworkRecord,
  saveAssessmentFrameworkPreAssessment,
  ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
  assessmentFrameworkPreAssessmentDifficultyLevels,
  assessmentFrameworkPreAssessmentScoreThresholds
};
