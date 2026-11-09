import {normalizeQuestionId} from "../domain/essay_question.js?v=20261109-subject-assessment-generation-v1";


class GetEssayQuestionById {
  constructor(repository) {this.repository = repository;}
  async execute(questionId) {return this.repository.getQuestionById(normalizeQuestionId(questionId));}
}


export {GetEssayQuestionById};
