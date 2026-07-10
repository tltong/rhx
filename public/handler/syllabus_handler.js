import {
  SYLLABUSES_COLLECTION,
  SYLLABUS_TOPICS_SUBCOLLECTION,
  syllabusesSchema
} from "../config/firebase/syllabuses_schema.js";
import {
  createDocument,
  deleteDocument,
  getCollectionRef,
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

function requireDocumentId(value, name) {
  return requireNonEmptyString(value, name);
}

function normalizeGrade(grade) {
  const value = typeof grade === "number" ? grade : Number(grade);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("grade must be a positive whole number.");
  }

  return value;
}

function normalizeSyllabusScopeData({ country, level, grade } = {}) {
  return {
    country: requireNonEmptyString(country, "country"),
    level: requireNonEmptyString(level, "level"),
    grade: normalizeGrade(grade)
  };
}

function normalizeSyllabusData({ country, level, grade, subject } = {}) {
  const scope = normalizeSyllabusScopeData({ country, level, grade });

  return {
    ...scope,
    subject: requireNonEmptyString(subject, "subject")
  };
}

function normalizeSyllabusUpdates(updates = {}) {
  requireObject(updates, "updates");

  const allowedUpdates = {};

  if (Object.prototype.hasOwnProperty.call(updates, "country")) {
    allowedUpdates.country = requireNonEmptyString(updates.country, "country");
  }

  if (Object.prototype.hasOwnProperty.call(updates, "level")) {
    allowedUpdates.level = requireNonEmptyString(updates.level, "level");
  }

  if (Object.prototype.hasOwnProperty.call(updates, "grade")) {
    allowedUpdates.grade = normalizeGrade(updates.grade);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "subject")) {
    allowedUpdates.subject = requireNonEmptyString(updates.subject, "subject");
  }

  if (Object.keys(allowedUpdates).length === 0) {
    throw new Error("No valid syllabus updates were provided.");
  }

  return allowedUpdates;
}

function normalizeSubtopics(subtopics = {}) {
  const source = requireObject(subtopics, "subtopics");
  const normalized = {};

  Object.entries(source).forEach(([subtopicId, subtopicName]) => {
    normalized[requireNonEmptyString(subtopicId, "subtopicId")] = requireNonEmptyString(
      subtopicName,
      "subtopicName"
    );
  });

  return normalized;
}

function normalizeTopicData({ topicName, subtopics = {} } = {}) {
  return {
    topicName: requireNonEmptyString(topicName, "topicName"),
    subtopics: normalizeSubtopics(subtopics)
  };
}

function normalizeTopicUpdates(updates = {}) {
  requireObject(updates, "updates");

  const allowedUpdates = {};

  if (Object.prototype.hasOwnProperty.call(updates, "topicName")) {
    allowedUpdates.topicName = requireNonEmptyString(updates.topicName, "topicName");
  }

  if (Object.prototype.hasOwnProperty.call(updates, "subtopics")) {
    allowedUpdates.subtopics = normalizeSubtopics(updates.subtopics);
  }

  if (Object.keys(allowedUpdates).length === 0) {
    throw new Error("No valid topic updates were provided.");
  }

  return allowedUpdates;
}

function normalizeTopicList(topics = []) {
  if (!Array.isArray(topics)) {
    throw new Error("topics must be an array.");
  }

  return topics.map((topic, index) => {
    requireObject(topic, `topics[${index}]`);

    return {
      id: topic.id ? requireDocumentId(topic.id, `topics[${index}].id`) : null,
      data: normalizeTopicData(topic)
    };
  });
}

export class SyllabusHandler {
  getSchema() {
    return syllabusesSchema;
  }

  getTopicsCollectionPath(syllabusId) {
    const id = requireDocumentId(syllabusId, "syllabusId");

    return `${SYLLABUSES_COLLECTION}/${id}/${SYLLABUS_TOPICS_SUBCOLLECTION}`;
  }

  createSubtopicId() {
    return getCollectionRef(SYLLABUSES_COLLECTION).doc().id;
  }

  async createSyllabus(syllabusData = {}) {
    const data = normalizeSyllabusData(syllabusData);
    const result = await createDocument(SYLLABUSES_COLLECTION, data);

    return this.readSyllabus(result.id);
  }

  async readSyllabus(syllabusId) {
    return readDocument(
      SYLLABUSES_COLLECTION,
      requireDocumentId(syllabusId, "syllabusId")
    );
  }

  async readSyllabuses(buildQuery = null) {
    return readCollection(SYLLABUSES_COLLECTION, buildQuery);
  }

  async readSyllabusSubjects(scopeData = {}) {
    const scope = normalizeSyllabusScopeData(scopeData);
    const syllabuses = await this.readSyllabuses((collection) =>
      collection
        .where("country", "==", scope.country)
        .where("level", "==", scope.level)
        .where("grade", "==", scope.grade)
    );
    const subjects = syllabuses
      .map((syllabus) => syllabus.subject)
      .filter((subject) => typeof subject === "string" && subject.trim() !== "")
      .map((subject) => subject.trim());

    return [...new Set(subjects)].sort((left, right) => left.localeCompare(right));
  }

