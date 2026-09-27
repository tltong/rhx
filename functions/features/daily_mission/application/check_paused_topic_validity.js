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

async function refreshPausedTopicIds({
  studentId,
  syllabusId,
  pausedTopicIds,
  checkPausedTopicValidity,
} = {}) {
  const normalizedStudentId = requireDocumentId(studentId, "studentId");
  const normalizedSyllabusId = requireDocumentId(
    syllabusId,
    "syllabusId",
  );
  const checkValidity = requireFunction(
    checkPausedTopicValidity,
    "checkPausedTopicValidity",
  );
  const uniqueTopicIds = [...new Set(
    (Array.isArray(pausedTopicIds) ? pausedTopicIds : [])
      .map((topicId) => requireDocumentId(topicId, "topicId")),
  )];
  const validityResults = await Promise.all(uniqueTopicIds.map(
    async (topicId) => {
      const result = await checkValidity({
        studentId: normalizedStudentId,
        syllabusId: normalizedSyllabusId,
        topicId,
      });

      if (
        !result
        || result.studentId !== normalizedStudentId
        || result.syllabusId !== normalizedSyllabusId
        || result.topicId !== topicId
        || typeof result.isPaused !== "boolean"
      ) {
        throw new Error("The paused topic validity result is invalid.");
      }

      return {
        topicId,
        isPaused: result.isPaused,
      };
    },
  ));

  return validityResults
    .filter(({isPaused}) => isPaused)
    .map(({topicId}) => topicId);
}

class CheckPausedTopicValidity {
  constructor({
    dailyMissionRepository,
    getCurrentDate = currentUtcDate,
  } = {}) {
    if (
      !dailyMissionRepository
      || typeof dailyMissionRepository.checkPausedTopicValidity
        !== "function"
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
      topicId: requireDocumentId(topicId, "topicId"),
    };
    const result =
      await this.dailyMissionRepository.checkPausedTopicValidity({
        ...input,
        currentDate: await this.getCurrentDate(),
      });

    if (
      !result
      || typeof result.isPaused !== "boolean"
      || typeof result.unpaused !== "boolean"
    ) {
      throw new Error("The paused topic validity result is invalid.");
    }

    return Object.freeze({
      ...input,
      pausedDate: result.pausedDate ?? null,
      isPaused: result.isPaused,
      unpaused: result.unpaused,
    });
  }
}

module.exports = {
  CheckPausedTopicValidity,
  currentUtcDate,
  refreshPausedTopicIds,
};
