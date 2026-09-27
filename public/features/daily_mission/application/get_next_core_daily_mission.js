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

function requireDateKey(value) {
  const date = String(value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Daily mission date must use YYYY-MM-DD format.");
  }

  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new Error("Daily mission date must be a valid calendar date.");
  }

  return date;
}

function normalizeMission(value, expected) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The daily mission response is invalid.");
  }

  const studentId = requireDocumentId(value.studentId, "studentId");
  const syllabusId = requireDocumentId(value.syllabusId, "syllabusId");

  if (studentId !== expected.studentId) {
    throw new Error("The daily mission response has an unexpected studentId.");
  }

  if (syllabusId !== expected.syllabusId) {
    throw new Error("The daily mission response has an unexpected syllabusId.");
  }

  if (typeof value.isAccepted !== "boolean") {
    throw new Error("The daily mission response has an invalid isAccepted value.");
  }

  return Object.freeze({
    studentId,
    syllabusId,
    topicId: requireDocumentId(value.topicId, "topicId"),
    practiceId: requireDocumentId(value.practiceId, "practiceId"),
    date: requireDateKey(value.date),
    isAccepted: value.isAccepted
  });
}

export class GetNextCoreDailyMission {
  constructor(dailyMissionGateway) {
    if (
      !dailyMissionGateway
      || typeof dailyMissionGateway.getNextCoreDailyMission !== "function"
    ) {
      throw new Error("dailyMissionGateway is required.");
    }

    this.dailyMissionGateway = dailyMissionGateway;
  }

  async execute({ studentId, syllabusId } = {}) {
    const input = {
      studentId: requireDocumentId(studentId, "studentId"),
      syllabusId: requireDocumentId(syllabusId, "syllabusId")
    };
    const result = await this.dailyMissionGateway.getNextCoreDailyMission(
      input
    );

    return normalizeMission(result, input);
  }
}
