import {normalizeReference} from "../domain/student_essay_practice.js?v=20261101-essay-support-v1";

class GetAssignedEssayPractice {
  constructor(repository) {this.repository = repository;}
  async execute(input) {return this.repository.getAssigned(normalizeReference(input));}
}

export {GetAssignedEssayPractice};

