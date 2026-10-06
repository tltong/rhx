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

function currentUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

export class IsTopicPaused {
  constructor({
    dailyMissionRepository,
    getCurrentDate = currentUtcDate
  } = {}) {
    if (
      !dailyMissionRepository
      || typeof dailyMissionRepository.isTopicPaused !== "function"
    ) {
      throw new Error("dailyMissionRepository is required.");
    }

    this.dailyMissionRepository = dailyMissionRepository;
    this.getCurrentDate = requireFunction(getCurrentDate, "getCurrentDate");
  }

  async execute({studentId, syllabusId, topicId} = {}) {
    const input = {
      studentId: requireDocumentId(studentId, "studentId"),
      syllabusId: requireDocumentId(syllabusId, "syllabusId"),
      topicId: requireDocumentId(topicId, "topicId")
    };
    const isPaused = await this.dailyMissionRepository.isTopicPaused({
      ...input,
      currentDate: await this.getCurrentDate()
    });

    if (typeof isPaused !== "boolean") {
      throw new Error("The paused topic status response is invalid.");
    }

    return isPaused;
  }
}

export {
  currentUtcDate
};
