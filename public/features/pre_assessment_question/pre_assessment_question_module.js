import {
  FirestorePreAssessmentQuestionRepository
} from "./infrastructure/firestore_pre_assessment_question_repository.js?v=20260730-pre-assessment-question";
import {
  GetPreAssessmentQuestion
} from "./application/get_pre_assessment_question.js?v=20260730-pre-assessment-question";
import {
  ListPreAssessmentQuestionsByTopic
} from "./application/list_pre_assessment_questions_by_topic.js?v=20260730-pre-assessment-question";
import {
  WritePreAssessmentQuestion
} from "./application/write_pre_assessment_question.js?v=20260730-pre-assessment-question";
import {
  WritePreAssessmentQuestions
} from "./application/write_pre_assessment_questions.js?v=20260730-pre-assessment-question";
import {
  UpdatePreAssessmentQuestion
} from "./application/update_pre_assessment_question.js?v=20260730-pre-assessment-question";
import {
  DeletePreAssessmentQuestion
} from "./application/delete_pre_assessment_question.js?v=20260730-pre-assessment-question";
import {
  practiceTypes
} from "../../config/firebase/practice_schema.js?v=20260730-pre-assessment-question";

/** @typedef {import("./domain/pre_assessment_question.js").PreAssessmentQuestionInput} PreAssessmentQuestionInput */
/** @typedef {import("./domain/pre_assessment_question.js").PreAssessmentQuestion} PreAssessmentQuestion */

const preAssessmentQuestionRepository =
  new FirestorePreAssessmentQuestionRepository();
const getPreAssessmentQuestionUseCase =
  new GetPreAssessmentQuestion(preAssessmentQuestionRepository);
const listPreAssessmentQuestionsByTopicUseCase =
  new ListPreAssessmentQuestionsByTopic(preAssessmentQuestionRepository);
const writePreAssessmentQuestionUseCase =
  new WritePreAssessmentQuestion(preAssessmentQuestionRepository);
const writePreAssessmentQuestionsUseCase =
  new WritePreAssessmentQuestions(preAssessmentQuestionRepository);
const updatePreAssessmentQuestionUseCase =
  new UpdatePreAssessmentQuestion(preAssessmentQuestionRepository);
const deletePreAssessmentQuestionUseCase =
  new DeletePreAssessmentQuestion(preAssessmentQuestionRepository);

/**
 * @returns {Promise<PreAssessmentQuestion|null>}
 */
async function getPreAssessmentQuestion(syllabusId, topicId, questionId) {
  return getPreAssessmentQuestionUseCase.execute(
    syllabusId,
    topicId,
    questionId
  );
}

/**
 * @param {{limit?: number, group?: string}} [options]
 * @returns {Promise<PreAssessmentQuestion[]>}
 */
async function listPreAssessmentQuestionsByTopic(
  syllabusId,
  topicId,
  options = {}
) {
  return listPreAssessmentQuestionsByTopicUseCase.execute(
    syllabusId,
    topicId,
    options
  );
}

/**
 * @param {PreAssessmentQuestionInput} questionInput
 * @returns {Promise<PreAssessmentQuestion>}
 */
async function writePreAssessmentQuestion(questionInput) {
  return writePreAssessmentQuestionUseCase.execute(questionInput);
}

/**
 * @param {PreAssessmentQuestionInput[]} questionInputs
 * @returns {Promise<PreAssessmentQuestion[]>}
 */
async function writePreAssessmentQuestions(questionInputs) {
  return writePreAssessmentQuestionsUseCase.execute(questionInputs);
}

/**
 * @param {Partial<PreAssessmentQuestionInput>} changes
 * @returns {Promise<PreAssessmentQuestion>}
 */
async function updatePreAssessmentQuestion(
  syllabusId,
  topicId,
  questionId,
  changes
) {
  return updatePreAssessmentQuestionUseCase.execute(
    syllabusId,
    topicId,
    questionId,
    changes
  );
}

async function deletePreAssessmentQuestion(
  syllabusId,
  topicId,
  questionId
) {
  return deletePreAssessmentQuestionUseCase.execute(
    syllabusId,
    topicId,
    questionId
  );
}

export {
  getPreAssessmentQuestion,
  listPreAssessmentQuestionsByTopic,
  writePreAssessmentQuestion,
  writePreAssessmentQuestions,
  updatePreAssessmentQuestion,
  deletePreAssessmentQuestion,
  practiceTypes
};
