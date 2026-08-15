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
const {
  practiceTypes,
} = require("../../schema/practice_schema");
const {
  CheckQuestionAnswers,
} = require("./application/check_question_answers");
const { GetQuestion } = require("./application/get_question");
const {
  GetQuestionsForPractice,
} = require("./application/get_questions_for_practice");
const {
  ListQuestionsByTopic,
} = require("./application/list_questions_by_topic");
const { WriteQuestion } = require("./application/write_question");
const { WriteQuestions } = require("./application/write_questions");
const { UpdateQuestion } = require("./application/update_question");
const { DeleteQuestion } = require("./application/delete_question");
const {
  FirestoreQuestionRepository,
} = require("./infrastructure/firestore_question_repository");

/**
 * @typedef {import("./domain/question").QuestionInput} QuestionInput
 * @typedef {import("./domain/question").Question} Question
 */

const questionRepository = new FirestoreQuestionRepository();
const checkQuestionAnswersUseCase =
  new CheckQuestionAnswers(questionRepository);
const getQuestionUseCase = new GetQuestion(questionRepository);
const getQuestionsForPracticeUseCase = new GetQuestionsForPractice(
  questionRepository,
);
const listQuestionsByTopicUseCase =
  new ListQuestionsByTopic(questionRepository);
const writeQuestionUseCase = new WriteQuestion(questionRepository);
const writeQuestionsUseCase = new WriteQuestions(questionRepository);
const updateQuestionUseCase = new UpdateQuestion(questionRepository);
const deleteQuestionUseCase = new DeleteQuestion(questionRepository);

async function getQuestion(syllabusId, topicId, questionId) {
  return getQuestionUseCase.execute(syllabusId, topicId, questionId);
}

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

async function listQuestionsByTopic(
  syllabusId,
  topicId,
  options = {},
) {
  return listQuestionsByTopicUseCase.execute(
    syllabusId,
    topicId,
    options,
  );
}

async function writeQuestion(questionInput) {
  return writeQuestionUseCase.execute(questionInput);
}

async function writeQuestions(questionInputs) {
  return writeQuestionsUseCase.execute(questionInputs);
}

async function updateQuestion(
  syllabusId,
  topicId,
  questionId,
  changes,
) {
  return updateQuestionUseCase.execute(
    syllabusId,
    topicId,
    questionId,
    changes,
  );
}

async function deleteQuestion(syllabusId, topicId, questionId) {
  return deleteQuestionUseCase.execute(
    syllabusId,
    topicId,
    questionId,
  );
}

module.exports = {
  checkQuestionAnswers,
  getQuestion,
  getQuestionsForPractice,
  listQuestionsByTopic,
  writeQuestion,
  writeQuestions,
  updateQuestion,
  deleteQuestion,
  practiceTypes,
};
