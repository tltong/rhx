import {TUTOR_LLM_PROMPT_TEMPLATE} from "../config/tutor_prompt_template.js?v=20261015-tutor-simple-answers-v1";

/** The complete model input, with stable option order and equivalent defaults. */
function tutorQuestionData(question) {
  const correctAnswerText = question.options?.[question.correctAnswer];
  if (typeof correctAnswerText !== "string" || !correctAnswerText.trim()) throw new Error("Original question must have a valid correct answer.");
  if (question.hasDiagram && (typeof question.svg !== "string" || !question.svg.trim())) throw new Error("Original diagram question must include SVG.");
  return {
    questionText: question.questionText,
    options: Object.fromEntries(["a", "b", "c", "d"].map(key => [key, question.options[key]])),
    correctAnswer: question.correctAnswer, correctAnswerText,
    explanation: question.explanation || "", language: question.language?.trim() || "",
    difficulty: String(question.difficulty || "").trim().toLowerCase(),
    specialInstruction: question.specialInstruction || "", hasDiagram: !!question.hasDiagram,
    svg: question.hasDiagram ? question.svg : "",
  };
}

async function digest(value) {
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function tutorGuideId(question, configuration) {
  const [content, instructions] = await Promise.all([
    digest(tutorQuestionData(question)), digest([1, TUTOR_LLM_PROMPT_TEMPLATE, configuration.promptInstructions]),
  ]);
  return "shared-" + content + "-" + instructions;
}

async function requireTutorGuideForQuestion(guideId, question) {
  const match = typeof guideId === "string" && /^shared-([a-f0-9]{64})-([a-f0-9]{64})$/.exec(guideId);
  if (!match || match[1] !== await digest(tutorQuestionData(question))) {
    throw new Error("The question changed or this guide belongs to another question. Reload the review.");
  }
  return guideId;
}

export {tutorQuestionData, tutorGuideId, requireTutorGuideForQuestion};
