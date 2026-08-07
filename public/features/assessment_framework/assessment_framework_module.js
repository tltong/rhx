import {
  FirestoreAssessmentFrameworkRepository
} from "./infrastructure/firestore_assessment_framework_repository.js?v=20260730-score-bands";
import {
  CalculatePreAssessmentLevel
} from "./application/calculate_pre_assessment_level.js?v=20260807-pre-assessment-level";
import {
  GetAssessmentFramework
} from "./application/get_assessment_framework.js?v=20260730-score-bands";
import {
  CreateAssessmentFramework
} from "./application/create_assessment_framework.js?v=20260730-score-bands";
import {
  UpdateAssessmentFramework
} from "./application/update_assessment_framework.js?v=20260730-score-bands";
import {
  DeleteAssessmentFramework
} from "./application/delete_assessment_framework.js?v=20260730-score-bands";
import {
  SaveAssessmentFrameworkPreAssessment
} from "./application/save_assessment_framework_pre_assessment.js?v=20260730-score-bands";
import {
  ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
  assessmentFrameworkPreAssessmentDifficultyLevels,
  assessmentFrameworkPreAssessmentScoreBands
} from "../../config/firebase/assessment_framework_schema.js?v=20260730-score-bands";

const assessmentFrameworkRepository =
  new FirestoreAssessmentFrameworkRepository();
const calculatePreAssessmentLevelUseCase =
  new CalculatePreAssessmentLevel(assessmentFrameworkRepository);
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

async function calculatePreAssessmentLevel(input) {
  return calculatePreAssessmentLevelUseCase.execute(input);
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
  calculatePreAssessmentLevel,
  getAssessmentFrameworkById,
  listAssessmentFrameworks,
  createAssessmentFrameworkRecord,
  updateAssessmentFrameworkRecord,
  deleteAssessmentFrameworkRecord,
  saveAssessmentFrameworkPreAssessment,
  ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
  assessmentFrameworkPreAssessmentDifficultyLevels,
  assessmentFrameworkPreAssessmentScoreBands
};
