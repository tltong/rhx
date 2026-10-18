import {requireId} from "../domain/essay_practice.js?v=20261018-preassessment-essay-v1";

class GetEssayPracticeById {
  constructor(repository) {this.repository = repository;}
  async execute(practiceId) {return this.repository.getById(requireId(practiceId, "practiceId"));}
}

export {GetEssayPracticeById};

