import {normalizeGenerationInput, normalizeGeneratedQuestion} from "../domain/essay_question.js?v=20261017-essay-grade-min-words-v1";
import {createDefaultConfiguration, requireAdministratorUid} from "../domain/essay_question_generator_config.js?v=20261017-essay-grade-min-words-v1";
import {buildEssayQuestionPrompt} from "./build_essay_question_prompt.js?v=20261017-essay-grade-min-words-v1";


class GenerateEssayQuestion {
  constructor({repository, requireAdministrator, generateLlmText}) {
    Object.assign(this, {repository, requireAdministrator, generateLlmText});
  }
  async execute(input, context) {
    const {save, ...normalized} = normalizeGenerationInput(input);
    const administrator = await this.requireAdministrator(context);
    requireAdministratorUid(administrator?.uid);
    const configuration = await this.repository.getConfig() || createDefaultConfiguration();
    const wordCountRequirement = Object.freeze({...configuration.gradeWordCountRequirements[normalized.level][normalized.standard]});
    administrator.assertAccess?.();
    const response = await this.generateLlmText(buildEssayQuestionPrompt(normalized, configuration), {maxTokens: 2048});
    administrator.assertAccess?.();
    const question = normalizeGeneratedQuestion(response);
    if (!save) {
      const {seed, ...criteria} = normalized;
      return Object.freeze({questionId: this.repository.createQuestionId(criteria), ...criteria,
        ...question, seedUsed: seed, wordCountRequirement});
    }
    const saved = await this.repository.saveQuestion({...normalized, ...question, wordCountRequirement}, {beforeWrite: administrator.assertAccess});
    administrator.assertAccess?.();
    return saved;
  }
}


export {GenerateEssayQuestion};
