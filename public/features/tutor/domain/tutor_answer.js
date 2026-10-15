import {normalizeTutorSetVariantReference} from "./tutor_mini_question_set.js?v=20261015-tutor-count-variants-v1";

function normalizeTutorAnswerCheckInput(input) {
  const reference = normalizeTutorSetVariantReference(input);
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 1) {
    throw new Error("sequence must be a positive safe integer.");
  }
  if (typeof input.answer !== "string" || !input.answer.trim()) {
    throw new Error("answer must be a nonempty string.");
  }
  return {...reference, sequence: input.sequence, answer: input.answer.trim()};
}

function normalizeTutorAnswer(value) {
  // Preserve case, punctuation and signs because these can matter in maths
  // and units. Other equivalent wording is handled by the LLM.
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export {normalizeTutorAnswerCheckInput, normalizeTutorAnswer};
