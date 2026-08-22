/**
 * External API contracts
 *
 * getQuestion(questionReference: QuestionReference)
 *   -> Promise<Question|null>
 *
 * getQuestionCount({
 *   syllabusId: string,
 *   topicId: string,
 *   language: string,
 *   hasDiagram: boolean
 * }) -> Promise<number>
 *
 * listQuestionIds({
 *   syllabusId: string,
 *   topicId: string,
 *   language: string,
 *   hasDiagram: boolean
 * }) -> Promise<string[]>
 *
 * getQuestionsForPractice(questionReferences: Array<{
 *   syllabusId: string,
 *   topicId: string,
 *   language: string,
 *   hasDiagram: boolean,
 *   questionId: string
 * }>) -> Promise<PracticeQuestion[]>
 *
 * checkQuestionAnswers({answers: Array<{
 *   syllabusId: string,
 *   topicId: string,
 *   language: string,
 *   hasDiagram: boolean,
 *   questionId: string,
 *   selectedOption: "a"|"b"|"c"|"d"
 * }>}) -> Promise<{results: Array<{
 *   syllabusId: string,
 *   topicId: string,
 *   language: string,
 *   hasDiagram: boolean,
 *   questionId: string,
 *   selectedOption: "a"|"b"|"c"|"d",
 *   correctAnswer: "a"|"b"|"c"|"d",
 *   isCorrect: boolean
 * }>}>
 *
 * listQuestionsByTopic(
 *   syllabusId: string,
 *   topicId: string,
 *   options: {
 *     language: string,
 *     hasDiagram: boolean,
 *     difficulty?: string,
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
 *   questionReference: QuestionReference,
 *   changes: QuestionChanges
 * ) -> Promise<Question>
 *   id, questionId, syllabusId, topicId, language, and hasDiagram cannot
 *   be changed because they identify the question's Firestore path.
 *
 * deleteQuestion(questionReference: QuestionReference)
 *   -> Promise<{id: string, path: string}>
 *
 * QuestionReference:
 * {
 *   syllabusId: string,
 *   topicId: string,
 *   language: string,
 *   hasDiagram: boolean,
 *   questionId: string
 * }
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
 *   hasDiagram: boolean,
 *   svg?: string,
 *   difficulty: string,
 *   language: string,
 *   specialInstruction?: string
 * }
 *
 * QuestionChanges:
 * {
 *   questionText?: string,
 *   options?: {a: string, b: string, c: string, d: string},
 *   correctAnswer?: "a"|"b"|"c"|"d",
 *   group?: "assessment"|"pre assessment",
 *   explanation?: string,
 *   svg?: string,
 *   difficulty?: string,
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
} from "./infrastructure/firestore_question_repository.js?v=20260822-assessment-reuse";
import {
  CheckQuestionAnswers
} from "./application/check_question_answers.js?v=20260817-question-writes";
import {
  GetQuestion
} from "./application/get_question.js?v=20260816-question-routing";
import {
  GetQuestionCount
} from "./application/get_question_count.js?v=20260817-question-writes";
import {
  GetQuestionsForPractice
} from "./application/get_questions_for_practice.js?v=20260816-question-routing";
import {
  ListQuestionIds
} from "./application/list_question_ids.js?v=20260817-question-writes";
import {
  ListQuestionsByTopic
} from "./application/list_questions_by_topic.js?v=20260816-question-routing";
import {
  WriteQuestion
} from "./application/write_question.js?v=20260817-question-writes";
import {
  WriteQuestions
} from "./application/write_questions.js?v=20260817-question-writes";
import {
  UpdateQuestion
} from "./application/update_question.js?v=20260817-question-writes";
import {
  DeleteQuestion
} from "./application/delete_question.js?v=20260817-question-writes";
import {
  practiceTypes
} from "../../config/firebase/practice_schema.js?v=20260727-question-group";

/** @typedef {import("./domain/question.js").QuestionInput} QuestionInput */
/** @typedef {import("./domain/question.js").Question} Question */
/** @typedef {import("./domain/question.js").QuestionReference} QuestionReference */
/**
 * @typedef {Object} QuestionChanges
 * @property {string} [questionText]
 * @property {{a: string, b: string, c: string, d: string}} [options]
 * @property {string} [correctAnswer]
 * @property {string} [group]
 * @property {string} [explanation]
 * @property {string} [svg]
 * @property {string} [difficulty]
 * @property {string} [specialInstruction]
 */

const questionRepository = new FirestoreQuestionRepository();
const checkQuestionAnswersUseCase = new CheckQuestionAnswers(
  questionRepository
);
const getQuestionUseCase = new GetQuestion(questionRepository);
const getQuestionCountUseCase = new GetQuestionCount(questionRepository);
const getQuestionsForPracticeUseCase = new GetQuestionsForPractice(
  questionRepository
);
const listQuestionIdsUseCase = new ListQuestionIds(questionRepository);
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
async function getQuestion(questionReference) {
  return getQuestionUseCase.execute(questionReference);
}

/**
 * @returns {Promise<number>}
 */
async function getQuestionCount(input) {
  return getQuestionCountUseCase.execute(input);
}

/**
 * @returns {Promise<string[]>}
 */
async function listQuestionIds(input) {
  return listQuestionIdsUseCase.execute(input);
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
 *   language: string,
 *   hasDiagram: boolean,
 *   questionId: string,
 *   selectedOption: string
 * }>}} input
 */
async function checkQuestionAnswers(input) {
  return checkQuestionAnswersUseCase.execute(input);
}

/**
 * @param {{
 *   language: string,
 *   hasDiagram: boolean,
 *   difficulty?: string,
 *   limit?: number,
 *   group?: string
 * }} options
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
 * @param {QuestionChanges} changes
 * @returns {Promise<Question>}
 */
async function updateQuestion(questionReference, changes) {
  return updateQuestionUseCase.execute(questionReference, changes);
}

async function deleteQuestion(questionReference) {
  return deleteQuestionUseCase.execute(questionReference);
}

export {
  checkQuestionAnswers,
  getQuestion,
  getQuestionCount,
  getQuestionsForPractice,
  listQuestionIds,
  listQuestionsByTopic,
  writeQuestion,
  writeQuestions,
  updateQuestion,
  deleteQuestion,
  practiceTypes
};
