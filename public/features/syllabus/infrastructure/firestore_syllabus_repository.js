import {
  Syllabus,
  SyllabusTopic
} from "../domain/syllabus.js";
import { SyllabusRepository } from "../domain/syllabus_repository.js";
import {
  SYLLABUSES_COLLECTION,
  SYLLABUS_TOPICS_SUBCOLLECTION
} from "../../../config/firebase/syllabuses_schema.js";
import {
  createDocument,
  deleteDocument,
  readCollection,
  readDocument,
  writeDocument
} from "../../../utils/firebase/firebase_ops.js";

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value.trim();
}

function optionalString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = String(value).trim();

  return stringValue === "" ? null : stringValue;
}

function requireNumber(value, name) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    throw new Error(`${name} must be a finite number.`);
  }

  return numberValue;
}

function requireObject(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be a non-null object.`);
  }

  return value;
}

function getTopicsCollectionPath(syllabusId) {
  return [
    SYLLABUSES_COLLECTION,
    syllabusId,
    SYLLABUS_TOPICS_SUBCOLLECTION
  ].join("/");
}

function normalizeSubtopics(subtopics = {}) {
  const source = requireObject(subtopics, "subtopics");
  const normalizedSubtopics = {};

  Object.entries(source).forEach(([subtopicId, subtopicName]) => {
    const normalizedId = requireNonEmptyString(subtopicId, "subtopicId");
    normalizedSubtopics[normalizedId] = requireNonEmptyString(
      subtopicName,
      `subtopics.${normalizedId}`
    );
  });

  return normalizedSubtopics;
}

function normalizeTopic(topic) {
  return new SyllabusTopic({
    id: optionalString(topic.id),
    topicName: requireNonEmptyString(topic.topicName, "topicName"),
    subtopics: normalizeSubtopics(topic.subtopics || {})
  });
}

function normalizeTopics(topics = []) {
  if (!Array.isArray(topics)) {
    throw new Error("topics must be an array.");
  }

  return topics.map(normalizeTopic);
}

function toSyllabusTopic(data) {
  if (!data) {
    return null;
  }

  return normalizeTopic(data);
}

function toSyllabus(data, topics = []) {
  if (!data) {
    return null;
  }

  return new Syllabus({
    id: data.id,
    country: data.country,
    level: data.level,
    year: data.year,
    subject: data.subject,
    active: Boolean(data.active),
    assessmentFrameworkId: data.assessmentFrameworkId || null,
    topics: topics.map(toSyllabusTopic).filter(Boolean)
  });
}

function toSyllabusRecord(syllabus) {
  const assessmentFrameworkId = optionalString(syllabus.assessmentFrameworkId);
  const record = {
    country: requireNonEmptyString(syllabus.country, "country"),
    level: requireNonEmptyString(syllabus.level, "level"),
    year: requireNumber(syllabus.year, "year"),
    subject: requireNonEmptyString(syllabus.subject, "subject"),
    active: Boolean(syllabus.active)
  };

  if (assessmentFrameworkId) {
    record.assessmentFrameworkId = assessmentFrameworkId;
  }

  return record;
}

function toSyllabusTopicRecord(topic) {
  return {
    topicName: requireNonEmptyString(topic.topicName, "topicName"),
    subtopics: normalizeSubtopics(topic.subtopics || {})
  };
}

function applyScopeFilter(query, fieldName, value) {
  if (value === undefined || value === null || value === "") {
    return query;
  }

  return query.where(fieldName, "==", value);
}

export class FirestoreSyllabusRepository extends SyllabusRepository {
  async getById(syllabusId) {
    const data = await readDocument(SYLLABUSES_COLLECTION, syllabusId);

    if (!data) {
      return null;
    }

    const topics = await readCollection(getTopicsCollectionPath(syllabusId));

    return toSyllabus(data, topics);
  }

  async list() {
    const syllabuses = await readCollection(SYLLABUSES_COLLECTION);
    const syllabusesWithTopics = await Promise.all(
      syllabuses.map(async (syllabus) => this.getById(syllabus.id))
    );

    return syllabusesWithTopics
      .filter(Boolean)
      .sort((first, second) => {
        const scope = `${first.country}|${first.level}|${first.year}|${first.subject}`;
        const nextScope = `${second.country}|${second.level}|${second.year}|${second.subject}`;

        return scope.localeCompare(nextScope);
      });
  }

  async findByScope(scope = {}) {
    const year = scope.year === undefined || scope.year === null || scope.year === ""
      ? null
      : requireNumber(scope.year, "year");
    const syllabuses = await readCollection(
      SYLLABUSES_COLLECTION,
      (collection) => {
        let query = collection;
        query = applyScopeFilter(query, "country", scope.country);
        query = applyScopeFilter(query, "level", scope.level);
        query = applyScopeFilter(query, "year", year);
        query = applyScopeFilter(query, "subject", scope.subject);

        if (scope.active !== undefined && scope.active !== null) {
          query = query.where("active", "==", Boolean(scope.active));
        }

        return query;
      }
    );
    const syllabusesWithTopics = await Promise.all(
      syllabuses.map(async (syllabus) => this.getById(syllabus.id))
    );

    return syllabusesWithTopics.filter(Boolean);
  }

  async save(syllabus) {
    const syllabusRecord = toSyllabusRecord(syllabus);

    if (!syllabus.id) {
      const result = await createDocument(
        SYLLABUSES_COLLECTION,
        syllabusRecord
      );

      syllabus.id = result.id;
    } else {
      await writeDocument(
        SYLLABUSES_COLLECTION,
        syllabus.id,
        syllabusRecord,
        { merge: false }
      );
    }

    await this.replaceTopics(syllabus);

    return syllabus;
  }

  async replaceTopics(syllabus) {
    const topicsPath = getTopicsCollectionPath(syllabus.id);
    const existingTopics = await readCollection(topicsPath);
    const normalizedTopics = normalizeTopics(syllabus.topics || []);
    const savedTopicIds = new Set();

    for (const topic of normalizedTopics) {
      if (topic.id) {
        await writeDocument(
          topicsPath,
          topic.id,
          toSyllabusTopicRecord(topic),
          { merge: false }
        );
        savedTopicIds.add(topic.id);
      } else {
        const result = await createDocument(
          topicsPath,
          toSyllabusTopicRecord(topic)
        );
        topic.id = result.id;
        savedTopicIds.add(topic.id);
      }
    }

    await Promise.all(
      existingTopics
        .filter((topic) => !savedTopicIds.has(topic.id))
        .map((topic) => deleteDocument(topicsPath, topic.id))
    );

    syllabus.topics = normalizedTopics;
  }

  async delete(syllabusId) {
    const topicsPath = getTopicsCollectionPath(syllabusId);
    const topics = await readCollection(topicsPath);

    await Promise.all(
      topics.map((topic) => deleteDocument(topicsPath, topic.id))
    );

    await deleteDocument(SYLLABUSES_COLLECTION, syllabusId);
  }
}
