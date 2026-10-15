import {normalizeTutorSetReference, normalizeTutorResponse} from "../domain/tutor_mini_question_set.js?v=20261015-tutor-count-variants-v1";
import {buildTutorPrompt} from "./build_tutor_prompt.js?v=20261015-tutor-simple-answers-v1";

class GenerateTutorMiniQuestionSet {
  constructor({getQuestionById, getTutorConfig, generateLlmText, repository}) {
    Object.assign(this, {getQuestionById, getTutorConfig, generateLlmText, repository});
  }

  async execute(input, {assertAccess = () => {}} = {}) {
    const reference = normalizeTutorSetReference(input);
    const question = await this.getQuestionById(reference.questionId);
    if (!question) throw new Error("Question " + reference.questionId + " was not found.");
    const configuration = await this.getTutorConfig();
    if (!configuration) throw new Error("Save tutor configuration before generating mini questions.");
    if (!Object.hasOwn(configuration.correctAnswerMessage, reference.language)
        || !Object.hasOwn(configuration.incorrectAnswerMessage, reference.language)) {
      throw new Error("Tutor feedback is not configured for language " + reference.language + ".");
    }
    const configUpdatedAt = new Date(configuration.updatedAt.getTime());
    const miniQuestionCount = reference.miniQuestionCount ?? configuration.miniQuestionCount;
    const prompt = buildTutorPrompt({question,
      configuration: {...configuration, miniQuestionCount}, language: reference.language});
    assertAccess();
    const response = await this.generateLlmText(prompt, {maxTokens: 8192});
    const miniQuestions = normalizeTutorResponse(response, {...reference, miniQuestionCount});
    return this.repository.save({
      ...reference, miniQuestionCount, miniQuestions, configUpdatedAt,
    }, {beforeWrite: assertAccess});
  }
}

export {GenerateTutorMiniQuestionSet};
