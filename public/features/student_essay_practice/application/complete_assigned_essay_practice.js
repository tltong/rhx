import {normalizeCompletion} from "../domain/student_essay_practice.js?v=20261017-student-essay-practice-independent-v1";

class CompleteAssignedEssayPractice {
  constructor(repository) {this.repository = repository;}
  async execute(input, context = {}) {
    return this.repository.complete(normalizeCompletion(input), context);
  }
}

export {CompleteAssignedEssayPractice};

