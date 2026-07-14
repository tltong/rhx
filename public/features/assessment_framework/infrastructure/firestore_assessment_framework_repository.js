import {
  AssessmentFramework,
  AssessmentFrameworkLevel
} from "../domain/assessment_framework.js";
import { AssessmentFrameworkRepository } from "../domain/assessment_framework_repository.js";
import {
  ASSESSMENT_FRAMEWORKS_COLLECTION,
  ASSESSMENT_FRAMEWORK_LEVELS_SUBCOLLECTION
} from "../../../config/firebase/assessment_framework_schema.js";
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

function getLevelsCollectionPath(assessmentFrameworkId) {
  return [
    ASSESSMENT_FRAMEWORKS_COLLECTION,
    assessmentFrameworkId,
    ASSESSMENT_FRAMEWORK_LEVELS_SUBCOLLECTION
  ].join("/");
}

function buildLevelId(level, index) {
  const source = level.id || level.levelName || `level_${index + 1}`;

  return String(source)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || `level_${index + 1}`;
}

function normalizeCriteria(criteria = {}) {
  const source = requireObject(criteria, "criteria");

  return {
    requiredPracticeCount: requireNumber(
      source.requiredPracticeCount,
      "criteria.requiredPracticeCount"
    ),
    minimumScore: requireNumber(
      source.minimumScore,
      "criteria.minimumScore"
    ),
    questionsPerPractice: requireNumber(
      source.questionsPerPractice,
      "criteria.questionsPerPractice"
    ),
    difficultyLevel: requireNonEmptyString(
      source.difficultyLevel,
      "criteria.difficultyLevel"
    )
  };
}

function normalizeLevel(level, index) {
  const normalizedLevel = new AssessmentFrameworkLevel({
    id: buildLevelId(level, index),
    levelName: requireNonEmptyString(level.levelName, "levelName"),
    sequenceOrder: requireNumber(level.sequenceOrder, "sequenceOrder"),
    criteria: normalizeCriteria(level.criteria || {})
  });

  return normalizedLevel;
}

function normalizeLevels(levels = []) {
  if (!Array.isArray(levels)) {
    throw new Error("levels must be an array.");
  }

  return levels
    .map(normalizeLevel)
    .sort((first, second) => first.sequenceOrder - second.sequenceOrder);
}

function toAssessmentFrameworkLevel(data) {
  return normalizeLevel(data, 0);
}

function toAssessmentFramework(data, levels = []) {
  if (!data) {
    return null;
  }

  return new AssessmentFramework({
    id: data.id,
    name: data.name,
    endLevelName: data.endLevelName,
    levels: levels.map(toAssessmentFrameworkLevel)
  });
}

function toAssessmentFrameworkRecord(assessmentFramework) {
  return {
    name: requireNonEmptyString(assessmentFramework.name, "name"),
    endLevelName: requireNonEmptyString(
      assessmentFramework.endLevelName,
      "endLevelName"
    )
  };
}

function toAssessmentFrameworkLevelRecord(level) {
  return {
    levelName: requireNonEmptyString(level.levelName, "levelName"),
    sequenceOrder: requireNumber(level.sequenceOrder, "sequenceOrder"),
    criteria: normalizeCriteria(level.criteria || {})
  };
}

export class FirestoreAssessmentFrameworkRepository
  extends AssessmentFrameworkRepository {
  async getById(assessmentFrameworkId) {
    const data = await readDocument(
      ASSESSMENT_FRAMEWORKS_COLLECTION,
      assessmentFrameworkId
    );

    if (!data) {
      return null;
    }

    const levels = await readCollection(
      getLevelsCollectionPath(assessmentFrameworkId)
    );

    return toAssessmentFramework(data, levels);
  }

  async list() {
    const frameworks = await readCollection(ASSESSMENT_FRAMEWORKS_COLLECTION);
    const frameworksWithLevels = await Promise.all(
      frameworks.map(async (framework) => this.getById(framework.id))
    );

    return frameworksWithLevels
      .filter(Boolean)
      .sort((first, second) => first.name.localeCompare(second.name));
  }

  async save(assessmentFramework) {
    const frameworkRecord = toAssessmentFrameworkRecord(assessmentFramework);

    if (!assessmentFramework.id) {
      const result = await createDocument(
        ASSESSMENT_FRAMEWORKS_COLLECTION,
        frameworkRecord
      );

      assessmentFramework.id = result.id;
    } else {
      await writeDocument(
        ASSESSMENT_FRAMEWORKS_COLLECTION,
        assessmentFramework.id,
        frameworkRecord,
        { merge: false }
      );
    }

    await this.replaceLevels(assessmentFramework);

    return assessmentFramework;
  }

  async replaceLevels(assessmentFramework) {
    const levelsPath = getLevelsCollectionPath(assessmentFramework.id);
    const existingLevels = await readCollection(levelsPath);
    const normalizedLevels = normalizeLevels(assessmentFramework.levels || []);
    const nextLevelIds = new Set(normalizedLevels.map((level) => level.id));

    await Promise.all(
      existingLevels
        .filter((level) => !nextLevelIds.has(level.id))
        .map((level) => deleteDocument(levelsPath, level.id))
    );

    await Promise.all(
      normalizedLevels.map((level) => writeDocument(
        levelsPath,
        level.id,
        toAssessmentFrameworkLevelRecord(level),
        { merge: false }
      ))
    );

    assessmentFramework.levels = normalizedLevels;
  }

  async delete(assessmentFrameworkId) {
    const levelsPath = getLevelsCollectionPath(assessmentFrameworkId);
    const levels = await readCollection(levelsPath);

    await Promise.all(
      levels.map((level) => deleteDocument(levelsPath, level.id))
    );

    await deleteDocument(
      ASSESSMENT_FRAMEWORKS_COLLECTION,
      assessmentFrameworkId
    );
  }
}
