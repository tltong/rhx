import {
  practiceMissionRoute
} from "./accept_core_daily_mission.js";

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

function normalizeDateKey(value) {
  const date = String(value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("date must use YYYY-MM-DD format.");
  }

  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new Error("date must be a valid calendar date.");
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

export class AcceptAdditionalDailyMission {
  constructor({
    dailyMissionRepository,
    getPracticeById,
    getCurrentDate = currentUtcDate
  } = {}) {
    if (
      !dailyMissionRepository
      || typeof dailyMissionRepository.acceptAdditionalMission !== "function"
    ) {
      throw new Error("dailyMissionRepository is required.");
    }

    this.dailyMissionRepository = dailyMissionRepository;
    this.getPracticeById = requireFunction(
      getPracticeById,
      "getPracticeById"
    );
    this.getCurrentDate = requireFunction(getCurrentDate, "getCurrentDate");
  }

  async execute({studentId, practiceId} = {}) {
    const normalizedStudentId = requireDocumentId(studentId, "studentId");
    const normalizedPracticeId = requireDocumentId(practiceId, "practiceId");
    const practice = await this.getPracticeById(normalizedPracticeId);

    if (!practice) {
      throw createCodedError(
        "not-found",
        `Practice ${normalizedPracticeId} could not be found.`
      );
    }

    const {syllabusId, topicId} = practiceMissionRoute(practice);
    const date = normalizeDateKey(await this.getCurrentDate());
    const acceptance =
      await this.dailyMissionRepository.acceptAdditionalMission({
        studentId: normalizedStudentId,
        syllabusId,
        topicId,
        practiceId: normalizedPracticeId,
        date
      });

    if (typeof acceptance?.created !== "boolean") {
      throw new Error(
        "The additional daily mission acceptance result is invalid."
      );
    }

    return Object.freeze({
      studentId: normalizedStudentId,
      syllabusId,
      topicId,
      practiceId: normalizedPracticeId,
      date,
      isAccepted: true,
      created: acceptance.created
    });
  }
}

export {
  currentUtcDate
};
