import {
  ASSESSMENT_FRAMEWORK_LEVELS_SUBCOLLECTION,
  ASSESSMENT_FRAMEWORKS_COLLECTION,
  assessmentFrameworkSchema
} from "../config/firebase/assessment_framework_schema.js";
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

function requireDocumentId(value, name) {
  return requireNonEmptyString(value, name);
}

function hasOwnValue(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function normalizeNumber(value, name) {
  const numberValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numberValue)) {
    throw new Error(`${name} must be a number.`);
  }

  return numberValue;
}

function normalizeFrameworkData({ name, endLevelName } = {}) {
  return {
    name: requireNonEmptyString(name, "name"),
    endLevelName: requireNonEmptyString(endLevelName, "endLevelName")
  };
}

function normalizeFrameworkUpdates(updates = {}) {
  const source = requireObject(updates, "updates");
  const allowedUpdates = {};

  if (hasOwnValue(source, "name")) {
    allowedUpdates.name = requireNonEmptyString(source.name, "name");
  }

  if (hasOwnValue(source, "endLevelName")) {
    allowedUpdates.endLevelName = requireNonEmptyString(
      source.endLevelName,
      "endLevelName"
    );
  }

  if (Object.keys(allowedUpdates).length === 0) {
    throw new Error("No valid assessment framework updates were provided.");
  }

  return allowedUpdates;
}

function normalizeCriteria(criteria = {}) {
  const source = requireObject(criteria, "criteria");

  return {
    requiredPracticeCount: normalizeNumber(
      source.requiredPracticeCount,
      "criteria.requiredPracticeCount"
    ),
    minimumScore: normalizeNumber(source.minimumScore, "criteria.minimumScore"),
    questionsPerPractice: normalizeNumber(
      source.questionsPerPractice,
      "criteria.questionsPerPractice"
    ),
    difficultyLevel: requireNonEmptyString(
      source.difficultyLevel,
      "criteria.difficultyLevel"
    )
  };
}

function normalizeLevelData({ levelName, sequenceOrder, criteria } = {}) {
  return {
    levelName: requireNonEmptyString(levelName, "levelName"),
    sequenceOrder: normalizeNumber(sequenceOrder, "sequenceOrder"),
    criteria: normalizeCriteria(criteria)
  };
}

function normalizeCriteriaUpdates(criteria = {}) {
  const source = requireObject(criteria, "criteria");
  const allowedUpdates = {};

  if (hasOwnValue(source, "requiredPracticeCount")) {
    allowedUpdates["criteria.requiredPracticeCount"] = normalizeNumber(
      source.requiredPracticeCount,
      "criteria.requiredPracticeCount"
    );
  }

  if (hasOwnValue(source, "minimumScore")) {
    allowedUpdates["criteria.minimumScore"] = normalizeNumber(
      source.minimumScore,
      "criteria.minimumScore"
    );
  }

  if (hasOwnValue(source, "questionsPerPractice")) {
    allowedUpdates["criteria.questionsPerPractice"] = normalizeNumber(
      source.questionsPerPractice,
      "criteria.questionsPerPractice"
    );
  }

  if (hasOwnValue(source, "difficultyLevel")) {
    allowedUpdates["criteria.difficultyLevel"] = requireNonEmptyString(
      source.difficultyLevel,
      "criteria.difficultyLevel"
    );
  }

  if (Object.keys(allowedUpdates).length === 0) {
    throw new Error("criteria must include at least one valid update.");
  }

  return allowedUpdates;
}

function normalizeLevelUpdates(updates = {}) {
  const source = requireObject(updates, "updates");
  const allowedUpdates = {};

  if (hasOwnValue(source, "levelName")) {
    allowedUpdates.levelName = requireNonEmptyString(source.levelName, "levelName");
  }

  if (hasOwnValue(source, "sequenceOrder")) {
    allowedUpdates.sequenceOrder = normalizeNumber(source.sequenceOrder, "sequenceOrder");
  }

  if (hasOwnValue(source, "criteria")) {
    Object.assign(allowedUpdates, normalizeCriteriaUpdates(source.criteria));
  }

  if (Object.keys(allowedUpdates).length === 0) {
    throw new Error("No valid assessment framework level updates were provided.");
  }

  return allowedUpdates;
}

export class AssessmentFrameworkHandler {
  getSchema() {
    return assessmentFrameworkSchema;
  }

  getLevelsCollectionPath(frameworkId) {
    const id = requireDocumentId(frameworkId, "frameworkId");

    return `${ASSESSMENT_FRAMEWORKS_COLLECTION}/${id}/${ASSESSMENT_FRAMEWORK_LEVELS_SUBCOLLECTION}`;
  }

  async createAssessmentFramework(frameworkData = {}) {
    const data = normalizeFrameworkData(frameworkData);
    const result = await createDocument(ASSESSMENT_FRAMEWORKS_COLLECTION, data);

    return this.readAssessmentFramework(result.id);
  }

  async readAssessmentFramework(frameworkId) {
    return readDocument(
      ASSESSMENT_FRAMEWORKS_COLLECTION,
      requireDocumentId(frameworkId, "frameworkId")
    );
  }

  async readAssessmentFrameworks(buildQuery = null) {
    return readCollection(ASSESSMENT_FRAMEWORKS_COLLECTION, buildQuery);
  }

  async readAssessmentFrameworkWithLevels(frameworkId) {
    const framework = await this.readAssessmentFramework(frameworkId);

    if (!framework) {
      return {
        framework: null,
        levels: []
      };
    }

    return {
      framework,
      levels: await this.readAssessmentFrameworkLevels(framework.id)
    };
  }

