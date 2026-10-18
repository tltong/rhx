import {normalizeReference} from "../domain/student_essay_practice.js?v=20261017-student-essay-practice-independent-v1";

class GetCompletedEssayPractice {
  constructor(repository) {this.repository = repository;}
  async execute(input) {return this.repository.getCompleted(normalizeReference(input));}
}

export {GetCompletedEssayPractice};

