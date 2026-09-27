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

function createCodedError(code, message) {
  const error = new Error(message);

  error.code = code;
  return error;
}

function practiceMissionRoute(practice) {
  if (!practice || !Array.isArray(practice.questions)) {
    throw createCodedError(
      "failed-precondition",
      "The practice does not have a valid daily mission route.",
    );
  }

  const syllabusIds = new Set();
  const topicIds = new Set();

  practice.questions.forEach((question) => {
    const syllabusId = String(question?.syllabusId ?? "").trim();
    const topicId = String(question?.topicId ?? "").trim();

    if (syllabusId) {
      syllabusIds.add(syllabusId);
    }

    if (topicId) {
      topicIds.add(topicId);
    }
  });

  if (
    practice.questions.length === 0
    || syllabusIds.size !== 1
    || topicIds.size !== 1
  ) {
    throw createCodedError(
      "failed-precondition",
      "A daily mission practice must belong to one syllabus and one topic.",
    );
  }

  return Object.freeze({
    syllabusId: [...syllabusIds][0],
    topicId: [...topicIds][0],
  });
}

class AcceptCoreDailyMission {
  constructor({
    dailyMissionRepository,
    getNextCoreDailyMission,
    getPracticeById,
  } = {}) {
    if (
      !dailyMissionRepository
      || typeof dailyMissionRepository.acceptCoreMission !== "function"
    ) {
      throw new Error("dailyMissionRepository is required.");
    }

    this.dailyMissionRepository = dailyMissionRepository;
    this.getNextCoreDailyMission = requireFunction(
      getNextCoreDailyMission,
      "getNextCoreDailyMission",
    );
    this.getPracticeById = requireFunction(
      getPracticeById,
      "getPracticeById",
    );
  }

  async execute({studentId, practiceId} = {}) {
    const normalizedStudentId = requireDocumentId(studentId, "studentId");
    const normalizedPracticeId = requireDocumentId(practiceId, "practiceId");
    const practice = await this.getPracticeById(normalizedPracticeId);

    if (!practice) {
      throw createCodedError(
        "not-found",
        `Practice ${normalizedPracticeId} could not be found.`,
      );
    }

    const {syllabusId, topicId} = practiceMissionRoute(practice);
    const mission = await this.getNextCoreDailyMission({
      studentId: normalizedStudentId,
      syllabusId,
    });

    if (!mission) {
      throw createCodedError(
        "failed-precondition",
        "No core daily mission is currently available for this syllabus.",
      );
    }

    if (
      mission.practiceId !== normalizedPracticeId
      || mission.topicId !== topicId
    ) {
      throw createCodedError(
        "failed-precondition",
        "The practice is not the student's current core daily mission.",
      );
    }

    const acceptance = await this.dailyMissionRepository.acceptCoreMission({
      studentId: normalizedStudentId,
      syllabusId,
      topicId,
      practiceId: normalizedPracticeId,
      date: mission.date,
    });

    if (typeof acceptance?.created !== "boolean") {
      throw new Error("The daily mission acceptance result is invalid.");
    }

    return Object.freeze({
      studentId: normalizedStudentId,
      syllabusId,
      topicId,
      practiceId: normalizedPracticeId,
      date: mission.date,
      isAccepted: true,
      created: acceptance.created,
    });
  }
}

module.exports = {
  AcceptCoreDailyMission,
  practiceMissionRoute,
};
