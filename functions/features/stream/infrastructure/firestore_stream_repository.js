const {
  STREAMS_COLLECTION,
  STREAM_YEARS_SUBCOLLECTION,
} = require("../../../schema/stream_schema");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {
  Stream,
  StreamYearAssignment,
} = require("../domain/stream");
const { StreamRepository } = require("../domain/stream_repository");

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function yearsCollectionPath(streamId) {
  return [
    STREAMS_COLLECTION,
    requireIdentifier(streamId, "streamId"),
    STREAM_YEARS_SUBCOLLECTION,
  ].join("/");
}

function toStreamYearAssignment(data) {
  const syllabusEntries = data.syllabuses &&
    typeof data.syllabuses === "object" &&
    !Array.isArray(data.syllabuses) ?
      Object.entries(data.syllabuses) :
      (data.syllabusIds || []).map((syllabusId) => [
        syllabusId,
        {language: ""},
      ]);

  return new StreamYearAssignment({
    year: data.year ?? data.id,
    syllabuses: syllabusEntries.map(([syllabusId, assignment]) => ({
      syllabusId,
      language: assignment?.language,
    })),
  });
}

function toStream(data, years = []) {
  if (!data) {
    return null;
  }

  return new Stream({
    id: data.id,
    name: data.name,
    country: data.country,
    level: data.level,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    years,
  });
}

function toStreamRecord(stream) {
  return {
    name: stream.name,
    country: stream.country,
    level: stream.level,
    createdAt: stream.createdAt,
    updatedAt: stream.updatedAt,
  };
}

function toYearRecord(assignment) {
  return {
    year: assignment.year,
    syllabuses: Object.fromEntries(
      assignment.syllabuses.map(({syllabusId, language}) => [
        syllabusId,
        {language},
      ]),
    ),
  };
}

class FirestoreStreamRepository extends StreamRepository {
  constructor({
    createDocument = firebaseOps.createDocument,
    deleteDocument = firebaseOps.deleteDocument,
    readCollection = firebaseOps.readCollection,
    readCollectionIds = firebaseOps.readCollectionIds,
    readDocument = firebaseOps.readDocument,
    writeDocument = firebaseOps.writeDocument,
  } = {}) {
    super();
    this.createDocument = createDocument;
    this.deleteDocument = deleteDocument;
    this.readCollection = readCollection;
    this.readCollectionIds = readCollectionIds;
    this.readDocument = readDocument;
    this.writeDocument = writeDocument;
  }

  async getById(streamId) {
    const id = requireIdentifier(streamId, "streamId");
    const [data, yearRecords] = await Promise.all([
      this.readDocument(STREAMS_COLLECTION, id),
      this.readCollection(yearsCollectionPath(id)),
    ]);

    if (!data) {
      return null;
    }

    return toStream(
      data,
      yearRecords.map(toStreamYearAssignment),
    );
  }

  async list() {
    const records = await this.readCollection(STREAMS_COLLECTION);
    const streams = await Promise.all(
      records.map((record) => this.getById(record.id)),
    );

    return streams
      .filter(Boolean)
      .sort((first, second) => first.name.localeCompare(second.name));
  }

  async create(stream) {
    const result = await this.createDocument(
      STREAMS_COLLECTION,
      toStreamRecord(stream),
    );

    stream.id = result.id;

    return stream;
  }

  async save(stream) {
    const id = requireIdentifier(stream.id, "streamId");

    await this.writeDocument(
      STREAMS_COLLECTION,
      id,
      toStreamRecord(stream),
      {merge: false},
    );

    return stream;
  }

  async saveYearAssignment(streamId, assignment) {
    const normalizedAssignment = assignment instanceof StreamYearAssignment
      ? assignment
      : new StreamYearAssignment(assignment);

    await this.writeDocument(
      yearsCollectionPath(streamId),
      String(normalizedAssignment.year),
      toYearRecord(normalizedAssignment),
      {merge: false},
    );

    return normalizedAssignment;
  }

  async deleteYearAssignment(streamId, year) {
    return this.deleteDocument(
      yearsCollectionPath(streamId),
      String(year),
    );
  }

  async delete(streamId) {
    const id = requireIdentifier(streamId, "streamId");
    const collectionPath = yearsCollectionPath(id);
    const yearIds = await this.readCollectionIds(collectionPath);

    await Promise.all(
      yearIds.map((yearId) => (
        this.deleteDocument(collectionPath, yearId)
      )),
    );

    return this.deleteDocument(STREAMS_COLLECTION, id);
  }
}

module.exports = {
  FirestoreStreamRepository,
};
