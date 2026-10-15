import {normalizeTutorSetReference, normalizeTutorSetVariantReference} from "../domain/tutor_mini_question_set.js?v=20261015-tutor-count-variants-v1";

class GetTutorMiniQuestionSet {
  constructor(repository, generateTutorMiniQuestionSet, getTutorConfig) {
    Object.assign(this, {repository, generateTutorMiniQuestionSet, getTutorConfig});
  }

  async execute(input, {assertAccess = () => {}} = {}) {
    let reference = normalizeTutorSetReference(input);
    if (reference.miniQuestionCount === undefined) {
      const configuration = await this.getTutorConfig();
      assertAccess();
      if (!configuration) throw new Error("Save tutor configuration before selecting mini questions.");
      reference = normalizeTutorSetVariantReference({
        ...reference, miniQuestionCount: configuration.miniQuestionCount,
      });
    }
    const saved = await this.repository.get(reference, {beforeWrite: assertAccess});
    assertAccess();
    if (saved !== null) return saved;
    // Forward the resolved count so a later config change cannot select a
    // different variant during generation.
    return this.generateTutorMiniQuestionSet(reference, {assertAccess});
  }
}

export {GetTutorMiniQuestionSet};
