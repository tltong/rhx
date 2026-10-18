import {normalizeScoringInput, parseAssessment} from "../domain/essay_result.js?v=20261018-essay-review-comment-v1";
import {buildEssayScoringPrompt} from "./build_essay_scoring_prompt.js?v=20261018-essay-review-comment-v1";

class ScoreEssay {
  constructor({getEssayQuestionById, generateLlmText}) {
    Object.assign(this, {getEssayQuestionById, generateLlmText});
  }
  async execute(input, {assertAccess = () => {}} = {}) {
    const request = normalizeScoringInput(input);
    assertAccess();
    const question = await this.getEssayQuestionById(request.questionId);
    assertAccess();
    if (!question) throw new Error("The essay question could not be found.");
    const prompt = buildEssayScoringPrompt(question, request.answer);
    const response = await this.generateLlmText(prompt, {temperature: 0, maxTokens: 8192});
    assertAccess();
    return parseAssessment(response, request.answer);
  }
}

export {ScoreEssay};

