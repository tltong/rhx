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

const {normalizePreAssessmentQuestionId} = require("../domain/pre_assessment_question_id");

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

function toPreAssessmentQuestionRecord(question) {
  return {
    questionText: question.questionText,
    options: { ...question.options },
    correctAnswer: question.correctAnswer,
    group: question.group,
    explanation: question.explanation,
    hasDiagram: question.hasDiagram,
    svg: question.svg,
    difficulty: question.difficulty,
    language: question.language,
    specialInstruction: question.specialInstruction,
    syllabusId: question.syllabusId,
    topicId: question.topicId,
  };
}

class FirestorePreAssessmentQuestionRepository
  extends PreAssessmentQuestionRepository {
  constructor({
    createDocument = firebaseOps.createDocument,
    readDocument = firebaseOps.readDocument,
    readCollectionIds = firebaseOps.readCollectionIds,
    readDocuments = firebaseOps.readDocuments,
    writeDocument = firebaseOps.writeDocument,
  } = {}) {
    super();
    this.createDocument = createDocument;
    this.readDocument = readDocument;
    this.readCollectionIds = readCollectionIds;
    this.readDocuments = readDocuments;
    this.writeDocument = writeDocument;
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

  async getByQuestionId(questionId) {
    const id = normalizePreAssessmentQuestionId(questionId);
    const readIds = this.readCollectionIds;
    const syllabusIds = await readIds(PRE_ASSESSMENT_QUESTIONS_COLLECTION);
    const topics = [];
    // Resolve existing parent documents with bounded reads, without scanning
    // question contents or adding an index to the question schema.
    for (let offset = 0; offset < syllabusIds.length; offset += 10) {
      const groups = await Promise.all(syllabusIds.slice(offset, offset + 10)
        .map(async syllabusId => {
          const topicIds = await readIds(getTopicsCollectionPath(syllabusId));
          return topicIds.map(topicId => ({syllabusId, topicId}));
        }));
      topics.push(...groups.flat());
    }
    let match = null;
    for (let offset = 0; offset < topics.length; offset += 10) {
      const questions = await Promise.all(topics.slice(offset, offset + 10)
        .map(({syllabusId, topicId}) => this.getById(syllabusId, topicId, id)));
      for (const question of questions) {
        if (!question) continue;
        if (match) {
          const error = new Error("Question ID " + id + " exists in multiple pre-assessment branches.");
          error.code = "ambiguous-question-id";
          throw error;
        }
        match = question;
      }
    }
    return match;
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

  async saveMany(questions) {
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("At least one pre-assessment question is required.");
    }

    const normalizedQuestions = questions.map((question) => (
      question instanceof PreAssessmentQuestion
        ? question
        : new PreAssessmentQuestion(question)
    ));
    const topicsBySyllabus = new Map();

    normalizedQuestions.forEach((question) => {
      if (!topicsBySyllabus.has(question.syllabusId)) {
        topicsBySyllabus.set(question.syllabusId, new Set());
      }

      topicsBySyllabus.get(question.syllabusId).add(question.topicId);
    });

    await Promise.all([...topicsBySyllabus.entries()].flatMap(
      ([syllabusId, topicIds]) => [
        this.writeDocument(
          PRE_ASSESSMENT_QUESTIONS_COLLECTION,
          syllabusId,
          {},
          { merge: true },
        ),
        ...[...topicIds].map((topicId) => this.writeDocument(
          getTopicsCollectionPath(syllabusId),
          topicId,
          {},
          { merge: true },
        )),
      ],
    ));

    await Promise.all(normalizedQuestions.map(async (question) => {
      const collectionPath = getQuestionItemsCollectionPath(
        question.syllabusId,
        question.topicId,
      );
      const record = toPreAssessmentQuestionRecord(question);

      if (question.id) {
        await this.writeDocument(
          collectionPath,
          question.id,
          record,
          { merge: false },
        );
        return;
      }

      const result = await this.createDocument(collectionPath, record);
      question.id = result.id;
    }));

    return normalizedQuestions;
  }
}

module.exports = {
  FirestorePreAssessmentQuestionRepository,
};
