import {
  normalizePreAssessmentQuestionGroup,
  PreAssessmentQuestion
} from "../domain/pre_assessment_question.js?v=20260730-pre-assessment-question";
import {
  PreAssessmentQuestionRepository
} from "../domain/pre_assessment_question_repository.js";
import {
  PRE_ASSESSMENT_QUESTIONS_COLLECTION,
  PRE_ASSESSMENT_QUESTION_ITEMS_SUBCOLLECTION,
  PRE_ASSESSMENT_QUESTION_TOPICS_SUBCOLLECTION
} from "../../../config/firebase/pre_assessment_question_schema.js?v=20260730-pre-assessment-question";
import {
  createDocument,
  deleteDocument,
  readCollection,
  readDocument,
  writeDocument
} from "../../../utils/firebase/firebase_ops.js";

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
    PRE_ASSESSMENT_QUESTION_TOPICS_SUBCOLLECTION
  ].join("/");
}

function getQuestionItemsCollectionPath(syllabusId, topicId) {
  return [
    getTopicsCollectionPath(syllabusId),
    topicId,
    PRE_ASSESSMENT_QUESTION_ITEMS_SUBCOLLECTION
  ].join("/");
}

function normalizeLimit(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("options must be an object.");
  }

  if (options.limit === undefined || options.limit === null) {
    return null;
  }

  const limit = Number(options.limit);

  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("limit must be a positive integer.");
  }

  return limit;
}

function normalizeGroupFilter(options = {}) {
  if (options.group === undefined || options.group === null) {
    return null;
  }

  return normalizePreAssessmentQuestionGroup(options.group);
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
    specialInstruction: data.specialInstruction || ""
  });
}

function normalizeQuestion(question) {
  return question instanceof PreAssessmentQuestion
    ? question
    : new PreAssessmentQuestion(question);
}

function toPreAssessmentQuestionRecord(question) {
  return {
    questionText: question.questionText,
    options: { ...question.options },
    correctAnswer: question.correctAnswer,
    group: question.group,
    hasDiagram: question.hasDiagram,
    svg: question.svg,
    explanation: question.explanation,
    difficulty: question.difficulty,
    specialInstruction: question.specialInstruction,
    language: question.language,
    syllabusId: question.syllabusId,
    topicId: question.topicId
  };
}

async function ensureParentDocuments(syllabusId, topicIds) {
  await writeDocument(
    PRE_ASSESSMENT_QUESTIONS_COLLECTION,
    syllabusId,
    {},
    { merge: true }
  );

  const topicsCollectionPath = getTopicsCollectionPath(syllabusId);

  await Promise.all(
    [...topicIds].map((topicId) => writeDocument(
      topicsCollectionPath,
      topicId,
      {},
      { merge: true }
    ))
  );
}

export class FirestorePreAssessmentQuestionRepository
  extends PreAssessmentQuestionRepository {
  async getById(syllabusId, topicId, questionId) {
    const normalizedSyllabusId = requireIdentifier(
      syllabusId,
      "syllabusId"
    );
    const normalizedTopicId = requireIdentifier(topicId, "topicId");
    const normalizedQuestionId = requireIdentifier(questionId, "questionId");
    const data = await readDocument(
      getQuestionItemsCollectionPath(
        normalizedSyllabusId,
        normalizedTopicId
      ),
      normalizedQuestionId
    );

    return toPreAssessmentQuestion(
      data,
      normalizedSyllabusId,
      normalizedTopicId
    );
  }

  async listByTopic(syllabusId, topicId, options = {}) {
    const normalizedSyllabusId = requireIdentifier(
      syllabusId,
      "syllabusId"
    );
    const normalizedTopicId = requireIdentifier(topicId, "topicId");
    const limit = normalizeLimit(options);
    const group = normalizeGroupFilter(options);
    const questions = await readCollection(
      getQuestionItemsCollectionPath(
        normalizedSyllabusId,
        normalizedTopicId
      ),
      (collection) => {
        const query = group === null
          ? collection
          : collection.where("group", "==", group);

        return limit === null ? query : query.limit(limit);
      }
    );

    return questions
      .map((question) => toPreAssessmentQuestion(
        question,
        normalizedSyllabusId,
        normalizedTopicId
      ))
      .sort((first, second) => first.id.localeCompare(second.id));
  }

  async save(question) {
    const normalizedQuestion = normalizeQuestion(question);

    await ensureParentDocuments(
      normalizedQuestion.syllabusId,
      new Set([normalizedQuestion.topicId])
    );

    const collectionPath = getQuestionItemsCollectionPath(
      normalizedQuestion.syllabusId,
      normalizedQuestion.topicId
    );
    const record = toPreAssessmentQuestionRecord(normalizedQuestion);

    if (normalizedQuestion.id) {
      await writeDocument(
        collectionPath,
        normalizedQuestion.id,
        record,
        { merge: false }
      );
    } else {
      const result = await createDocument(collectionPath, record);
      normalizedQuestion.id = result.id;
    }

    return normalizedQuestion;
  }

  async saveMany(questions) {
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("At least one question is required.");
    }

    const normalizedQuestions = questions.map(normalizeQuestion);
    const topicsBySyllabus = new Map();

    normalizedQuestions.forEach((question) => {
      if (!topicsBySyllabus.has(question.syllabusId)) {
        topicsBySyllabus.set(question.syllabusId, new Set());
      }

      topicsBySyllabus.get(question.syllabusId).add(question.topicId);
    });

    await Promise.all(
      [...topicsBySyllabus.entries()].map(([syllabusId, topicIds]) => (
        ensureParentDocuments(syllabusId, topicIds)
      ))
    );

    await Promise.all(normalizedQuestions.map(async (question) => {
      const collectionPath = getQuestionItemsCollectionPath(
        question.syllabusId,
        question.topicId
      );
      const record = toPreAssessmentQuestionRecord(question);

      if (question.id) {
        await writeDocument(
          collectionPath,
          question.id,
          record,
          { merge: false }
        );
        return;
      }

      const result = await createDocument(collectionPath, record);
      question.id = result.id;
    }));

    return normalizedQuestions;
  }

  async delete(syllabusId, topicId, questionId) {
    const normalizedSyllabusId = requireIdentifier(
      syllabusId,
      "syllabusId"
    );
    const normalizedTopicId = requireIdentifier(topicId, "topicId");
    const normalizedQuestionId = requireIdentifier(questionId, "questionId");

    return deleteDocument(
      getQuestionItemsCollectionPath(
        normalizedSyllabusId,
        normalizedTopicId
      ),
      normalizedQuestionId
    );
  }
}
