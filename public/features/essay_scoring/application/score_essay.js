import {normalizeScoringInput, parseAssessment} from "../domain/essay_result.js?v=20261018-essay-review-comment-v1";
import {buildEssayScoringPrompt} from "./build_essay_scoring_prompt.js?v=20261020-scoring-config-v1";
import {createDefaultConfiguration} from "../domain/essay_scoring_config.js?v=20261020-scoring-config-v1";

class ScoreEssay {
  constructor({getEssayQuestionById, generateLlmText, getEssayScoringConfig}) {
    Object.assign(this, {getEssayQuestionById, generateLlmText, getEssayScoringConfig});
  }
  async execute(input, {assertAccess = () => {}} = {}) {
    const request = normalizeScoringInput(input);
    assertAccess();
    const question = await this.getEssayQuestionById(request.questionId);
    assertAccess();
    if (!question) throw new Error("The essay question could not be found.");
    const configuration = await this.getEssayScoringConfig();
    assertAccess();
    const prompt = buildEssayScoringPrompt(question, request.answer, configuration ?? createDefaultConfiguration());
    const response = await this.generateLlmText(prompt, {temperature: 0, maxTokens: 8192});
    assertAccess();
    return parseAssessment(response, request.answer);
  }
}

export {ScoreEssay};

