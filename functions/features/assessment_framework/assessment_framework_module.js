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
 * ASSESSMENT_FRAMEWORK_END_LEVEL_ID
 *   The sentinel level ID used when the framework has been completed.
 */
const {
  ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
} = require("../../schema/assessment_framework_schema");
const {
  FirestoreAssessmentFrameworkRepository,
} = require(
  "./infrastructure/firestore_assessment_framework_repository",
);
const {
  CalculatePreAssessmentLevel,
} = require("./application/calculate_pre_assessment_level");
const {
  GetAssessmentLevelCriteria,
} = require("./application/get_assessment_level_criteria");
const {
  GetAssessmentFramework,
} = require("./application/get_assessment_framework");
const {
  ListAssessmentFrameworks,
} = require("./application/list_assessment_frameworks");

const assessmentFrameworkRepository =
  new FirestoreAssessmentFrameworkRepository();
const calculatePreAssessmentLevelUseCase =
  new CalculatePreAssessmentLevel(assessmentFrameworkRepository);
const getAssessmentLevelCriteriaUseCase =
  new GetAssessmentLevelCriteria(assessmentFrameworkRepository);
const getAssessmentFramework =
  new GetAssessmentFramework(assessmentFrameworkRepository);
const listAssessmentFrameworksUseCase =
  new ListAssessmentFrameworks(assessmentFrameworkRepository);

async function getAssessmentFrameworkById(assessmentFrameworkId) {
  return getAssessmentFramework.execute(assessmentFrameworkId);
}

async function getAssessmentLevelCriteria(input) {
  return getAssessmentLevelCriteriaUseCase.execute(input);
}

async function listAssessmentFrameworks() {
  return listAssessmentFrameworksUseCase.execute();
}

async function calculatePreAssessmentLevel(input) {
  return calculatePreAssessmentLevelUseCase.execute(input);
}

module.exports = {
  ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
  calculatePreAssessmentLevel,
  getAssessmentLevelCriteria,
  getAssessmentFrameworkById,
  listAssessmentFrameworks,
};