  async findSyllabus(syllabusData = {}) {
    const data = normalizeSyllabusData(syllabusData);
    const matches = await this.readSyllabuses((collection) =>
      collection
        .where("country", "==", data.country)
        .where("level", "==", data.level)
        .where("grade", "==", data.grade)
        .where("subject", "==", data.subject)
        .limit(1)
    );

    return matches[0] || null;
  }

  async readSyllabusWithTopics(syllabusId) {
    const syllabus = await this.readSyllabus(syllabusId);

    if (!syllabus) {
      return {
        syllabus: null,
        topics: []
      };
    }

    return {
      syllabus,
      topics: await this.readTopics(syllabus.id)
    };
  }

  async readSyllabusByScopeWithTopics(syllabusData = {}) {
    const syllabus = await this.findSyllabus(syllabusData);

    if (!syllabus) {
      return {
        syllabus: null,
        topics: []
      };
    }

    return this.readSyllabusWithTopics(syllabus.id);
  }

  async writeSyllabus(syllabusId, syllabusData = {}, options = { merge: true }) {
    const id = requireDocumentId(syllabusId, "syllabusId");
    const data = normalizeSyllabusData(syllabusData);

    await writeDocument(SYLLABUSES_COLLECTION, id, data, options);

    return this.readSyllabus(id);
  }

  async updateSyllabus(syllabusId, updates = {}) {
    const id = requireDocumentId(syllabusId, "syllabusId");

    await updateDocument(SYLLABUSES_COLLECTION, id, normalizeSyllabusUpdates(updates));

    return this.readSyllabus(id);
  }

  async deleteSyllabus(syllabusId) {
    const id = requireDocumentId(syllabusId, "syllabusId");

    await deleteDocument(SYLLABUSES_COLLECTION, id);

    return {
      id,
      deleted: true
    };
  }

  async deleteSyllabusWithTopics(syllabusId) {
    const id = requireDocumentId(syllabusId, "syllabusId");
    const topics = await this.readTopics(id);

    await Promise.all(
      topics
        .map((topic) => topic.id)
        .filter(Boolean)
        .map((topicId) => this.deleteTopic(id, topicId))
    );

    return this.deleteSyllabus(id);
  }

  async deleteSyllabusByScope(syllabusData = {}) {
    const syllabus = await this.findSyllabus(syllabusData);

    if (!syllabus) {
      return {
        id: null,
        deleted: false
      };
    }

    return this.deleteSyllabusWithTopics(syllabus.id);
  }

  async createTopic(syllabusId, topicData = {}) {
    const collectionPath = this.getTopicsCollectionPath(syllabusId);
    const data = normalizeTopicData(topicData);
    const result = await createDocument(collectionPath, data);

    return this.readTopic(syllabusId, result.id);
  }

  async readTopic(syllabusId, topicId) {
    return readDocument(
      this.getTopicsCollectionPath(syllabusId),
      requireDocumentId(topicId, "topicId")
    );
  }

  async readTopics(syllabusId, buildQuery = null) {
    return readCollection(this.getTopicsCollectionPath(syllabusId), buildQuery);
  }

  async writeTopic(syllabusId, topicId, topicData = {}, options = { merge: true }) {
    const id = requireDocumentId(topicId, "topicId");
    const data = normalizeTopicData(topicData);

    await writeDocument(this.getTopicsCollectionPath(syllabusId), id, data, options);

    return this.readTopic(syllabusId, id);
  }

  async updateTopic(syllabusId, topicId, updates = {}) {
    const id = requireDocumentId(topicId, "topicId");

    await updateDocument(
      this.getTopicsCollectionPath(syllabusId),
      id,
      normalizeTopicUpdates(updates)
    );

    return this.readTopic(syllabusId, id);
  }

  async deleteTopic(syllabusId, topicId) {
    const id = requireDocumentId(topicId, "topicId");

    await deleteDocument(this.getTopicsCollectionPath(syllabusId), id);

    return {
      id,
      deleted: true
    };
  }

  async createSubtopic(syllabusId, topicId, subtopicName) {
    return this.writeSubtopic(
      syllabusId,
      topicId,
      this.createSubtopicId(),
      subtopicName
    );
  }

  async writeSubtopic(syllabusId, topicId, subtopicId, subtopicName) {
    const topic = await this.readTopic(syllabusId, topicId);

    if (!topic) {
      throw new Error("Topic not found.");
    }

    const subtopics = {
      ...(topic.subtopics || {}),
      [requireNonEmptyString(subtopicId, "subtopicId")]: requireNonEmptyString(
        subtopicName,
        "subtopicName"
      )
    };

    await updateDocument(
      this.getTopicsCollectionPath(syllabusId),
      requireDocumentId(topicId, "topicId"),
      { subtopics }
    );

    return this.readTopic(syllabusId, topicId);
  }

