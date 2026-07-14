import {
  FirestoreAssessmentFrameworkRepository
} from "./infrastructure/firestore_assessment_framework_repository.js?v=20260715-assessment-framework";
import {
  GetAssessmentFramework
} from "./application/get_assessment_framework.js?v=20260715-assessment-framework";
import {
  CreateAssessmentFramework
} from "./application/create_assessment_framework.js?v=20260715-assessment-framework";
import {
  UpdateAssessmentFramework
} from "./application/update_assessment_framework.js?v=20260715-assessment-framework";
import {
  DeleteAssessmentFramework
} from "./application/delete_assessment_framework.js?v=20260715-assessment-framework";

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

export {
  getAssessmentFrameworkById,
  listAssessmentFrameworks,
  createAssessmentFrameworkRecord,
  updateAssessmentFrameworkRecord,
  deleteAssessmentFrameworkRecord
};
