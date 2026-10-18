const {
  refreshPausedTopicIds,
} = require("./check_paused_topic_validity");
const {
  stableHash,
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

function normalizeDateKey(value, fieldName = "date") {
  const date = String(value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format.`);
  }

  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new Error(`${fieldName} must be a valid calendar date.`);
  }

  return date;
}

function compareStable(firstId, secondId, seed) {
  const firstHash = stableHash(`${seed}|${firstId}`);
  const secondHash = stableHash(`${seed}|${secondId}`);

  return firstHash - secondHash || firstId.localeCompare(secondId);
}

function toTopicStatsMap(records) {
  const stats = new Map();

  if (!Array.isArray(records)) {
    return stats;
  }

  records.forEach((record) => {
    const topicId = String(record?.topicId ?? "").trim();

    if (topicId) {
      stats.set(topicId, record?.lastAcceptedDate);
    }
  });

  return stats;
}

function compareTopicCandidates(first, second, stats, seed) {
  const firstRawDate = stats.get(first.topicId);
  const secondRawDate = stats.get(second.topicId);
  const firstDate = firstRawDate === undefined || firstRawDate === null
    ? null
    : normalizeDateKey(firstRawDate, "lastAcceptedDate");
  const secondDate = secondRawDate === undefined || secondRawDate === null
    ? null
    : normalizeDateKey(secondRawDate, "lastAcceptedDate");

  if (firstDate === null && secondDate !== null) {
    return -1;
  }

  if (firstDate !== null && secondDate === null) {
    return 1;
  }

  if (firstDate !== secondDate) {
    return firstDate.localeCompare(secondDate);
  }

  return compareStable(first.topicId, second.topicId, `${seed}|topic`);
}

function currentUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

class ListAdditionalMissionPracticeIds {
  constructor({
    dailyMissionRepository,
    listAssignedPracticeIds,
    listAssignedEssayPractices = async () => ({practices: [], nextCursor: null}),
    getPracticeById,
    checkPausedTopicValidity,
    getCurrentDate = currentUtcDate,
  } = {}) {
    if (
      !dailyMissionRepository
      || typeof dailyMissionRepository.getCoreMission !== "function"
      || typeof dailyMissionRepository.isPracticeCompleted !== "function"
      || typeof dailyMissionRepository.listPausedTopicIds !== "function"
      || typeof dailyMissionRepository.listAcceptedAdditionalTopicIds
        !== "function"
      || typeof dailyMissionRepository.listTopicStats !== "function"
    ) {
      throw new Error("dailyMissionRepository is required.");
    }

    this.dailyMissionRepository = dailyMissionRepository;
    this.listAssignedEssayPractices = listAssignedEssayPractices;
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

  async execute(input) {
    return Object.freeze((await this.listMissions(input)).map(mission => mission.practiceId));
  }

  async listMissions({studentId, syllabusId} = {}, {includeEssays = false} = {}) {
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
    const coreMission = await this.dailyMissionRepository.getCoreMission({
      ...input,
      date,
    });

    if (!coreMission || !await this.dailyMissionRepository.isPracticeCompleted({
      studentId: normalizedStudentId,
      practiceId: coreMission.practiceId,
        ...(coreMission.practiceType ? {practiceType: coreMission.practiceType} : {}),
    })) {
      return Object.freeze([]);
    }

    const [assignedPracticeIds, pausedTopicIds, topicStats] =
      await Promise.all([
        this.listAssignedPracticeIds({studentId: normalizedStudentId}),
        this.dailyMissionRepository.listPausedTopicIds(input),
        this.dailyMissionRepository.listTopicStats(input),
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
        || (coreMission.practiceType !== "essay" && practiceId === corePracticeId)
      ) {
        return [];
      }

      return [{topicId, practiceId, practiceType: "normal"}];
    });

    if (includeEssays) {
      let cursor = null;
      do {
        const page = await this.listAssignedEssayPractices({...input, limit: 100, cursor});
        for (const assignment of page.practices) {
          if (assignment.syllabusId === normalizedSyllabusId && !pausedTopics.has(assignment.topicId)
              && !(coreMission.practiceType === "essay" && assignment.essayPracticeId === corePracticeId)) {
            candidates.push({topicId: assignment.topicId, practiceId: assignment.essayPracticeId, practiceType: "essay"});
          }
        }
        cursor = page.nextCursor;
      } while (cursor);
    }

    if (candidates.length === 0) {
      return Object.freeze([]);
    }

    const acceptedTopicIds =
      await this.dailyMissionRepository
        .listAcceptedAdditionalTopicIds({
          ...input,
          date,
        });
    const acceptedTopics = new Set(
      (Array.isArray(acceptedTopicIds) ? acceptedTopicIds : [])
        .map((topicId) => String(topicId ?? "").trim())
        .filter(Boolean),
    );
    const practicesByTopic = new Map();

    candidates.forEach(candidate => {
      const {topicId} = candidate;
      if (acceptedTopics.has(topicId)) {
        return;
      }

      if (!practicesByTopic.has(topicId)) {
        practicesByTopic.set(topicId, []);
      }

      practicesByTopic.get(topicId).push(candidate);
    });

    if (practicesByTopic.size === 0) {
      return Object.freeze([]);
    }

    const seed = [normalizedStudentId, normalizedSyllabusId, date].join("|");
    const stats = toTopicStatsMap(topicStats);
    const topics = [...practicesByTopic].map(([topicId, practiceIds]) => ({
      topicId,
      practiceIds,
    }));

    topics.sort((first, second) => compareTopicCandidates(
      first,
      second,
      stats,
      seed,
    ));

    return Object.freeze(topics.map(({topicId, practiceIds}) => Object.freeze(
      [...practiceIds].sort((first, second) => compareStable(
        first.practiceType === "essay" ? `essay|${first.practiceId}` : first.practiceId,
        second.practiceType === "essay" ? `essay|${second.practiceId}` : second.practiceId,
        `${seed}|${topicId}|practice`,
      ))[0]
    )));
  }
}

module.exports = {
  ListAdditionalMissionPracticeIds,
  currentUtcDate,
};
