import {
  Question,
  normalizeQuestionGroup,
  normalizeQuestionGroupRoute,
  normalizeQuestionHasDiagram,
  normalizeQuestionReference,
  toQuestionLanguageDocumentId
} from "../domain/question.js?v=20260817-question-writes";
import { QuestionRepository } from "../domain/question_repository.js";
import {
  QUESTIONS_COLLECTION,
  QUESTION_TOPICS_SUBCOLLECTION,
  QUESTION_LANGUAGES_SUBCOLLECTION,
  QUESTION_DIAGRAM_GROUPS_SUBCOLLECTION,
  questionDiagramGroups,
  QUESTION_ITEMS_SUBCOLLECTION
} from "../../../config/firebase/question_schema.js?v=20260816-question-id-list";
import {
  countCollection,
  createDocument,
  deleteDocument,
  readCollection,
  readCollectionIds,
  readDocument,
  readDocuments,
  writeDocument
} from "../../../utils/firebase/firebase_ops.js?v=20260816-question-id-list";

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function getTopicsCollectionPath(syllabusId) {
  return [
    QUESTIONS_COLLECTION,
    syllabusId,
    QUESTION_TOPICS_SUBCOLLECTION
  ].join("/");
}

function getLanguagesCollectionPath(syllabusId, topicId) {
  return [
    getTopicsCollectionPath(syllabusId),
    topicId,
    QUESTION_LANGUAGES_SUBCOLLECTION
  ].join("/");
}

function getDiagramGroupsCollectionPath(syllabusId, topicId, language) {
  return [
    getLanguagesCollectionPath(syllabusId, topicId),
    toQuestionLanguageDocumentId(language),
    QUESTION_DIAGRAM_GROUPS_SUBCOLLECTION
  ].join("/");
}

function getDiagramGroupDocumentId(hasDiagram) {
  return normalizeQuestionHasDiagram(hasDiagram)
    ? questionDiagramGroups.WITH_DIAGRAM
    : questionDiagramGroups.WITHOUT_DIAGRAM;
}

