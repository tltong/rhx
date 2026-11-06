import {normalizeListInput} from "../domain/student_essay_practice.js?v=20261101-essay-support-v1";

class ListCompletedEssayPractices {
  constructor(repository) {this.repository = repository;}
  async execute(input) {return this.repository.listCompleted(normalizeListInput(input));}
}

export {ListCompletedEssayPractices};

