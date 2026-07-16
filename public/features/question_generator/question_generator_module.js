import {
  generateLlmPrompt
} from "../llm_prompt_generator/llm_prompt_generator_module.js?v=20260717-question-prompt-display";
import {
  getSyllabusById
} from "../syllabus/syllabus_module.js?v=20260717-question-prompt-display";
import {
  generateLlmText
} from "../../utils/llm/llm_ops.js?v=20260717-question-prompt-display";
import {
  FirestoreQuestionRepository
} from "./infrastructure/firestore_question_repository.js?v=20260717-question-prompt-display";
import {
  GenerateQuestions
} from "./application/generate_questions.js?v=20260717-question-prompt-display";

const questionRepository = new FirestoreQuestionRepository();
const generateQuestionsUseCase = new GenerateQuestions({
  generateLlmPrompt,
  generateLlmText,
  getSyllabusById,
  questionRepository
});

async function generateQuestions(input) {
  return generateQuestionsUseCase.execute(input);
}

export {
  generateQuestions
};
