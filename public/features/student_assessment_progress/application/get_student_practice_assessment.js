import {requirePracticeAssessmentScope} from "../domain/practice_assessment.js?v=20261010-level-rewards-v1";

class GetStudentPracticeAssessment {
  constructor(repository) { this.repository = repository; }
  async execute(input) { return this.repository.getPracticeAssessment(requirePracticeAssessmentScope(input)); }
}

export {GetStudentPracticeAssessment};
