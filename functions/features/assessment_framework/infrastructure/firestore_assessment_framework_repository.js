const {
  ASSESSMENT_FRAMEWORKS_COLLECTION,
  ASSESSMENT_FRAMEWORK_LEVELS_SUBCOLLECTION,
} = require("../../../schema/assessment_framework_schema");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {
  AssessmentFramework,
  AssessmentFrameworkLevel,
} = require("../domain/assessment_framework");
const {
  AssessmentFrameworkRepository,
} = require("../domain/assessment_framework_repository");

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value.trim();
}

function getLevelsCollectionPath(assessmentFrameworkId) {
  return [
    ASSESSMENT_FRAMEWORKS_COLLECTION,
    assessmentFrameworkId,
    ASSESSMENT_FRAMEWORK_LEVELS_SUBCOLLECTION,
  ].join("/");
}

function toAssessmentFrameworkLevel(data) {
  return new AssessmentFrameworkLevel({
    id: data.id,
    levelName: data.levelName,
    sequenceOrder: data.sequenceOrder,
    criteria: data.criteria,
  });
}

function toAssessmentFramework(data, levels) {
  return new AssessmentFramework({
    id: data.id,
    name: data.name,
    endLevelName: data.endLevelName,
    levels,
  });
}

class FirestoreAssessmentFrameworkRepository
  extends AssessmentFrameworkRepository {
  constructor({
    readDocument = firebaseOps.readDocument,
    readCollection = firebaseOps.readCollection,
  } = {}) {
    super();
    this.readDocument = readDocument;
    this.readCollection = readCollection;
  }

  async getById(assessmentFrameworkId) {
    const id = requireNonEmptyString(
      assessmentFrameworkId,
      "assessmentFrameworkId",
    );
    const data = await this.readDocument(
      ASSESSMENT_FRAMEWORKS_COLLECTION,
      id,
    );

    if (!data) {
      return null;
    }

    const levelRecords = await this.readCollection(
      getLevelsCollectionPath(id),
    );
    const levels = levelRecords.map(toAssessmentFrameworkLevel);

    return toAssessmentFramework({ ...data, id }, levels);
  }

  async list() {
    const frameworkRecords = await this.readCollection(
      ASSESSMENT_FRAMEWORKS_COLLECTION,
    );
    const frameworks = await Promise.all(
      frameworkRecords.map(async (record) => {
        const id = requireNonEmptyString(
          record.id,
          "assessment framework id",
        );
        const levelRecords = await this.readCollection(
          getLevelsCollectionPath(id),
        );

        return toAssessmentFramework(
          { ...record, id },
          levelRecords.map(toAssessmentFrameworkLevel),
        );
      }),
    );

    return frameworks.sort((first, second) =>
      first.name.localeCompare(second.name),
    );
  }
}

module.exports = {
  FirestoreAssessmentFrameworkRepository,
};
