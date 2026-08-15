/**
 * External API contracts
 *
 * getQuestion(
 *   syllabusId: string,
 *   topicId: string,
 *   questionId: string
 * ) -> Promise<Question|null>
 *
 * getQuestionsForPractice(questionReferences: Array<{
 *   syllabusId: string,
 *   topicId: string,
 *   questionId: string
 * }>) -> Promise<PracticeQuestion[]>
 *
 * checkQuestionAnswers({answers: Array<{
 *   syllabusId: string,
 *   topicId: string,
 *   questionId: string,
 *   selectedOption: "a"|"b"|"c"|"d"
 * }>}) -> Promise<{results: Array<{
 *   syllabusId: string,
 *   topicId: string,
 *   questionId: string,
 *   selectedOption: "a"|"b"|"c"|"d",
 *   correctAnswer: "a"|"b"|"c"|"d",
 *   isCorrect: boolean
 * }>}>
 *
 * listQuestionsByTopic(
 *   syllabusId: string,
 *   topicId: string,
 *   options?: {
 *     limit?: number,
 *     group?: "assessment"|"pre assessment"
 *   }
 * ) -> Promise<Question[]>
 *
 * writeQuestion(questionInput: QuestionInput)
 *   -> Promise<Question> containing its generated or supplied ID.
 *
 * writeQuestions(questionInputs: QuestionInput[])
 *   -> Promise<Question[]> containing generated or supplied IDs.
 *
 * updateQuestion(
 *   syllabusId: string,
 *   topicId: string,
 *   questionId: string,
 *   changes: Partial<QuestionInput>
 * ) -> Promise<Question>
 *   id, syllabusId, and topicId cannot be changed.
 *
 * deleteQuestion(
 *   syllabusId: string,
 *   topicId: string,
 *   questionId: string
 * ) -> Promise<{id: string, path: string}>
 *
 * QuestionInput:
 * {
 *   id?: string,
 *   syllabusId: string,
 *   topicId: string,
 *   questionText: string,
 *   options: {a: string, b: string, c: string, d: string},
 *   correctAnswer: "a"|"b"|"c"|"d",
 *   group: "assessment"|"pre assessment",
 *   explanation?: string,
 *   hasDiagram?: boolean,
 *   svg?: string,
 *   difficulty: string,
 *   language: string,
 *   specialInstruction?: string
 * }
 *
 * Question output contains every QuestionInput field with normalized values
 * and an id. svg is required when hasDiagram is true.
 *
 * PracticeQuestion output excludes correctAnswer, explanation, group, and
 * specialInstruction:
 * {
 *   id: string,
 *   syllabusId: string,
 *   topicId: string,
 *   questionText: string,
 *   options: {a: string, b: string, c: string, d: string},
 *   hasDiagram: boolean,
 *   svg: string,
 *   difficulty: string,
 *   language: string
 * }
 *
 * Exported constant:
 *   practiceTypes: {ASSESSMENT: "assessment", PRE_ASSESSMENT: "pre assessment"}
 */
import {
  FirestoreQuestionRepository
} from "./infrastructure/firestore_question_repository.js?v=20260807-question-answer-check";
import {
  CheckQuestionAnswers
} from "./application/check_question_answers.js?v=20260807-question-answer-check";
import {
  GetQuestion
} from "./application/get_question.js?v=20260727-question-group";
import {
  GetQuestionsForPractice
} from "./application/get_questions_for_practice.js?v=20260808-practice-session";
import {
  ListQuestionsByTopic
} from "./application/list_questions_by_topic.js?v=20260727-question-group";
import {
  WriteQuestion
} from "./application/write_question.js?v=20260727-question-group";
import {
  WriteQuestions
} from "./application/write_questions.js?v=20260727-question-group";
import {
  UpdateQuestion
} from "./application/update_question.js?v=20260727-question-group";
import {
  DeleteQuestion
} from "./application/delete_question.js?v=20260727-question-group";
import {
  practiceTypes
} from "../../config/firebase/practice_schema.js?v=20260727-question-group";

/** @typedef {import("./domain/question.js").QuestionInput} QuestionInput */
/** @typedef {import("./domain/question.js").Question} Question */

const questionRepository = new FirestoreQuestionRepository();
const checkQuestionAnswersUseCase = new CheckQuestionAnswers(
  questionRepository
);
const getQuestionUseCase = new GetQuestion(questionRepository);
const getQuestionsForPracticeUseCase = new GetQuestionsForPractice(
  questionRepository
);
const listQuestionsByTopicUseCase = new ListQuestionsByTopic(
  questionRepository
);
const writeQuestionUseCase = new WriteQuestion(questionRepository);
const writeQuestionsUseCase = new WriteQuestions(questionRepository);
const updateQuestionUseCase = new UpdateQuestion(questionRepository);
const deleteQuestionUseCase = new DeleteQuestion(questionRepository);

/**
 * @returns {Promise<Question|null>}
 */
async function getQuestion(syllabusId, topicId, questionId) {
  return getQuestionUseCase.execute(syllabusId, topicId, questionId);
}

/**
 * Loads question content without correct answers or explanations.
 * @returns {Promise<Object[]>}
 */
async function getQuestionsForPractice(questionReferences) {
  return getQuestionsForPracticeUseCase.execute(questionReferences);
}

/**
 * @param {{answers: Array<{
 *   syllabusId: string,
 *   topicId: string,
 *   questionId: string,
 *   selectedOption: string
 * }>}} input
 */
async function checkQuestionAnswers(input) {
  return checkQuestionAnswersUseCase.execute(input);
}

/**
 * @param {{limit?: number, group?: string}} [options]
 * @returns {Promise<Question[]>}
 */
async function listQuestionsByTopic(syllabusId, topicId, options = {}) {
  return listQuestionsByTopicUseCase.execute(
    syllabusId,
    topicId,
    options
  );
}

/**
 * @param {QuestionInput} questionInput
 * @returns {Promise<Question>}
 */
async function writeQuestion(questionInput) {
  return writeQuestionUseCase.execute(questionInput);
}

/**
 * @param {QuestionInput[]} questionInputs
 * @returns {Promise<Question[]>}
 */
async function writeQuestions(questionInputs) {
  return writeQuestionsUseCase.execute(questionInputs);
}

/**
 * @param {Partial<QuestionInput>} changes
 * @returns {Promise<Question>}
 */
async function updateQuestion(syllabusId, topicId, questionId, changes) {
  return updateQuestionUseCase.execute(
    syllabusId,
    topicId,
    questionId,
    changes
  );
}

async function deleteQuestion(syllabusId, topicId, questionId) {
  return deleteQuestionUseCase.execute(syllabusId, topicId, questionId);
}

export {
  checkQuestionAnswers,
  getQuestion,
  getQuestionsForPractice,
  listQuestionsByTopic,
  writeQuestion,
  writeQuestions,
  updateQuestion,
  deleteQuestion,
  practiceTypes
};