  async deleteSubtopic(syllabusId, topicId, subtopicId) {
    const topic = await this.readTopic(syllabusId, topicId);

    if (!topic) {
      throw new Error("Topic not found.");
    }

    const subtopics = { ...(topic.subtopics || {}) };

    delete subtopics[requireNonEmptyString(subtopicId, "subtopicId")];

    await updateDocument(
      this.getTopicsCollectionPath(syllabusId),
      requireDocumentId(topicId, "topicId"),
      { subtopics }
    );

    return this.readTopic(syllabusId, topicId);
  }

  async saveSyllabusWithTopics({ country, level, grade, subject, topics = [] } = {}) {
    const syllabusData = normalizeSyllabusData({ country, level, grade, subject });
    const normalizedTopics = normalizeTopicList(topics);
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

    let syllabus = await this.findSyllabus(syllabusData);

    if (syllabus) {
      syllabus = await this.writeSyllabus(syllabus.id, syllabusData);
    } else {
      syllabus = await this.createSyllabus(syllabusData);
    }

    const existingTopics = await this.readTopics(syllabus.id);
    const existingTopicIds = existingTopics
      .map((topic) => topic.id)
      .filter(Boolean);

    for (const topic of normalizedTopics) {
      if (topic.id) {
        await this.writeTopic(syllabus.id, topic.id, topic.data);
      } else {
        await this.createTopic(syllabus.id, topic.data);
      }
    }

    await Promise.all(
      existingTopicIds
        .filter((topicId) => !seenTopicIds.has(topicId))
        .map((topicId) => this.deleteTopic(syllabus.id, topicId))
    );

    return this.readSyllabusWithTopics(syllabus.id);
  }
}

const syllabusHandler = new SyllabusHandler();

export function getSyllabusSchema() {
  return syllabusHandler.getSchema();
}

export function getSyllabusTopicsCollectionPath(syllabusId) {
  return syllabusHandler.getTopicsCollectionPath(syllabusId);
}

export function createSyllabus(syllabusData) {
  return syllabusHandler.createSyllabus(syllabusData);
}

export function readSyllabus(syllabusId) {
  return syllabusHandler.readSyllabus(syllabusId);
}

export function readSyllabuses(buildQuery = null) {
  return syllabusHandler.readSyllabuses(buildQuery);
}

export function readSyllabusSubjects(scopeData) {
  return syllabusHandler.readSyllabusSubjects(scopeData);
}

export function findSyllabus(syllabusData) {
  return syllabusHandler.findSyllabus(syllabusData);
}

export function readSyllabusWithTopics(syllabusId) {
  return syllabusHandler.readSyllabusWithTopics(syllabusId);
}

export function readSyllabusByScopeWithTopics(syllabusData) {
  return syllabusHandler.readSyllabusByScopeWithTopics(syllabusData);
}

export function writeSyllabus(syllabusId, syllabusData, options = { merge: true }) {
  return syllabusHandler.writeSyllabus(syllabusId, syllabusData, options);
}

export function updateSyllabus(syllabusId, updates) {
  return syllabusHandler.updateSyllabus(syllabusId, updates);
}

export function deleteSyllabus(syllabusId) {
  return syllabusHandler.deleteSyllabus(syllabusId);
}

export function deleteSyllabusWithTopics(syllabusId) {
  return syllabusHandler.deleteSyllabusWithTopics(syllabusId);
}

export function deleteSyllabusByScope(syllabusData) {
  return syllabusHandler.deleteSyllabusByScope(syllabusData);
}

export function createTopic(syllabusId, topicData) {
  return syllabusHandler.createTopic(syllabusId, topicData);
}

export function readTopic(syllabusId, topicId) {
  return syllabusHandler.readTopic(syllabusId, topicId);
}

export function readTopics(syllabusId, buildQuery = null) {
  return syllabusHandler.readTopics(syllabusId, buildQuery);
}

export function writeTopic(syllabusId, topicId, topicData, options = { merge: true }) {
  return syllabusHandler.writeTopic(syllabusId, topicId, topicData, options);
}

export function updateTopic(syllabusId, topicId, updates) {
  return syllabusHandler.updateTopic(syllabusId, topicId, updates);
}

export function deleteTopic(syllabusId, topicId) {
  return syllabusHandler.deleteTopic(syllabusId, topicId);
}

export function createSubtopic(syllabusId, topicId, subtopicName) {
  return syllabusHandler.createSubtopic(syllabusId, topicId, subtopicName);
}

export function writeSubtopic(syllabusId, topicId, subtopicId, subtopicName) {
  return syllabusHandler.writeSubtopic(syllabusId, topicId, subtopicId, subtopicName);
}

export function deleteSubtopic(syllabusId, topicId, subtopicId) {
  return syllabusHandler.deleteSubtopic(syllabusId, topicId, subtopicId);
}

export function createSubtopicId() {
  return syllabusHandler.createSubtopicId();
}

export function saveSyllabusWithTopics(syllabusData) {
  return syllabusHandler.saveSyllabusWithTopics(syllabusData);
}

export default syllabusHandler;
