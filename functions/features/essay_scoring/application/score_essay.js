const {normalizeScoringInput, parseAssessment} = require("../domain/essay_result");
const {buildEssayScoringPrompt} = require("./build_essay_scoring_prompt");
const {createDefaultConfiguration} = require("../domain/essay_scoring_config");

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

module.exports = {ScoreEssay};

