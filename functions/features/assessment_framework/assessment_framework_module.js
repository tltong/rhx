const {
  FirestoreAssessmentFrameworkRepository,
} = require(
  "./infrastructure/firestore_assessment_framework_repository",
);
const {
  CalculatePreAssessmentLevel,
} = require("./application/calculate_pre_assessment_level");
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
const getAssessmentFramework =
  new GetAssessmentFramework(assessmentFrameworkRepository);
const listAssessmentFrameworksUseCase =
  new ListAssessmentFrameworks(assessmentFrameworkRepository);

async function getAssessmentFrameworkById(assessmentFrameworkId) {
  return getAssessmentFramework.execute(assessmentFrameworkId);
}

async function listAssessmentFrameworks() {
  return listAssessmentFrameworksUseCase.execute();
}

async function calculatePreAssessmentLevel(input) {
  return calculatePreAssessmentLevelUseCase.execute(input);
}

module.exports = {
  calculatePreAssessmentLevel,
  getAssessmentFrameworkById,
  listAssessmentFrameworks,
};
