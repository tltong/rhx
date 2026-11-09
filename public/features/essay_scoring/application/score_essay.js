import {normalizeScoringInput, parseAssessment} from "../domain/essay_result.js?v=20261104-fill-preassessment-v3";
import {buildEssayScoringPrompt} from "./build_essay_scoring_prompt.js?v=20261104-fill-preassessment-v3";
import {createDefaultConfiguration} from "../domain/essay_scoring_config.js?v=20261104-fill-preassessment-v3";

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
    return this.executeSnapshot({question, answer: request.answer}, {assertAccess});
  }
  // Assessment callers supply immutable content; no question-pool lookup or result write.
  async executeSnapshot(input, {assertAccess = () => {}, timeoutMs} = {}) {
    const question = input?.question;
    if (!question || typeof question !== "object") throw new Error("The essay question snapshot is required.");
    const request = normalizeScoringInput({questionId: question.questionId || "assessment-snapshot", answer: input.answer});
    assertAccess();
    const configuration = input.configuration === undefined ? await this.getEssayScoringConfig() : input.configuration;
    assertAccess();
    const prompt = buildEssayScoringPrompt(question, request.answer, configuration ?? createDefaultConfiguration());
    const response = await this.generateLlmText(prompt, {temperature: 0, maxTokens: 8192, ...(timeoutMs ? {timeoutMs} : {})});
    assertAccess();
    return parseAssessment(response, request.answer);
  }
}

export {ScoreEssay};

