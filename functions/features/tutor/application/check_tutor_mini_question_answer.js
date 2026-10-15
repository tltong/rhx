const {normalizeTutorAnswerCheckInput, normalizeTutorAnswer} = require("../domain/tutor_answer");
const {TUTOR_ANSWER_CHECK_PROMPT_TEMPLATE} = require("../config/tutor_answer_check_prompt_template");

class CheckTutorMiniQuestionAnswer {
  constructor({repository, generateLlmText}) {
    Object.assign(this, {repository, generateLlmText});
  }

  async execute(input, {assertAccess = () => {}} = {}) {
    const request = normalizeTutorAnswerCheckInput(input);
    // Use the selected saved variant (copying a matching legacy set if needed).
    // Never generate questions or record a student's response here.
    const set = await this.repository.get(request, {beforeWrite: assertAccess});
    if (!set) throw new Error("Load the tutor mini question set before checking an answer.");
    const miniQuestion = set.miniQuestions[request.sequence - 1];
    if (!miniQuestion || miniQuestion.sequence !== request.sequence) {
      throw new Error("The requested tutor mini question was not found.");
    }
    assertAccess();
    const normalizedAnswer = normalizeTutorAnswer(request.answer);
    const matches = [miniQuestion.expectedAnswer, ...miniQuestion.acceptedAnswers]
      .some(answer => normalizeTutorAnswer(answer) === normalizedAnswer);
    if (matches) return Object.freeze({isCorrect: true});

    const answerData = {
      language: request.language,
      questionText: miniQuestion.questionText,
      expectedAnswer: miniQuestion.expectedAnswer,
      acceptedAnswers: miniQuestion.acceptedAnswers,
      answerExplanation: miniQuestion.answerExplanation,
      answer: request.answer,
    };
    const prompt = TUTOR_ANSWER_CHECK_PROMPT_TEMPLATE.replace(
      "{{answerDataJson}}", () => JSON.stringify(answerData, null, 2),
    );
    let response = await this.generateLlmText(prompt, {maxTokens: 512, temperature: 0});
    assertAccess();
    if (typeof response === "string") {
      try { response = JSON.parse(response); }
      catch { throw new Error("Tutor answer check must return valid JSON."); }
    }
    if (!response || typeof response !== "object" || Array.isArray(response)
        || typeof response.isCorrect !== "boolean") {
      throw new Error("Tutor answer check must return a boolean isCorrect.");
    }
    return Object.freeze({isCorrect: response.isCorrect});
  }
}

module.exports = {CheckTutorMiniQuestionAnswer};
