const {requirePracticeAssessmentScope} = require("../domain/practice_assessment");

class GetStudentPracticeAssessment {
  constructor(repository) { this.repository = repository; }
  async execute(input) { return this.repository.getPracticeAssessment(requirePracticeAssessmentScope(input)); }
}

module.exports = {GetStudentPracticeAssessment};
