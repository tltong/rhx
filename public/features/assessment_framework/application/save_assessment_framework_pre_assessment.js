import {
  AssessmentFrameworkPreAssessment
} from "../domain/assessment_framework.js?v=20260729-framework-wide-pre-assessment";

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value.trim();
}

export class SaveAssessmentFrameworkPreAssessment {
  constructor(assessmentFrameworkRepository) {
    this.assessmentFrameworkRepository = assessmentFrameworkRepository;
  }

  async execute(assessmentFrameworkId, input) {
    const frameworkId = requireNonEmptyString(
      assessmentFrameworkId,
      "assessmentFrameworkId"
    );
    const assessmentFramework =
      await this.assessmentFrameworkRepository.getById(frameworkId);

    if (!assessmentFramework) {
      throw new Error("Assessment framework was not found.");
    }

    if ((assessmentFramework.levels || []).length === 0) {
      throw new Error(
        "Save at least one framework level before configuring pre-assessment."
      );
    }

    const preAssessment = new AssessmentFrameworkPreAssessment(input || {});

    return this.assessmentFrameworkRepository.savePreAssessment(
      assessmentFramework,
      preAssessment
    );
  }
}
