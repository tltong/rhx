import {DEFAULT_QUESTION_GENERATION_SEED} from "../../../config/firebase/question_seed_generator_schema.js?v=20261017-seed-association-order-v1";
import {normalizeGenerationInput, normalizeGeneratedEntry, entryKey} from "../domain/question_seed_entry.js?v=20261017-seed-association-order-v1";
import {requireAdministratorUid} from "../domain/question_seed_generator_config.js?v=20261017-seed-association-order-v1";
import {buildQuestionSeedPrompt} from "./build_question_seed_prompt.js?v=20261017-seed-association-order-v1";

const MAX_QUESTION_SEED_GENERATION_ATTEMPTS = 3;

class GenerateQuestionSeedEntry {
  constructor({repository, requireAdministrator, generateLlmText}) {
    Object.assign(this, {repository, requireAdministrator, generateLlmText});
  }

  async execute(input, context) {
    const {vertical, associations, seed, save, useHighLevelSeed} = normalizeGenerationInput(input);
    const administrator = await this.requireAdministrator(context);
    requireAdministratorUid(administrator?.uid);
    const configuration = await this.repository.getConfig();
    const effectiveSeed = useHighLevelSeed
      ? seed || configuration?.generationSeed || DEFAULT_QUESTION_GENERATION_SEED : "";
    for (let attempt = 0; attempt < MAX_QUESTION_SEED_GENERATION_ATTEMPTS; attempt++) {
      const entries = await this.repository.getEntries(vertical);
      administrator.assertAccess?.();
      const prompt = buildQuestionSeedPrompt({vertical, associations, entries, seed: effectiveSeed,
        additionalLlmInstructions: configuration?.additionalLlmInstructions || ""});
      const response = await this.generateLlmText(prompt, {maxTokens: 512});
      administrator.assertAccess?.();
      const entry = normalizeGeneratedEntry(response, associations);
      if (entries.some(existing => entryKey(existing) === entryKey(entry))) continue;
      // Admin pages can preview a candidate without changing the saved pool.
      // The separate save API rechecks uniqueness against current data.
      if (!save) return entry;
      if (await this.repository.appendEntryIfUnique(vertical, entry, {beforeWrite: administrator.assertAccess})) {
        administrator.assertAccess?.();
        return entry;
      }
    }
    throw Object.assign(new Error("The AI returned duplicate question seed entries. Try again."), {
      code: "question-seed-duplicate",
    });
  }
}

export {GenerateQuestionSeedEntry, MAX_QUESTION_SEED_GENERATION_ATTEMPTS};
