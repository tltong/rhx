const {missionTypeFields} = require("../domain/mission_practice_type");
const {
  refreshPausedTopicIds,
} = require("./check_paused_topic_validity");

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

function currentUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function stableHash(value) {
  const text = String(value);
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function compareStable(firstId, secondId, seed) {
  const firstHash = stableHash(`${seed}|${firstId}`);
  const secondHash = stableHash(`${seed}|${secondId}`);

  return firstHash - secondHash || firstId.localeCompare(secondId);
}

function topicIdForPractice(practice, syllabusId) {
  if (!practice || !Array.isArray(practice.questions)) {
    return null;
  }

  const questions = practice.questions;

  if (
    questions.length === 0
    || questions.some((question) => question?.syllabusId !== syllabusId)
  ) {
    return null;
  }

  const topicIds = new Set(questions.map((question) => (
    String(question?.topicId ?? "").trim()
  )));

  if (topicIds.size !== 1 || topicIds.has("")) {
    return null;
  }

  return [...topicIds][0];
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

function createMissionResult({
  studentId,
  syllabusId,
  topicId,
  practiceId,
  date,
  isAccepted,
  practiceType,
}) {
  return Object.freeze({
    studentId,
    syllabusId,
    topicId: requireDocumentId(topicId, "topicId"),
    practiceId: requireDocumentId(practiceId, "practiceId"),
    date,
    isAccepted,
    ...missionTypeFields(practiceType),
  });
}

class GetNextCoreDailyMission {
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
      || typeof dailyMissionRepository
        .listAcceptedAdditionalPracticeIds !== "function"
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
    const existingMission = await this.dailyMissionRepository.getCoreMission({
      ...input,
      date,
    });

    if (existingMission) {
      return createMissionResult({
        ...input,
        ...existingMission,
        date,
        isAccepted: true,
      });
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
    const candidates = practices.flatMap(({practiceId, practice}) => {
      const topicId = topicIdForPractice(practice, normalizedSyllabusId);

      if (!topicId || pausedTopics.has(topicId)) {
        return [];
      }

      return [{topicId, practiceId}];
    });

    let cursor = null;
    do {
      const page = await this.listAssignedEssayPractices({...input, limit: 100, cursor});
      for (const assignment of page.practices) {
        if (assignment.syllabusId === normalizedSyllabusId && !pausedTopics.has(assignment.topicId)) {
          candidates.push({topicId: assignment.topicId, practiceId: assignment.essayPracticeId, practiceType: "essay"});
        }
      }
      cursor = page.nextCursor;
    } while (cursor);

    if (candidates.length === 0) {
      return null;
    }

    const acceptedAdditionalPracticeIds =
      await this.dailyMissionRepository
        .listAcceptedAdditionalPracticeIds({
          ...input,
          date,
          candidates,
        });
    const acceptedAdditionalPractices = new Set(
      Array.isArray(acceptedAdditionalPracticeIds)
        ? acceptedAdditionalPracticeIds
        : [],
    );
    const practicesByTopic = new Map();

    candidates.forEach(({topicId, practiceId, practiceType}) => {
      if (practiceType !== "essay" && acceptedAdditionalPractices.has(practiceId)) {
        return;
      }

      if (!practicesByTopic.has(topicId)) {
        practicesByTopic.set(topicId, []);
      }

      practicesByTopic.get(topicId).push({practiceId, ...missionTypeFields(practiceType)});
    });

    if (practicesByTopic.size === 0) {
      return null;
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

    const selectedTopic = topics[0];
    const selectedPractice = [...selectedTopic.practiceIds].sort(
      (first, second) => compareStable(
        first.practiceType === "essay" ? `essay|${first.practiceId}` : first.practiceId,
        second.practiceType === "essay" ? `essay|${second.practiceId}` : second.practiceId,
        `${seed}|${selectedTopic.topicId}|practice`,
      ),
    )[0];

    return createMissionResult({
      ...input,
      topicId: selectedTopic.topicId,
      practiceId: selectedPractice.practiceId,
      ...missionTypeFields(selectedPractice.practiceType),
      date,
      isAccepted: false,
    });
  }
}

module.exports = {
  GetNextCoreDailyMission,
  currentUtcDate,
  stableHash,
  topicIdForPractice,
};
