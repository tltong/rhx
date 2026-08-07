const {
  ASSESSMENT_FRAMEWORKS_COLLECTION,
  ASSESSMENT_FRAMEWORK_LEVELS_SUBCOLLECTION,
  ASSESSMENT_FRAMEWORK_PRE_ASSESSMENT_DOCUMENT_ID,
  ASSESSMENT_FRAMEWORK_PRE_ASSESSMENT_SUBCOLLECTION,
} = require("../../../schema/assessment_framework_schema");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {
  AssessmentFramework,
  AssessmentFrameworkLevel,
  AssessmentFrameworkPreAssessment,
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

function getPreAssessmentCollectionPath(assessmentFrameworkId) {
  return [
    ASSESSMENT_FRAMEWORKS_COLLECTION,
    assessmentFrameworkId,
    ASSESSMENT_FRAMEWORK_PRE_ASSESSMENT_SUBCOLLECTION,
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

function toAssessmentFrameworkPreAssessment(data) {
  if (!data) {
    return null;
  }

  return new AssessmentFrameworkPreAssessment({
    numberOfQuestions: data.numberOfQuestions,
    difficultySplit: data.difficultySplit,
    scoreLevelSplit: data.scoreLevelSplit,
  });
}

function toAssessmentFramework(data, levels, preAssessment = null) {
  return new AssessmentFramework({
    id: data.id,
    name: data.name,
    endLevelName: data.endLevelName,
    levels,
    preAssessment,
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

    const [levelRecords, preAssessmentRecord] = await Promise.all([
      this.readCollection(getLevelsCollectionPath(id)),
      this.readDocument(
        getPreAssessmentCollectionPath(id),
        ASSESSMENT_FRAMEWORK_PRE_ASSESSMENT_DOCUMENT_ID,
      ),
    ]);
    const levels = levelRecords.map(toAssessmentFrameworkLevel);
    const preAssessment = toAssessmentFrameworkPreAssessment(
      preAssessmentRecord,
    );

    return toAssessmentFramework(
      { ...data, id },
      levels,
      preAssessment,
    );
  }

  async list() {
    const frameworkRecords = await this.readCollection(
      ASSESSMENT_FRAMEWORKS_COLLECTION,
    );
    const frameworks = await Promise.all(
      frameworkRecords.map(async (record) => {
        return this.getById(record.id);
      }),
    );

    return frameworks.filter(Boolean).sort((first, second) =>
      first.name.localeCompare(second.name),
    );
  }
}

module.exports = {
  FirestoreAssessmentFrameworkRepository,
};
