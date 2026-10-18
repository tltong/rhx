import {normalizeReference} from "../domain/student_essay_practice.js?v=20261017-student-essay-practice-independent-v1";

class GetAssignedEssayPractice {
  constructor(repository) {this.repository = repository;}
  async execute(input) {return this.repository.getAssigned(normalizeReference(input));}
}

export {GetAssignedEssayPractice};

