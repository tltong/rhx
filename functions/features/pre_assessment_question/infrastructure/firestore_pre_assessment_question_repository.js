const {
  PRE_ASSESSMENT_QUESTIONS_COLLECTION,
  PRE_ASSESSMENT_QUESTION_ITEMS_SUBCOLLECTION,
  PRE_ASSESSMENT_QUESTION_TOPICS_SUBCOLLECTION,
} = require("../../../schema/pre_assessment_question_schema");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {
  PreAssessmentQuestion,
} = require("../domain/pre_assessment_question");
const {
  PreAssessmentQuestionRepository,
} = require("../domain/pre_assessment_question_repository");

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function getTopicsCollectionPath(syllabusId) {
  return [
    PRE_ASSESSMENT_QUESTIONS_COLLECTION,
    syllabusId,
    PRE_ASSESSMENT_QUESTION_TOPICS_SUBCOLLECTION,
  ].join("/");
}

function getQuestionItemsCollectionPath(syllabusId, topicId) {
  return [
    getTopicsCollectionPath(syllabusId),
    topicId,
    PRE_ASSESSMENT_QUESTION_ITEMS_SUBCOLLECTION,
  ].join("/");
}

function toPreAssessmentQuestion(data, syllabusId, topicId) {
  if (!data) {
    return null;
  }

  return new PreAssessmentQuestion({
    id: data.id,
    syllabusId,
    topicId,
    questionText: data.questionText,
    options: data.options,
    correctAnswer: data.correctAnswer,
    group: data.group,
    explanation: data.explanation || "",
    hasDiagram: data.hasDiagram === true,
    svg: data.svg || "",
    difficulty: data.difficulty,
    language: data.language,
    specialInstruction: data.specialInstruction || "",
  });
}

class FirestorePreAssessmentQuestionRepository
  extends PreAssessmentQuestionRepository {
  constructor({
    readDocument = firebaseOps.readDocument,
    readDocuments = firebaseOps.readDocuments,
  } = {}) {
    super();
    this.readDocument = readDocument;
    this.readDocuments = readDocuments;
  }

  async getById(syllabusId, topicId, questionId) {
    const normalizedSyllabusId = requireIdentifier(
      syllabusId,
      "syllabusId",
    );
    const normalizedTopicId = requireIdentifier(topicId, "topicId");
    const normalizedQuestionId = requireIdentifier(
      questionId,
      "questionId",
    );
    const data = await this.readDocument(
      getQuestionItemsCollectionPath(
        normalizedSyllabusId,
        normalizedTopicId,
      ),
      normalizedQuestionId,
    );

    return toPreAssessmentQuestion(
      data,
      normalizedSyllabusId,
      normalizedTopicId,
    );
  }

  async getManyById(questionReferences) {
    if (!Array.isArray(questionReferences)) {
      throw new Error("questionReferences must be an array.");
    }

    const normalizedReferences = questionReferences.map(
      (questionReference, index) => {
        if (
          !questionReference ||
          typeof questionReference !== "object" ||
          Array.isArray(questionReference)
        ) {
          throw new Error(
            `questionReferences[${index}] must be an object.`,
          );
        }

        return {
          syllabusId: requireIdentifier(
            questionReference.syllabusId,
            `questionReferences[${index}].syllabusId`,
          ),
          topicId: requireIdentifier(
            questionReference.topicId,
            `questionReferences[${index}].topicId`,
          ),
          questionId: requireIdentifier(
            questionReference.questionId,
            `questionReferences[${index}].questionId`,
          ),
        };
      },
    );
    const questions = await this.readDocuments(
      normalizedReferences.map((questionReference) => ({
        collectionPath: getQuestionItemsCollectionPath(
          questionReference.syllabusId,
          questionReference.topicId,
        ),
        documentId: questionReference.questionId,
      })),
    );

    return questions.map((question, index) =>
      toPreAssessmentQuestion(
        question,
        normalizedReferences[index].syllabusId,
        normalizedReferences[index].topicId,
      ),
    );
  }
}

module.exports = {
  FirestorePreAssessmentQuestionRepository,
};
