import {
  FirestoreQuestionRepository
} from "./infrastructure/firestore_question_repository.js?v=20260727-question-group";
import {
  GetQuestion
} from "./application/get_question.js?v=20260727-question-group";
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
const getQuestionUseCase = new GetQuestion(questionRepository);
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
  getQuestion,
  listQuestionsByTopic,
  writeQuestion,
  writeQuestions,
  updateQuestion,
  deleteQuestion,
  practiceTypes
};
