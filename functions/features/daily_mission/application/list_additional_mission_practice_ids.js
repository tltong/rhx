const {
  refreshPausedTopicIds,
} = require("./check_paused_topic_validity");
const {
  topicIdForPractice,
} = require("./get_next_core_daily_mission");

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

class ListAdditionalMissionPracticeIds {
  constructor({
    dailyMissionRepository,
    listAssignedPracticeIds,
    getPracticeById,
    checkPausedTopicValidity,
    getCurrentDate = currentUtcDate,
  } = {}) {
    if (
      !dailyMissionRepository
      || typeof dailyMissionRepository.getCoreMission !== "function"
      || typeof dailyMissionRepository.listPausedTopicIds !== "function"
      || typeof dailyMissionRepository.listAcceptedAdditionalPracticeIds
        !== "function"
    ) {
      throw new Error("dailyMissionRepository is required.");
    }

    this.dailyMissionRepository = dailyMissionRepository;
    this.listAssignedPracticeIds = requireFunction(
      listAssignedPracticeIds,
      "listAssignedPracticeIds",
    );
    this.getPracticeById = requireFunction(
      getPracticeById,
      "getPracticeById",
    );
    this.checkPausedTopicValidity = requireFunction(
      checkPausedTopicValidity,
      "checkPausedTopicValidity",
    );
    this.getCurrentDate = requireFunction(getCurrentDate, "getCurrentDate");
  }

  async execute({studentId, syllabusId} = {}) {
    const normalizedStudentId = requireDocumentId(studentId, "studentId");
    const normalizedSyllabusId = requireDocumentId(
      syllabusId,
      "syllabusId",
    );
    const date = normalizeDateKey(await this.getCurrentDate());
    const input = {
      studentId: normalizedStudentId,
      syllabusId: normalizedSyllabusId,
    };
    const [assignedPracticeIds, coreMission, pausedTopicIds] =
      await Promise.all([
        this.listAssignedPracticeIds({studentId: normalizedStudentId}),
        this.dailyMissionRepository.getCoreMission({...input, date}),
        this.dailyMissionRepository.listPausedTopicIds(input),
      ]);
    const uniquePracticeIds = [...new Set(
      (Array.isArray(assignedPracticeIds) ? assignedPracticeIds : [])
        .map((practiceId) => String(practiceId ?? "").trim())
        .filter(Boolean),
    )];
    const [practices, activePausedTopicIds] = await Promise.all([
      Promise.all(uniquePracticeIds.map(
        async (practiceId) => ({
          practiceId,
          practice: await this.getPracticeById(practiceId),
        }),
      )),
      refreshPausedTopicIds({
        ...input,
        pausedTopicIds,
        checkPausedTopicValidity: this.checkPausedTopicValidity,
      }),
    ]);
    const pausedTopics = new Set(activePausedTopicIds);
    const corePracticeId = String(coreMission?.practiceId ?? "").trim();
    const candidates = practices.flatMap(({practiceId, practice}) => {
      const topicId = topicIdForPractice(
        practice,
        normalizedSyllabusId,
      );

      if (
        !topicId
        || pausedTopics.has(topicId)
        || practiceId === corePracticeId
      ) {
        return [];
      }

      return [{topicId, practiceId}];
    });

    if (candidates.length === 0) {
      return Object.freeze([]);
    }

    const acceptedPracticeIds =
      await this.dailyMissionRepository
        .listAcceptedAdditionalPracticeIds({
          ...input,
          date,
          candidates,
        });
    const accepted = new Set(
      (Array.isArray(acceptedPracticeIds) ? acceptedPracticeIds : [])
        .map((practiceId) => String(practiceId ?? "").trim())
        .filter(Boolean),
    );

    return Object.freeze(
      candidates
        .map(({practiceId}) => practiceId)
        .filter((practiceId) => !accepted.has(practiceId))
        .sort((first, second) => first.localeCompare(second)),
    );
  }
}

module.exports = {
  ListAdditionalMissionPracticeIds,
  currentUtcDate,
};
