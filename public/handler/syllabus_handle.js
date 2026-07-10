import {
  SYLLABUSES_COLLECTION,
  SYLLABUS_TOPICS_SUBCOLLECTION,
  syllabusStandards,
  syllabusSubjects,
  syllabusSchema
} from "../config/firebase/syllabus_config.js";
import {
  createDocument,
  deleteDocument,
  readCollection,
  readDocument,
  updateDocument,
  writeDocument
} from "../utils/firebase/firebase_ops.js";

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value.trim();
}

function requireObject(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be a non-null object.`);
  }

  return value;
}

function toDocumentIdPart(value, name) {
  return requireNonEmptyString(value, name).replace(/\//g, "-");
}

function requireAllowedValue(value, name, allowedValues) {
  const text = String(value ?? "").trim();

  if (!allowedValues.includes(text)) {
    throw new Error(`${name} must be one of: ${allowedValues.join(", ")}.`);
  }

  return text;
}

function normalizeStandard(standard) {
  return requireAllowedValue(standard, "standard", syllabusStandards);
}

function normalizeSubject(subject) {
  return requireAllowedValue(subject, "subject", syllabusSubjects);
}

function validateSubtopics(subtopics = {}) {
  requireObject(subtopics, "subtopics");

  Object.entries(subtopics).forEach(([subtopicId, subtopicName]) => {
    requireNonEmptyString(subtopicId, "subtopicId");
    requireNonEmptyString(subtopicName, "subtopicName");
  });

  return subtopics;
}

function buildTopicData({ topicName, subtopics = {} } = {}) {
  return {
    topicName: requireNonEmptyString(topicName, "topicName"),
    subtopics: validateSubtopics(subtopics)
  };
}

function requireArray(value, name) {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array.`);
  }

  return value;
}

function getOptionalDocumentId(value, name) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return requireNonEmptyString(value, name);
}

function normalizeTopicInput(topic, index) {
  requireObject(topic, `topics[${index}]`);

  return {
    id: getOptionalDocumentId(topic.id, `topics[${index}].id`),
    data: buildTopicData(topic)
  };
}

export function getSyllabusScope() {
  return {
    standards: [...syllabusStandards],
    subjects: [...syllabusSubjects]
  };
}

export function getSyllabusSchema() {
  return syllabusSchema;
}

export function buildSyllabusDocumentId(standard, subject) {
  return `${toDocumentIdPart(normalizeStandard(standard), "standard")}_${toDocumentIdPart(normalizeSubject(subject), "subject")}`;
}

export function getSyllabusTopicsCollectionPath(standard, subject) {
  const syllabusId = buildSyllabusDocumentId(standard, subject);

  return `${SYLLABUSES_COLLECTION}/${syllabusId}/${SYLLABUS_TOPICS_SUBCOLLECTION}`;
}

export async function createSyllabus({ standard, subject } = {}) {
  const syllabusData = {
    standard: normalizeStandard(standard),
    subject: normalizeSubject(subject)
  };
  const syllabusId = buildSyllabusDocumentId(syllabusData.standard, syllabusData.subject);

  await createDocument(SYLLABUSES_COLLECTION, syllabusData, syllabusId);

  return readSyllabus(syllabusData.standard, syllabusData.subject);
}

export async function readSyllabus(standard, subject) {
  return readDocument(
    SYLLABUSES_COLLECTION,
    buildSyllabusDocumentId(standard, subject)
  );
}

export async function readSyllabuses(buildQuery = null) {
  return readCollection(SYLLABUSES_COLLECTION, buildQuery);
}

export async function writeSyllabus({ standard, subject } = {}, options = { merge: true }) {
  const syllabusData = {
    standard: normalizeStandard(standard),
    subject: normalizeSubject(subject)
  };
  const syllabusId = buildSyllabusDocumentId(syllabusData.standard, syllabusData.subject);

  await writeDocument(SYLLABUSES_COLLECTION, syllabusId, syllabusData, options);

  return readSyllabus(syllabusData.standard, syllabusData.subject);
}

export async function updateSyllabus(standard, subject, updates = {}) {
  const allowedUpdates = {};

  if (Object.prototype.hasOwnProperty.call(updates, "standard")) {
    allowedUpdates.standard = normalizeStandard(updates.standard);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "subject")) {
    allowedUpdates.subject = normalizeSubject(updates.subject);
  }

  if (Object.keys(allowedUpdates).length === 0) {
    throw new Error("No valid syllabus updates were provided.");
  }

  await updateDocument(
    SYLLABUSES_COLLECTION,
    buildSyllabusDocumentId(standard, subject),
    allowedUpdates
  );

  return readDocument(SYLLABUSES_COLLECTION, buildSyllabusDocumentId(standard, subject));
}

export async function deleteSyllabus(standard, subject) {
  const syllabusId = buildSyllabusDocumentId(standard, subject);

  await deleteDocument(SYLLABUSES_COLLECTION, syllabusId);

  return {
    id: syllabusId,
    deleted: true
  };
}

export async function createTopic(standard, subject, topicData, topicId = null) {
  const collectionPath = getSyllabusTopicsCollectionPath(standard, subject);
  const data = buildTopicData(topicData);
  const result = await createDocument(collectionPath, data, topicId);

  return readTopic(standard, subject, result.id);
}

