import {
  practiceMissionRoute
} from "./accept_core_daily_mission.js";
import {missionPracticeType, missionTypeFields} from "../domain/mission_practice_type.js?v=20261018-additional-essay-v1";

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
    getAssignedEssayPractice = async () => null,
    getCompletedEssayPractice = async () => null,
    getCurrentDate = currentUtcDate
  } = {}) {
    if (
      !dailyMissionRepository
      || typeof dailyMissionRepository.acceptAdditionalMission !== "function"
    ) {
      throw new Error("dailyMissionRepository is required.");
    }

    this.dailyMissionRepository = dailyMissionRepository;
    Object.assign(this, {getAssignedEssayPractice, getCompletedEssayPractice});
    this.getPracticeById = requireFunction(
      getPracticeById,
      "getPracticeById"
    );
    this.getCurrentDate = requireFunction(getCurrentDate, "getCurrentDate");
  }

  async execute({studentId, practiceId, practiceType} = {}) {
    const normalizedStudentId = requireDocumentId(studentId, "studentId");
    const normalizedPracticeId = requireDocumentId(practiceId, "practiceId");
    const type = missionPracticeType(practiceType);
    const reference = {studentId: normalizedStudentId, essayPracticeId: normalizedPracticeId};
    const practice = type === "essay"
      ? await this.getAssignedEssayPractice(reference) || await this.getCompletedEssayPractice(reference)
      : await this.getPracticeById(normalizedPracticeId);

    if (!practice) {
      throw createCodedError(
        "not-found",
        `Practice ${normalizedPracticeId} could not be found.`
      );
    }

    const {syllabusId, topicId} = type === "essay"
      ? {syllabusId: requireDocumentId(practice.syllabusId, "syllabusId"), topicId: requireDocumentId(practice.topicId, "topicId")}
      : practiceMissionRoute(practice);
    const date = normalizeDateKey(await this.getCurrentDate());
    const acceptance =
      await this.dailyMissionRepository.acceptAdditionalMission({
        studentId: normalizedStudentId,
        syllabusId,
        topicId,
        practiceId: normalizedPracticeId,
        date,
        ...missionTypeFields(type)
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
      ...missionTypeFields(type),
      isAccepted: true,
      created: acceptance.created
    });
  }
}

export {
  currentUtcDate
};
