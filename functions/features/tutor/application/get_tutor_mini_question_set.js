const {normalizeTutorSetReference} = require("../domain/tutor_mini_question_set");

class GetTutorMiniQuestionSet {
  constructor(repository, generateTutorMiniQuestionSet) {
    this.repository = repository;
    this.generateTutorMiniQuestionSet = generateTutorMiniQuestionSet;
  }

  async execute(input, {assertAccess = () => {}} = {}) {
    const reference = normalizeTutorSetReference(input);
    const saved = await this.repository.get(reference);
    assertAccess();
    if (saved !== null) return saved;
    return this.generateTutorMiniQuestionSet(reference, {assertAccess});
  }
}

module.exports = {GetTutorMiniQuestionSet};
