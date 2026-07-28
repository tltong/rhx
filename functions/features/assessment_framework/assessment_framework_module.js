const {
  FirestoreAssessmentFrameworkRepository,
} = require(
  "./infrastructure/firestore_assessment_framework_repository",
);
const {
  GetAssessmentFramework,
} = require("./application/get_assessment_framework");
const {
  ListAssessmentFrameworks,
} = require("./application/list_assessment_frameworks");

const assessmentFrameworkRepository =
  new FirestoreAssessmentFrameworkRepository();
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

module.exports = {
  getAssessmentFrameworkById,
  listAssessmentFrameworks,
};
