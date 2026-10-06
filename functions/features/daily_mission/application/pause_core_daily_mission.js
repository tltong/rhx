const {
  practiceMissionRoute,
} = require("./accept_core_daily_mission");

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new Error(`${name} must be a function.`);
  }

  return value;
}

function requireDocumentId(value, fieldName) {
  const id = String(value ?? "").trim();

  if (!id) {
    throw new Error(`${fieldName} is required.`);
  }

  if (id.includes("/")) {
    throw new Error(`${fieldName} must not contain a slash.`);
  }

  return id;
}

function normalizeDateKey(value, fieldName = "pausedDate") {
  const date = String(value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format.`);
  }

  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new Error(`${fieldName} must be a valid calendar date.`);
  }

  return date;
}

function currentUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function createCodedError(code, message) {
  const error = new Error(message);

  error.code = code;
  return error;
}

class PauseCoreDailyMission {
  constructor({
    dailyMissionRepository,
    getPracticeById,
    isTopicPausable,
    getCurrentDate = currentUtcDate,
  } = {}) {
    if (
      !dailyMissionRepository
      || typeof dailyMissionRepository.pauseTopic !== "function"
    ) {
      throw new Error("dailyMissionRepository is required.");
    }

    this.dailyMissionRepository = dailyMissionRepository;
    this.getPracticeById = requireFunction(
      getPracticeById,
      "getPracticeById",
    );
    this.getCurrentDate = requireFunction(getCurrentDate, "getCurrentDate");
    this.isTopicPausable = requireFunction(isTopicPausable, "isTopicPausable");
  }

  async execute({studentId, practiceId} = {}) {
    const normalizedStudentId = requireDocumentId(studentId, "studentId");
    const normalizedPracticeId = requireDocumentId(practiceId, "practiceId");
    const practice = await this.getPracticeById(normalizedPracticeId);

    if (!practice) {
      throw createCodedError(
        "not-found",
        `Practice ${normalizedPracticeId} could not be found.`,
      );
    }

    const {syllabusId, topicId} = practiceMissionRoute(practice);
    const pausable = await this.isTopicPausable(syllabusId, topicId);

    if (pausable !== true) {
      throw createCodedError(
        "failed-precondition",
        "This topic cannot be paused.",
      );
    }

    const requestedPausedDate = normalizeDateKey(
      await this.getCurrentDate(),
    );
    const pauseResult = await this.dailyMissionRepository.pauseTopic({
      studentId: normalizedStudentId,
      syllabusId,
      topicId,
      pausedDate: requestedPausedDate,
    });

    if (typeof pauseResult?.created !== "boolean") {
      throw new Error("The daily mission pause result is invalid.");
    }

    return Object.freeze({
      studentId: normalizedStudentId,
      syllabusId,
      topicId,
      practiceId: normalizedPracticeId,
      pausedDate: normalizeDateKey(pauseResult.pausedDate),
      isPaused: true,
      created: pauseResult.created,
    });
  }
}

module.exports = {
  PauseCoreDailyMission,
  currentUtcDate,
  normalizeDateKey,
};
