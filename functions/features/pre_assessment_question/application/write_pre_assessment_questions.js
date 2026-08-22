const {
  PreAssessmentQuestion,
} = require("../domain/pre_assessment_question");

class WritePreAssessmentQuestions {
  constructor(repository) {
    this.repository = repository;
  }

  async execute(questionInputs) {
    if (!Array.isArray(questionInputs) || questionInputs.length === 0) {
      throw new Error("At least one pre-assessment question is required.");
    }

    return this.repository.saveMany(
      questionInputs.map((input) => new PreAssessmentQuestion(input)),
    );
  }
}

module.exports = {
  WritePreAssessmentQuestions,
};