function getQuestionItemsCollectionPath(
  syllabusId,
  topicId,
  language,
  hasDiagram
) {
  return [
    getDiagramGroupsCollectionPath(syllabusId, topicId, language),
    getDiagramGroupDocumentId(hasDiagram),
    QUESTION_ITEMS_SUBCOLLECTION
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

  return normalizeQuestionGroup(options.group);
}

function normalizeDifficultyFilter(options = {}) {
  if (options.difficulty === undefined || options.difficulty === null) {
    return null;
  }

  return requireIdentifier(options.difficulty, "options.difficulty")
    .toLocaleLowerCase();
}

function normalizeListRoute(options = {}) {
  return {
    language: requireIdentifier(options.language, "options.language"),
    hasDiagram: normalizeQuestionHasDiagram(
      options.hasDiagram,
      "options.hasDiagram"
    )
  };
}

function toQuestion(data, questionRoute) {
  if (!data) {
    return null;
  }

  const question = new Question({
    id: data.id,
    syllabusId: questionRoute.syllabusId,
    topicId: questionRoute.topicId,
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

  if (
    toQuestionLanguageDocumentId(question.language)
      !== toQuestionLanguageDocumentId(questionRoute.language)
    || question.hasDiagram !== questionRoute.hasDiagram
  ) {
    throw new Error(
      `Question ${question.id} does not match its language/diagram path.`
    );
  }

  return question;
}

function normalizeQuestion(question) {
  return question instanceof Question
    ? question
    : new Question(question);
}

function toQuestionRecord(question) {
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

async function ensureParentDocuments({
  syllabusId,
  topicId,
  language,
  hasDiagram
}) {
  const topicsCollectionPath = getTopicsCollectionPath(syllabusId);
  const languagesCollectionPath = getLanguagesCollectionPath(
    syllabusId,
    topicId
  );
  const diagramGroupsCollectionPath = getDiagramGroupsCollectionPath(
    syllabusId,
    topicId,
    language
  );

  await Promise.all([
    writeDocument(
      QUESTIONS_COLLECTION,
      syllabusId,
      {},
      { merge: true }
    ),
    writeDocument(
      topicsCollectionPath,
      topicId,
      {},
      { merge: true }
    ),
    writeDocument(
      languagesCollectionPath,
      toQuestionLanguageDocumentId(language),
      { language },
      { merge: true }
    ),
    writeDocument(
      diagramGroupsCollectionPath,
      getDiagramGroupDocumentId(hasDiagram),
      { hasDiagram },
      { merge: true }
    )
  ]);
}

export class FirestoreQuestionRepository extends QuestionRepository {
  async getById(questionReference) {
    const normalizedReference = normalizeQuestionReference(
      questionReference
    );
    const data = await readDocument(
      getQuestionItemsCollectionPath(
        normalizedReference.syllabusId,
        normalizedReference.topicId,
        normalizedReference.language,
        normalizedReference.hasDiagram
      ),
      normalizedReference.questionId
    );

    return toQuestion(data, normalizedReference);
  }

  async getManyById(questionReferences) {
    if (!Array.isArray(questionReferences)) {
      throw new Error("questionReferences must be an array.");
    }

    const normalizedReferences = questionReferences.map(
      (questionReference, index) => normalizeQuestionReference(
        questionReference,
        `questionReferences[${index}]`
      )
    );
    const questions = await readDocuments(
      normalizedReferences.map((questionReference) => ({
        collectionPath: getQuestionItemsCollectionPath(
          questionReference.syllabusId,
          questionReference.topicId,
          questionReference.language,
          questionReference.hasDiagram
        ),
        documentId: questionReference.questionId
      }))
    );

    return questions.map((question, index) => (
      toQuestion(question, normalizedReferences[index])
    ));
  }

  async countByGroup(questionGroup) {
    const normalizedGroup = normalizeQuestionGroupRoute(questionGroup);

    return countCollection(
      getQuestionItemsCollectionPath(
        normalizedGroup.syllabusId,
        normalizedGroup.topicId,
        normalizedGroup.language,
        normalizedGroup.hasDiagram
      )
    );
  }

  async listIdsByGroup(questionGroup) {
    const normalizedGroup = normalizeQuestionGroupRoute(questionGroup);

    return readCollectionIds(
      getQuestionItemsCollectionPath(
        normalizedGroup.syllabusId,
        normalizedGroup.topicId,
        normalizedGroup.language,
        normalizedGroup.hasDiagram
      )
    );
  }

  async listByTopic(syllabusId, topicId, options = {}) {
    const normalizedSyllabusId = requireIdentifier(
      syllabusId,
      "syllabusId"
    );
    const normalizedTopicId = requireIdentifier(topicId, "topicId");
    const route = normalizeListRoute(options);
    const limit = normalizeLimit(options);
    const group = normalizeGroupFilter(options);
    const difficulty = normalizeDifficultyFilter(options);
    const questions = await readCollection(
      getQuestionItemsCollectionPath(
        normalizedSyllabusId,
        normalizedTopicId,
        route.language,
        route.hasDiagram
      ),
      (collection) => {
        const query = group === null
          ? collection
          : collection.where("group", "==", group);

        return limit === null || difficulty !== null
          ? query
          : query.limit(limit);
      }
    );

    const matchingQuestions = questions
      .map((question) => toQuestion(
        question,
        {
          syllabusId: normalizedSyllabusId,
          topicId: normalizedTopicId,
          ...route
        }
      ))
      .filter((question) => (
        difficulty === null
        || question.difficulty.toLocaleLowerCase() === difficulty
      ))
      .sort((first, second) => first.id.localeCompare(second.id));

    return limit === null
      ? matchingQuestions
      : matchingQuestions.slice(0, limit);
  }

  async save(question) {
    const normalizedQuestion = normalizeQuestion(question);

    await ensureParentDocuments(normalizedQuestion);

    const collectionPath = getQuestionItemsCollectionPath(
      normalizedQuestion.syllabusId,
      normalizedQuestion.topicId,
      normalizedQuestion.language,
      normalizedQuestion.hasDiagram
    );
    const record = toQuestionRecord(normalizedQuestion);

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
    const uniqueBranches = new Map();

    normalizedQuestions.forEach((question) => {
      const key = JSON.stringify([
        question.syllabusId,
        question.topicId,
        toQuestionLanguageDocumentId(question.language),
        question.hasDiagram
      ]);

      uniqueBranches.set(key, question);
    });

    await Promise.all(
      [...uniqueBranches.values()].map(ensureParentDocuments)
    );

    await Promise.all(normalizedQuestions.map(async (question) => {
      const collectionPath = getQuestionItemsCollectionPath(
        question.syllabusId,
        question.topicId,
        question.language,
        question.hasDiagram
      );
      const record = toQuestionRecord(question);

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

  async delete(questionReference) {
    const normalizedReference = normalizeQuestionReference(
      questionReference
    );

    return deleteDocument(
      getQuestionItemsCollectionPath(
        normalizedReference.syllabusId,
        normalizedReference.topicId,
        normalizedReference.language,
        normalizedReference.hasDiagram
      ),
      normalizedReference.questionId
    );
  }
}
