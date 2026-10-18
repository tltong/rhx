const {QUESTION_SEED_PROMPT_TEMPLATE} = require("../config/question_seed_prompt_template");

const meanings = {
  theme: "The central subject or idea, such as friendship, technology or the environment.",
  setting: "The place or situation in which a question can be situated, such as a school or community library.",
  type: "The question format, task or response genre, such as narrative, persuasive or problem-solving.",
};

function buildQuestionSeedPrompt({vertical, associations, seed, additionalLlmInstructions, entries}) {
  const values = {
    vertical, meaning: meanings[vertical],
    seedSection: seed ? "Generation inspiration (not a numeric random seed):\n" + seed : "",
    seedRequirement: seed
      ? "- Use the inspiration to guide variety. A prompt mentioning latest news does not verify current events; do not claim to have searched or verified news."
      : "- Choose a suitable new idea for this vertical independently; no high-level seed is provided.",
    additionalLlmInstructions, existingEntriesJson: JSON.stringify(entries.map(entry => entry.value)),
    associationsSection: Object.keys(associations).length
      ? "Target school levels and grades (JSON):\n" + JSON.stringify(associations) : "",
    associationsRequirement: Object.keys(associations).length
      ? "- The entry must be suitable for every listed school level and grade. Levels are primary and secondary; grades range from 1 to 6 within each level."
      : "- Generate the entry independently of school level or grade. The administrator will assign its level and grade associations afterward.",
  };
  return QUESTION_SEED_PROMPT_TEMPLATE.replace(
    /{{(vertical|meaning|associationsSection|associationsRequirement|seedSection|seedRequirement|additionalLlmInstructions|existingEntriesJson)}}/g,
    (_placeholder, name) => values[name],
  );
}

module.exports = {buildQuestionSeedPrompt};
