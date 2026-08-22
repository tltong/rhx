/**
 * External API contracts
 *
 * AssessmentFramework output:
 * {
 *   id: string,
 *   name: string,
 *   endLevelName: string,
 *   levels: Array<{
 *     id: string,
 *     levelName: string,
 *     sequenceOrder: number,
 *     criteria: {
 *       requiredPracticeCount: number,
 *       minimumScore: number,
 *       questionsPerPractice: number,
 *       difficultyLevel: string
 *     }
 *   }>,
 *   preAssessment: null|{
 *     numberOfQuestions: number,
 *     difficultySplit: {
 *       easyPercentage: number,
 *       mediumPercentage: number,
 *       hardPercentage: number
 *     },
 *     scoreLevelSplit: Object<string, string>
 *   }
 * }
 *
 * getAssessmentFrameworkById(assessmentFrameworkId: string)
 *   Input: assessmentFrameworkId, the Firestore framework document ID.
 *   Output: Promise<AssessmentFramework|null>.
 *
 * getAssessmentLevelCriteria({
 *   assessmentFrameworkId: string,
 *   levelId: string
 * })
 *   Output: Promise<{
 *     assessmentFrameworkId: string,
 *     levelId: string,
 *     levelName: string,
 *     sequenceOrder: number,
 *     criteria: {
 *       requiredPracticeCount: number,
 *       minimumScore: number,
 *       questionsPerPractice: number,
 *       difficultyLevel: string
 *     }
 *   }>.
 *
 * listAssessmentFrameworks()
 *   Input: none.
 *   Output: Promise<AssessmentFramework[]> sorted by framework name.
 *
 * createAssessmentFrameworkRecord({
 *   id?: string,
 *   name: string,
 *   endLevelName: string,
 *   levels?: AssessmentFramework["levels"],
 *   preAssessment?: AssessmentFramework["preAssessment"]
 * })
 *   Output: Promise<AssessmentFramework> containing the generated ID.
 *
 * updateAssessmentFrameworkRecord(
 *   assessmentFramework: AssessmentFramework,
 *   changes: {
 *     name?: string,
 *     endLevelName?: string,
 *     levels?: AssessmentFramework["levels"],
 *     preAssessment?: AssessmentFramework["preAssessment"]
 *   }
 * )
 *   Output: Promise<AssessmentFramework> containing the saved changes.
 *
 * deleteAssessmentFrameworkRecord(assessmentFrameworkId: string)
 *   Input: assessmentFrameworkId, the framework to delete.
 *   Output: Promise<void>.
 *
 * saveAssessmentFrameworkPreAssessment(
 *   assessmentFrameworkId: string,
 *   input: {
 *     numberOfQuestions: number,
 *     difficultySplit: {
 *       easyPercentage: number,
 *       mediumPercentage: number,
 *       hardPercentage: number
 *     },
 *     scoreLevelSplit: Object<string, string>
 *   }
 * )
 *   Output: Promise<AssessmentFrameworkPreAssessment>.
 *
 * calculatePreAssessmentLevel({
 *   assessmentFrameworkId: string,
 *   score: number
 * })
 *   Input: framework ID and a percentage score from 0 through 100.
 *   Output: Promise<{
 *     assessmentFrameworkId: string,
 *     score: number,
 *     scoreBand: string,
 *     levelId: string,
 *     levelName: string,
 *     isEndLevel: boolean
 *   }>.
 *
 * calculateAssessmentProgression({
 *   assessmentFrameworkId: string,
 *   currentLevelId: string|null,
 *   scores: number[]
 * })
 *   Output: Promise<{
 *     previousLevelId: string,
 *     levelId: string,
 *     levelName: string,
 *     levelChanged: boolean,
 *     isEndLevel: boolean,
 *     qualifyingPracticeCount: number,
 *     criteria: object|null
 *   }>.
 *
 * Exported constants:
 *   ASSESSMENT_FRAMEWORK_END_LEVEL_ID: string
 *   assessmentFrameworkPreAssessmentDifficultyLevels: readonly string[]
 *   assessmentFrameworkPreAssessmentScoreBands: readonly Array<{
 *     field: string,
 *     label: string,
 *     minimumScore: number
 *   }>
 */
import {
  FirestoreAssessmentFrameworkRepository
} from "./infrastructure/firestore_assessment_framework_repository.js?v=20260730-score-bands";
import {
  CalculatePreAssessmentLevel
} from "./application/calculate_pre_assessment_level.js?v=20260807-pre-assessment-level";
import {
  CalculateAssessmentProgression
} from "./application/calculate_assessment_progression.js?v=20260822-assessment-progression";
import {
  GetAssessmentLevelCriteria
} from "./application/get_assessment_level_criteria.js?v=20260815-level-criteria";
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
const calculateAssessmentProgressionUseCase =
  new CalculateAssessmentProgression(assessmentFrameworkRepository);
const getAssessmentLevelCriteriaUseCase =
  new GetAssessmentLevelCriteria(assessmentFrameworkRepository);
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

async function getAssessmentLevelCriteria(input) {
  return getAssessmentLevelCriteriaUseCase.execute(input);
}

async function calculatePreAssessmentLevel(input) {
  return calculatePreAssessmentLevelUseCase.execute(input);
}

async function calculateAssessmentProgression(input) {
  return calculateAssessmentProgressionUseCase.execute(input);
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
  calculateAssessmentProgression,
  calculatePreAssessmentLevel,
  getAssessmentLevelCriteria,
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
