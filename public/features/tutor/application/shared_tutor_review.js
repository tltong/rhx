import {normalizeTutorSetReference, normalizeTutorSetVariantReference} from "../domain/tutor_mini_question_set.js?v=20261015-tutor-count-variants-v1";
import {normalizeTutorAnswerCheckInput} from "../domain/tutor_answer.js?v=20261015-tutor-count-variants-v1";
import {tutorQuestionData, tutorGuideId, requireTutorGuideForQuestion} from "../domain/tutor_guide_version.js?v=20261109-shared-tutor-v1";
import {GenerateTutorMiniQuestionSet} from "./generate_tutor_mini_question_set.js?v=20261109-shared-tutor-v1";
import {CheckTutorMiniQuestionAnswer} from "./check_tutor_mini_question_answer.js?v=20261109-shared-tutor-v1";

/** Shared content, count and language variants; callers retain their own access loader. */
class SharedTutorReview {
  constructor({getQuestionById, getTutorConfig, repository, generateLlmText}) {
    Object.assign(this, {getQuestionById, getTutorConfig, generateLlmText});
    this.repository = {
      get: (input, options) => repository.get(input, {...options, allowLegacy: false}),
      save: (input, options) => repository.save(input, {...options, createOnly: true}),
    };
    this.checker = new CheckTutorMiniQuestionAnswer({repository: this.repository, generateLlmText});
  }

  async reference(question, input, assertAccess) {
    const configuration = await this.getTutorConfig(); assertAccess();
    if (!configuration) throw new Error("Save tutor configuration before selecting mini questions.");
    if (!Object.hasOwn(configuration.correctAnswerMessage, input.language) || !Object.hasOwn(configuration.incorrectAnswerMessage, input.language)) {
      throw new Error("Tutor feedback is not configured for language " + input.language + ".");
    }
    const reference = normalizeTutorSetVariantReference({...input, miniQuestionCount: input.miniQuestionCount ?? configuration.miniQuestionCount,
      questionId: await tutorGuideId(question, configuration)});
    assertAccess(); return {reference, configuration};
  }

  async get(input, {assertAccess = () => {}} = {}) {
    const requested = normalizeTutorSetReference(input), question = tutorQuestionData(await this.getQuestionById(requested.questionId)); assertAccess();
    const {reference, configuration} = await this.reference(question, requested, assertAccess);
    let set = await this.repository.get(reference, {beforeWrite: assertAccess}); assertAccess();
    if (set === null) {
      const generator = new GenerateTutorMiniQuestionSet({getQuestionById: async () => question, getTutorConfig: async () => configuration,
        generateLlmText: this.generateLlmText, repository: this.repository});
      set = await generator.execute(reference, {assertAccess});
    }
    assertAccess();
    // Routing still uses the caller's question ID. guideId pins the immutable
    // shared variant for answer checks, including after instruction edits.
    return Object.freeze({...set, questionId: requested.questionId, guideId: reference.questionId});
  }

  async check(input, {assertAccess = () => {}} = {}) {
    const pinnedGuideId = input?.guideId;
    const requested = normalizeTutorAnswerCheckInput(input), question = await this.getQuestionById(requested.questionId); assertAccess();
    const guideId = pinnedGuideId === undefined ? (await this.reference(question, requested, assertAccess)).reference.questionId
      : await requireTutorGuideForQuestion(pinnedGuideId, question);
    assertAccess();
    return this.checker.execute({...requested, questionId: guideId}, {assertAccess});
  }
}

export {SharedTutorReview};
