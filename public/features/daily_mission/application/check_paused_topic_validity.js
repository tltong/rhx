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

function normalizePausedDate(value) {
  if (value === null) {
    return null;
  }

  const date = String(value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("pausedDate must use YYYY-MM-DD format.");
  }

  return date;
}

function normalizeResult(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The paused topic validity response is invalid.");
  }

  const studentId = requireDocumentId(value.studentId, "studentId");
  const syllabusId = requireDocumentId(value.syllabusId, "syllabusId");
  const topicId = requireDocumentId(value.topicId, "topicId");
  const pausedDate = normalizePausedDate(value.pausedDate);

  if (
    studentId !== expected.studentId
    || syllabusId !== expected.syllabusId
    || topicId !== expected.topicId
  ) {
    throw new Error(
      "The paused topic validity response has an unexpected route."
    );
  }

  if (
    typeof value.isPaused !== "boolean"
    || typeof value.unpaused !== "boolean"
    || (value.isPaused && value.unpaused)
  ) {
    throw new Error(
      "The paused topic validity response has an invalid status."
    );
  }

  if ((value.isPaused || value.unpaused) && pausedDate === null) {
    throw new Error(
      "The paused topic validity response requires pausedDate."
    );
  }

  return Object.freeze({
    studentId,
    syllabusId,
    topicId,
    pausedDate,
    isPaused: value.isPaused,
    unpaused: value.unpaused
  });
}

export class CheckPausedTopicValidity {
  constructor(dailyMissionGateway) {
    if (
      !dailyMissionGateway
      || typeof dailyMissionGateway.checkPausedTopicValidity !== "function"
    ) {
      throw new Error("dailyMissionGateway is required.");
    }

    this.dailyMissionGateway = dailyMissionGateway;
  }

  async execute({ studentId, syllabusId, topicId } = {}) {
    const input = {
      studentId: requireDocumentId(studentId, "studentId"),
      syllabusId: requireDocumentId(syllabusId, "syllabusId"),
      topicId: requireDocumentId(topicId, "topicId")
    };
    const result =
      await this.dailyMissionGateway.checkPausedTopicValidity(input);

    return normalizeResult(result, input);
  }
}
