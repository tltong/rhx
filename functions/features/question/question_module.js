const {
  practiceTypes,
} = require("../../schema/practice_schema");
const { GetQuestion } = require("./application/get_question");
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
const getQuestionUseCase = new GetQuestion(questionRepository);
const listQuestionsByTopicUseCase =
  new ListQuestionsByTopic(questionRepository);
const writeQuestionUseCase = new WriteQuestion(questionRepository);
const writeQuestionsUseCase = new WriteQuestions(questionRepository);
const updateQuestionUseCase = new UpdateQuestion(questionRepository);
const deleteQuestionUseCase = new DeleteQuestion(questionRepository);

async function getQuestion(syllabusId, topicId, questionId) {
  return getQuestionUseCase.execute(syllabusId, topicId, questionId);
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
  getQuestion,
  listQuestionsByTopic,
  writeQuestion,
  writeQuestions,
  updateQuestion,
  deleteQuestion,
  practiceTypes,
};
