const {
  HttpsError,
  onCall,
} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const {
  acceptAdditionalDailyMission:
    acceptAdditionalMissionRecord,
  acceptCoreDailyMission: acceptCoreMissionRecord,
  checkPausedTopicValidity:
    checkPausedTopicValidityRecord,
  getNextCoreDailyMission: loadNextCoreDailyMission,
  listAdditionalMissionPracticeIds:
    listAdditionalMissionPractices,
  pauseCoreDailyMission: pauseCoreMissionTopic,
} = require("./features/daily_mission/daily_mission_module");

const CALLABLE_OPTIONS = Object.freeze({
  region: "us-central1",
});

function requireDocumentId(value, fieldName) {
  const id = String(value ?? "").trim();

  if (!id) {
    throw new HttpsError("invalid-argument", `${fieldName} is required.`);
  }

  if (id.includes("/")) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} must not contain a slash.`,
    );
  }

  return id;
}

function requireAuthenticatedStudent(request, studentId) {
  const callerUid = String(request?.auth?.uid ?? "").trim();

  if (!callerUid) {
    throw new HttpsError(
      "unauthenticated",
      "Sign in before loading a daily mission.",
    );
  }

  if (callerUid !== studentId) {
    throw new HttpsError(
      "permission-denied",
      "A student can only load their own daily mission.",
    );
  }
}

function createDailyMissionHandlers({
  acceptAdditionalMission = acceptAdditionalMissionRecord,
  acceptCoreMission = acceptCoreMissionRecord,
  checkPausedTopic = checkPausedTopicValidityRecord,
  getNextCoreMission = loadNextCoreDailyMission,
  listAdditionalMissionIds = listAdditionalMissionPractices,
  pauseCoreMission = pauseCoreMissionTopic,
} = {}) {
  async function getNextCoreDailyMissionHandler(request) {
    const studentId = requireDocumentId(
      request?.data?.studentId,
      "studentId",
    );
    const syllabusId = requireDocumentId(
      request?.data?.syllabusId,
      "syllabusId",
    );

    requireAuthenticatedStudent(request, studentId);

    return getNextCoreMission({studentId, syllabusId});
  }

  async function checkPausedTopicValidityHandler(request) {
    const studentId = requireDocumentId(
      request?.data?.studentId,
      "studentId",
    );
    const syllabusId = requireDocumentId(
      request?.data?.syllabusId,
      "syllabusId",
    );
    const topicId = requireDocumentId(
      request?.data?.topicId,
      "topicId",
    );

    requireAuthenticatedStudent(request, studentId);

    return checkPausedTopic({
      studentId,
      syllabusId,
      topicId,
    });
  }

  async function listAdditionalMissionPracticeIdsHandler(request) {
    const studentId = requireDocumentId(
      request?.data?.studentId,
      "studentId",
    );
    const syllabusId = requireDocumentId(
      request?.data?.syllabusId,
      "syllabusId",
    );

    requireAuthenticatedStudent(request, studentId);

    return listAdditionalMissionIds({studentId, syllabusId});
  }

  async function acceptAdditionalDailyMissionHandler(request) {
    const studentId = requireDocumentId(
      request?.data?.studentId,
      "studentId",
    );
    const practiceId = requireDocumentId(
      request?.data?.practiceId,
      "practiceId",
    );

    requireAuthenticatedStudent(request, studentId);

    try {
      return await acceptAdditionalMission({studentId, practiceId});
    } catch (error) {
      if (
        error?.code === "not-found"
        || error?.code === "failed-precondition"
      ) {
        throw new HttpsError(error.code, error.message);
      }

      throw error;
    }
  }

  async function acceptCoreDailyMissionHandler(request) {
    const studentId = requireDocumentId(
      request?.data?.studentId,
      "studentId",
    );
    const practiceId = requireDocumentId(
      request?.data?.practiceId,
      "practiceId",
    );

    requireAuthenticatedStudent(request, studentId);

    try {
      return await acceptCoreMission({studentId, practiceId});
    } catch (error) {
      if (
        error?.code === "not-found"
        || error?.code === "failed-precondition"
      ) {
        throw new HttpsError(error.code, error.message);
      }

      throw error;
    }
  }

  async function pauseCoreDailyMissionHandler(request) {
    const studentId = requireDocumentId(
      request?.data?.studentId,
      "studentId",
    );
    const practiceId = requireDocumentId(
      request?.data?.practiceId,
      "practiceId",
    );

    requireAuthenticatedStudent(request, studentId);

    try {
      return await pauseCoreMission({studentId, practiceId});
    } catch (error) {
      if (
        error?.code === "not-found"
        || error?.code === "failed-precondition"
      ) {
        throw new HttpsError(error.code, error.message);
      }

      throw error;
    }
  }

  return Object.freeze({
    acceptAdditionalDailyMissionHandler,
    acceptCoreDailyMissionHandler,
    checkPausedTopicValidityHandler,
    getNextCoreDailyMissionHandler,
    listAdditionalMissionPracticeIdsHandler,
    pauseCoreDailyMissionHandler,
  });
}

function withErrorLogging(handler, operation) {
  return async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error(`Core daily mission ${operation} failed.`, {
        callerUid: request?.auth?.uid || null,
        studentId: request?.data?.studentId || null,
        syllabusId: request?.data?.syllabusId || null,
        practiceId: request?.data?.practiceId || null,
        errorMessage: error instanceof Error
          ? error.message
          : String(error),
        errorStack: error instanceof Error ? error.stack : null,
      });
      throw new HttpsError(
        "internal",
        `Could not complete core daily mission ${operation}.`,
      );
    }
  };
}

const handlers = createDailyMissionHandlers();
const acceptAdditionalDailyMission = onCall(
  CALLABLE_OPTIONS,
  withErrorLogging(
    handlers.acceptAdditionalDailyMissionHandler,
    "additional-acceptance",
  ),
);
const acceptCoreDailyMission = onCall(
  CALLABLE_OPTIONS,
  withErrorLogging(
    handlers.acceptCoreDailyMissionHandler,
    "acceptance",
  ),
);
const checkPausedTopicValidity = onCall(
  CALLABLE_OPTIONS,
  withErrorLogging(
    handlers.checkPausedTopicValidityHandler,
    "pause-validity-check",
  ),
);
const getNextCoreDailyMission = onCall(
  CALLABLE_OPTIONS,
  withErrorLogging(handlers.getNextCoreDailyMissionHandler, "lookup"),
);
const listAdditionalMissionPracticeIds = onCall(
  CALLABLE_OPTIONS,
  withErrorLogging(
    handlers.listAdditionalMissionPracticeIdsHandler,
    "additional-list",
  ),
);
const pauseCoreDailyMission = onCall(
  CALLABLE_OPTIONS,
  withErrorLogging(
    handlers.pauseCoreDailyMissionHandler,
    "pause",
  ),
);

module.exports = {
  acceptAdditionalDailyMission,
  acceptCoreDailyMission,
  checkPausedTopicValidity,
  createDailyMissionHandlers,
  getNextCoreDailyMission,
  listAdditionalMissionPracticeIds,
  pauseCoreDailyMission,
};