export async function readTopic(standard, subject, topicId) {
  return readDocument(
    getSyllabusTopicsCollectionPath(standard, subject),
    requireNonEmptyString(topicId, "topicId")
  );
}

export async function readTopics(standard, subject, buildQuery = null) {
  return readCollection(
    getSyllabusTopicsCollectionPath(standard, subject),
    buildQuery
  );
}

export async function readSyllabusWithTopics(standard, subject) {
  const normalizedStandard = normalizeStandard(standard);
  const normalizedSubject = normalizeSubject(subject);
  const [syllabus, topics] = await Promise.all([
    readSyllabus(normalizedStandard, normalizedSubject),
    readTopics(normalizedStandard, normalizedSubject)
  ]);

  return {
    syllabus: syllabus || {
      id: buildSyllabusDocumentId(normalizedStandard, normalizedSubject),
      standard: normalizedStandard,
      subject: normalizedSubject
    },
    topics
  };
}

export async function writeTopic(standard, subject, topicId, topicData, options = { merge: true }) {
  const id = requireNonEmptyString(topicId, "topicId");
  const data = buildTopicData(topicData);

  await writeDocument(
    getSyllabusTopicsCollectionPath(standard, subject),
    id,
    data,
    options
  );

  return readTopic(standard, subject, id);
}

export async function updateTopic(standard, subject, topicId, updates = {}) {
  const allowedUpdates = {};

  if (Object.prototype.hasOwnProperty.call(updates, "topicName")) {
    allowedUpdates.topicName = requireNonEmptyString(updates.topicName, "topicName");
  }

  if (Object.prototype.hasOwnProperty.call(updates, "subtopics")) {
    allowedUpdates.subtopics = validateSubtopics(updates.subtopics);
  }

  if (Object.keys(allowedUpdates).length === 0) {
    throw new Error("No valid topic updates were provided.");
  }

  await updateDocument(
    getSyllabusTopicsCollectionPath(standard, subject),
    requireNonEmptyString(topicId, "topicId"),
    allowedUpdates
  );

  return readTopic(standard, subject, topicId);
}

export async function deleteTopic(standard, subject, topicId) {
  const id = requireNonEmptyString(topicId, "topicId");

  await deleteDocument(getSyllabusTopicsCollectionPath(standard, subject), id);

  return {
    id,
    deleted: true
  };
}

export async function writeSubtopic(standard, subject, topicId, subtopicId, subtopicName) {
  const topic = await readTopic(standard, subject, topicId);

  if (!topic) {
    throw new Error("Topic not found.");
  }

  const subtopics = {
    ...(topic.subtopics || {}),
    [requireNonEmptyString(subtopicId, "subtopicId")]: requireNonEmptyString(subtopicName, "subtopicName")
  };

  await updateDocument(
    getSyllabusTopicsCollectionPath(standard, subject),
    requireNonEmptyString(topicId, "topicId"),
    { subtopics }
  );

  return readTopic(standard, subject, topicId);
}

export async function deleteSubtopic(standard, subject, topicId, subtopicId) {
  const topic = await readTopic(standard, subject, topicId);

  if (!topic) {
    throw new Error("Topic not found.");
  }

  const subtopics = { ...(topic.subtopics || {}) };

  delete subtopics[requireNonEmptyString(subtopicId, "subtopicId")];

  await updateDocument(
    getSyllabusTopicsCollectionPath(standard, subject),
    requireNonEmptyString(topicId, "topicId"),
    { subtopics }
  );

  return readTopic(standard, subject, topicId);
}

export async function saveSyllabusWithTopics({ standard, subject, topics = [] } = {}) {
  const normalizedStandard = normalizeStandard(standard);
  const normalizedSubject = normalizeSubject(subject);
  const normalizedTopics = requireArray(topics, "topics").map(normalizeTopicInput);
  const seenTopicIds = new Set();

  normalizedTopics.forEach((topic) => {
    if (!topic.id) {
      return;
    }

    if (seenTopicIds.has(topic.id)) {
      throw new Error(`Duplicate topic id: ${topic.id}.`);
    }

    seenTopicIds.add(topic.id);
  });

  await writeSyllabus({
    standard: normalizedStandard,
    subject: normalizedSubject
  });

  const existingTopics = await readTopics(normalizedStandard, normalizedSubject);
  const existingTopicIds = existingTopics
    .map((topic) => topic.id)
    .filter(Boolean);

  for (const topic of normalizedTopics) {
    if (topic.id) {
      await writeTopic(normalizedStandard, normalizedSubject, topic.id, topic.data);
    } else {
      await createTopic(normalizedStandard, normalizedSubject, topic.data);
    }
  }

  await Promise.all(
    existingTopicIds
      .filter((topicId) => !seenTopicIds.has(topicId))
      .map((topicId) => deleteTopic(normalizedStandard, normalizedSubject, topicId))
  );

  return readSyllabusWithTopics(normalizedStandard, normalizedSubject);
}

export default {
  getSyllabusScope,
  getSyllabusSchema,
  buildSyllabusDocumentId,
  getSyllabusTopicsCollectionPath,
  createSyllabus,
  readSyllabus,
  readSyllabuses,
  writeSyllabus,
  updateSyllabus,
  deleteSyllabus,
  createTopic,
  readTopic,
  readTopics,
  writeTopic,
  updateTopic,
  deleteTopic,
  writeSubtopic,
  deleteSubtopic,
  readSyllabusWithTopics,
  saveSyllabusWithTopics
};
