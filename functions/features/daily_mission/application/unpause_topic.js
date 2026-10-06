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

class UnpauseTopic {
  constructor({dailyMissionRepository} = {}) {
    if (
      !dailyMissionRepository
      || typeof dailyMissionRepository.unpauseTopic !== "function"
    ) {
      throw new Error("dailyMissionRepository is required.");
    }

    this.dailyMissionRepository = dailyMissionRepository;
  }

  async execute({studentId, syllabusId, topicId} = {}) {
    const input = {
      studentId: requireDocumentId(studentId, "studentId"),
      syllabusId: requireDocumentId(syllabusId, "syllabusId"),
      topicId: requireDocumentId(topicId, "topicId"),
    };

    await this.dailyMissionRepository.unpauseTopic(input);

    return Object.freeze({
      ...input,
      isPaused: false,
    });
  }
}

module.exports = {
  UnpauseTopic,
};
