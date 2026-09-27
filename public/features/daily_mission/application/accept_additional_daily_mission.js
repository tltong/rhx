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

  return date;
}

function normalizeAcceptance(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      "The additional daily mission acceptance response is invalid."
    );
  }

  const studentId = requireDocumentId(value.studentId, "studentId");
  const practiceId = requireDocumentId(value.practiceId, "practiceId");

  if (studentId !== expected.studentId) {
    throw new Error(
      "The additional mission acceptance has an unexpected studentId."
    );
  }

  if (practiceId !== expected.practiceId) {
    throw new Error(
      "The additional mission acceptance has an unexpected practiceId."
    );
  }

  if (value.isAccepted !== true) {
    throw new Error("The additional daily mission was not accepted.");
  }

  if (typeof value.created !== "boolean") {
    throw new Error(
      "The additional mission acceptance has an invalid created value."
    );
  }

  return Object.freeze({
    studentId,
    syllabusId: requireDocumentId(value.syllabusId, "syllabusId"),
    topicId: requireDocumentId(value.topicId, "topicId"),
    practiceId,
    date: requireDateKey(value.date),
    isAccepted: true,
    created: value.created
  });
}

export class AcceptAdditionalDailyMission {
  constructor(dailyMissionGateway) {
    if (
      !dailyMissionGateway
      || typeof dailyMissionGateway.acceptAdditionalDailyMission
        !== "function"
    ) {
      throw new Error("dailyMissionGateway is required.");
    }

    this.dailyMissionGateway = dailyMissionGateway;
  }

  async execute({ studentId, practiceId } = {}) {
    const input = {
      studentId: requireDocumentId(studentId, "studentId"),
      practiceId: requireDocumentId(practiceId, "practiceId")
    };
    const result =
      await this.dailyMissionGateway.acceptAdditionalDailyMission(input);

    return normalizeAcceptance(result, input);
  }
}
