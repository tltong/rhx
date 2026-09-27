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

function normalizePracticeIds(value) {
  if (!Array.isArray(value)) {
    throw new Error(
      "The additional daily mission practice response is invalid."
    );
  }

  return Object.freeze(
    [...new Set(value.map((practiceId) => (
      requireDocumentId(practiceId, "practiceId")
    )))].sort((first, second) => first.localeCompare(second))
  );
}

export class ListAdditionalMissionPracticeIds {
  constructor(dailyMissionGateway) {
    if (
      !dailyMissionGateway
      || typeof dailyMissionGateway.listAdditionalMissionPracticeIds
        !== "function"
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
    const result =
      await this.dailyMissionGateway.listAdditionalMissionPracticeIds(
        input
      );

    return normalizePracticeIds(result);
  }
}
