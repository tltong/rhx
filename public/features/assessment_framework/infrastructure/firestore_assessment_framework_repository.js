import {
  AssessmentFramework,
  AssessmentFrameworkLevel,
  AssessmentFrameworkPreAssessment
} from "../domain/assessment_framework.js?v=20260729-framework-wide-pre-assessment";
import { AssessmentFrameworkRepository } from "../domain/assessment_framework_repository.js";
import {
  ASSESSMENT_FRAMEWORKS_COLLECTION,
  ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
  ASSESSMENT_FRAMEWORK_LEVELS_SUBCOLLECTION,
  ASSESSMENT_FRAMEWORK_PRE_ASSESSMENT_DOCUMENT_ID,
  ASSESSMENT_FRAMEWORK_PRE_ASSESSMENT_SUBCOLLECTION,
  assessmentFrameworkPreAssessmentDifficultyLevels,
  assessmentFrameworkPreAssessmentScoreThresholds
} from "../../../config/firebase/assessment_framework_schema.js?v=20260729-framework-wide-pre-assessment";
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

function getPreAssessmentCollectionPath(assessmentFrameworkId) {
  return [
    ASSESSMENT_FRAMEWORKS_COLLECTION,
    assessmentFrameworkId,
    ASSESSMENT_FRAMEWORK_PRE_ASSESSMENT_SUBCOLLECTION
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

function requirePositiveInteger(value, name) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return numberValue;
}

function normalizePercentage(value, name) {
  const percentage = requireNumber(value, name);

  if (percentage < 0 || percentage > 100) {
    throw new Error(`${name} must be between 0 and 100.`);
  }

  return percentage;
}

function normalizeDifficultySplit(difficultySplit = {}) {
  const source = requireObject(difficultySplit, "difficultySplit");
  const normalizedSplit = Object.fromEntries(
    assessmentFrameworkPreAssessmentDifficultyLevels.map((difficulty) => {
      const fieldName = `${difficulty}Percentage`;

      return [
        fieldName,
        normalizePercentage(
          source[fieldName],
          `difficultySplit.${fieldName}`
        )
      ];
    })
  );
  const total = Object.values(normalizedSplit).reduce(
    (sum, percentage) => sum + percentage,
    0
  );

  if (Math.abs(total - 100) > 0.0001) {
    throw new Error("Difficulty percentages must total 100.");
  }

  return normalizedSplit;
}

function normalizeScoreLevelSplit(scoreLevelSplit = {}, levelIds) {
  const source = requireObject(scoreLevelSplit, "scoreLevelSplit");
  const validTargetIds = new Set([
    ...levelIds,
    ASSESSMENT_FRAMEWORK_END_LEVEL_ID
  ]);

  return Object.fromEntries(
    assessmentFrameworkPreAssessmentScoreThresholds.map((threshold) => {
      const fieldName = `over${threshold}Percent`;
      const levelId = requireNonEmptyString(
        source[fieldName],
        `scoreLevelSplit.${fieldName}`
      );

      if (!validTargetIds.has(levelId)) {
        throw new Error(
          `scoreLevelSplit.${fieldName} must reference an existing level or the end level.`
        );
      }

      return [fieldName, levelId];
    })
  );
}

function normalizePreAssessment(preAssessment, levels) {
  const levelIds = new Set(levels.map((level) => level.id));

  if (levelIds.size === 0) {
    throw new Error(
      "Assessment framework levels must be saved before pre-assessment configuration."
    );
  }

  return new AssessmentFrameworkPreAssessment({
    numberOfQuestions: requirePositiveInteger(
      preAssessment.numberOfQuestions,
      "numberOfQuestions"
    ),
    difficultySplit: normalizeDifficultySplit(
      preAssessment.difficultySplit
    ),
    scoreLevelSplit: normalizeScoreLevelSplit(
      preAssessment.scoreLevelSplit,
      levelIds
    )
  });
}

function toAssessmentFrameworkPreAssessment(data, levels) {
  return normalizePreAssessment({
    numberOfQuestions: data.numberOfQuestions,
    difficultySplit: data.difficultySplit,
    scoreLevelSplit: data.scoreLevelSplit
  }, levels);
}

function toAssessmentFramework(data, levels = [], preAssessment = null) {
  if (!data) {
    return null;
  }

  return new AssessmentFramework({
    id: data.id,
    name: data.name,
    endLevelName: data.endLevelName,
    levels,
    preAssessment
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

function toAssessmentFrameworkPreAssessmentRecord(preAssessment) {
  return {
    numberOfQuestions: preAssessment.numberOfQuestions,
    difficultySplit: { ...preAssessment.difficultySplit },
    scoreLevelSplit: { ...preAssessment.scoreLevelSplit }
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

    const [levelRecords, preAssessmentRecord] = await Promise.all([
      readCollection(getLevelsCollectionPath(assessmentFrameworkId)),
      readDocument(
        getPreAssessmentCollectionPath(assessmentFrameworkId),
        ASSESSMENT_FRAMEWORK_PRE_ASSESSMENT_DOCUMENT_ID
      )
    ]);
    const levels = normalizeLevels(levelRecords);
    const preAssessment = preAssessmentRecord
      ? toAssessmentFrameworkPreAssessment(preAssessmentRecord, levels)
      : null;

    return toAssessmentFramework(data, levels, preAssessment);
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
    if (assessmentFramework.preAssessment) {
      normalizePreAssessment(
        assessmentFramework.preAssessment,
        normalizedLevels
      );
    }
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

  async savePreAssessment(assessmentFramework, preAssessment) {
    const normalizedPreAssessment = normalizePreAssessment(
      preAssessment,
      assessmentFramework.levels || []
    );
    const preAssessmentPath = getPreAssessmentCollectionPath(
      assessmentFramework.id
    );
    const existingPreAssessmentRecords = await readCollection(
      preAssessmentPath
    );

    await Promise.all(
      existingPreAssessmentRecords
        .filter(
          (item) =>
            item.id !== ASSESSMENT_FRAMEWORK_PRE_ASSESSMENT_DOCUMENT_ID
        )
        .map((item) => deleteDocument(preAssessmentPath, item.id))
    );

    await writeDocument(
      preAssessmentPath,
      ASSESSMENT_FRAMEWORK_PRE_ASSESSMENT_DOCUMENT_ID,
      toAssessmentFrameworkPreAssessmentRecord(normalizedPreAssessment),
      { merge: false }
    );

    assessmentFramework.preAssessment = normalizedPreAssessment;

    return normalizedPreAssessment;
  }

  async delete(assessmentFrameworkId) {
    const levelsPath = getLevelsCollectionPath(assessmentFrameworkId);
    const preAssessmentPath = getPreAssessmentCollectionPath(
      assessmentFrameworkId
    );
    const [levels, preAssessmentRecords] = await Promise.all([
      readCollection(levelsPath),
      readCollection(preAssessmentPath)
    ]);

    await Promise.all(
      [
        ...levels.map((level) => deleteDocument(levelsPath, level.id)),
        ...preAssessmentRecords.map((preAssessment) => deleteDocument(
          preAssessmentPath,
          preAssessment.id
        ))
      ]
    );

    await deleteDocument(
      ASSESSMENT_FRAMEWORKS_COLLECTION,
      assessmentFrameworkId
    );
  }
}