  async writeAssessmentFramework(
    frameworkId,
    frameworkData = {},
    options = { merge: true }
  ) {
    const id = requireDocumentId(frameworkId, "frameworkId");
    const data = normalizeFrameworkData(frameworkData);

    await writeDocument(ASSESSMENT_FRAMEWORKS_COLLECTION, id, data, options);

    return this.readAssessmentFramework(id);
  }

  async updateAssessmentFramework(frameworkId, updates = {}) {
    const id = requireDocumentId(frameworkId, "frameworkId");

    await updateDocument(
      ASSESSMENT_FRAMEWORKS_COLLECTION,
      id,
      normalizeFrameworkUpdates(updates)
    );

    return this.readAssessmentFramework(id);
  }

  async deleteAssessmentFramework(frameworkId) {
    const id = requireDocumentId(frameworkId, "frameworkId");

    await deleteDocument(ASSESSMENT_FRAMEWORKS_COLLECTION, id);

    return {
      id,
      deleted: true
    };
  }

  async createAssessmentFrameworkLevel(frameworkId, levelData = {}, levelId = null) {
    const collectionPath = this.getLevelsCollectionPath(frameworkId);
    const data = normalizeLevelData(levelData);
    const result = await createDocument(collectionPath, data, levelId);

    return this.readAssessmentFrameworkLevel(frameworkId, result.id);
  }

  async readAssessmentFrameworkLevel(frameworkId, levelId) {
    return readDocument(
      this.getLevelsCollectionPath(frameworkId),
      requireDocumentId(levelId, "levelId")
    );
  }

  async readAssessmentFrameworkLevels(frameworkId, buildQuery = null) {
    return readCollection(this.getLevelsCollectionPath(frameworkId), buildQuery);
  }

  async writeAssessmentFrameworkLevel(
    frameworkId,
    levelId,
    levelData = {},
    options = { merge: true }
  ) {
    const id = requireDocumentId(levelId, "levelId");
    const data = normalizeLevelData(levelData);

    await writeDocument(this.getLevelsCollectionPath(frameworkId), id, data, options);

    return this.readAssessmentFrameworkLevel(frameworkId, id);
  }

  async updateAssessmentFrameworkLevel(frameworkId, levelId, updates = {}) {
    const id = requireDocumentId(levelId, "levelId");

    await updateDocument(
      this.getLevelsCollectionPath(frameworkId),
      id,
      normalizeLevelUpdates(updates)
    );

    return this.readAssessmentFrameworkLevel(frameworkId, id);
  }

  async deleteAssessmentFrameworkLevel(frameworkId, levelId) {
    const id = requireDocumentId(levelId, "levelId");

    await deleteDocument(this.getLevelsCollectionPath(frameworkId), id);

    return {
      id,
      frameworkId: requireDocumentId(frameworkId, "frameworkId"),
      deleted: true
    };
  }
}

const assessmentFrameworkHandler = new AssessmentFrameworkHandler();

export function getAssessmentFrameworkSchema() {
  return assessmentFrameworkHandler.getSchema();
}

export function getAssessmentFrameworkLevelsCollectionPath(frameworkId) {
  return assessmentFrameworkHandler.getLevelsCollectionPath(frameworkId);
}

export function createAssessmentFramework(frameworkData) {
  return assessmentFrameworkHandler.createAssessmentFramework(frameworkData);
}

export function readAssessmentFramework(frameworkId) {
  return assessmentFrameworkHandler.readAssessmentFramework(frameworkId);
}

export function readAssessmentFrameworks(buildQuery = null) {
  return assessmentFrameworkHandler.readAssessmentFrameworks(buildQuery);
}

export function readAssessmentFrameworkWithLevels(frameworkId) {
  return assessmentFrameworkHandler.readAssessmentFrameworkWithLevels(frameworkId);
}

export function writeAssessmentFramework(
  frameworkId,
  frameworkData,
  options = { merge: true }
) {
  return assessmentFrameworkHandler.writeAssessmentFramework(
    frameworkId,
    frameworkData,
    options
  );
}

export function updateAssessmentFramework(frameworkId, updates) {
  return assessmentFrameworkHandler.updateAssessmentFramework(frameworkId, updates);
}

export function deleteAssessmentFramework(frameworkId) {
  return assessmentFrameworkHandler.deleteAssessmentFramework(frameworkId);
}

export function createAssessmentFrameworkLevel(
  frameworkId,
  levelData,
  levelId = null
) {
  return assessmentFrameworkHandler.createAssessmentFrameworkLevel(
    frameworkId,
    levelData,
    levelId
  );
}

export function readAssessmentFrameworkLevel(frameworkId, levelId) {
  return assessmentFrameworkHandler.readAssessmentFrameworkLevel(frameworkId, levelId);
}

export function readAssessmentFrameworkLevels(frameworkId, buildQuery = null) {
  return assessmentFrameworkHandler.readAssessmentFrameworkLevels(
    frameworkId,
    buildQuery
  );
}

export function writeAssessmentFrameworkLevel(
  frameworkId,
  levelId,
  levelData,
  options = { merge: true }
) {
  return assessmentFrameworkHandler.writeAssessmentFrameworkLevel(
    frameworkId,
    levelId,
    levelData,
    options
  );
}

export function updateAssessmentFrameworkLevel(frameworkId, levelId, updates) {
  return assessmentFrameworkHandler.updateAssessmentFrameworkLevel(
    frameworkId,
    levelId,
    updates
  );
}

export function deleteAssessmentFrameworkLevel(frameworkId, levelId) {
  return assessmentFrameworkHandler.deleteAssessmentFrameworkLevel(frameworkId, levelId);
}

export default assessmentFrameworkHandler;
