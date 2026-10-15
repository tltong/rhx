import {
  STUDENT_DAILY_MISSION_ADDITIONAL_TOPICS_SUBCOLLECTION,
  STUDENT_DAILY_MISSION_CORE_TOPICS_SUBCOLLECTION,
  STUDENT_DAILY_MISSIONS_COLLECTION,
  STUDENT_DAILY_MISSION_DAYS_SUBCOLLECTION,
  STUDENT_DAILY_MISSION_PAUSED_TOPICS_SUBCOLLECTION,
  STUDENT_DAILY_MISSION_PRACTICES_SUBCOLLECTION,
  STUDENT_DAILY_MISSION_STATS_SUBCOLLECTION,
  STUDENT_DAILY_MISSION_SYLLABUSES_SUBCOLLECTION,
  STUDENT_DAILY_MISSION_TOPICS_SUBCOLLECTION,
  STUDENT_DAILY_MISSION_ACCEPTED_ADDITIONAL_PRACTICES_SUBCOLLECTION,
  STUDENT_DAILY_MISSION_ACCEPTED_PRACTICES_SUBCOLLECTION
} from "../../../config/firebase/student_daily_mission_schema.js?v=20261010-additional-mission-rewards-v1";
import {
  ASSIGNED_PRACTICES_SUBCOLLECTION,
  COMPLETED_PRACTICES_SUBCOLLECTION,
  STUDENT_PRACTICES_COLLECTION
} from "../../../config/firebase/student_practice_schema.js";
import {
  deleteDocument,
  getDocumentRef,
  getFirestoreDb,
  readCollection,
  readCollectionIds,
  readDocuments,
  readDocument
} from "../../../utils/firebase/firebase_ops.js";
import {
  DailyMissionRepository
} from "../domain/daily_mission_repository.js?v=20261010-additional-mission-rewards-v1";
import {
  isPausedTopicExpired
} from "../domain/daily_mission_policy.js";
import {requireAcceptedDailyMissionScope, requireAcceptedDailyMissionContext} from "../domain/accepted_daily_mission.js?v=20261010-accepted-daily-mission-v1";

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

function requireDateKey(value, fieldName = "date") {
  const date = requireDocumentId(value, fieldName);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format.`);
  }

  return date;
}

function createCodedError(code, message) {
  const error = new Error(message);

  error.code = code;
  return error;
}

function studentDailyMissionPath(studentId) {
  return [STUDENT_DAILY_MISSIONS_COLLECTION, studentId].join("/");
}

function syllabusDailyMissionPath(studentId, date, syllabusId) {
  return [
    studentDailyMissionPath(studentId),
    STUDENT_DAILY_MISSION_DAYS_SUBCOLLECTION,
    date,
    STUDENT_DAILY_MISSION_SYLLABUSES_SUBCOLLECTION,
    syllabusId
  ].join("/");
}

function coreTopicsCollectionPath(studentId, date, syllabusId) {
  return [
    syllabusDailyMissionPath(studentId, date, syllabusId),
    STUDENT_DAILY_MISSION_CORE_TOPICS_SUBCOLLECTION
  ].join("/");
}

function corePracticesCollectionPath(
  studentId,
  date,
  syllabusId,
  topicId
) {
  return [
    coreTopicsCollectionPath(studentId, date, syllabusId),
    topicId,
    STUDENT_DAILY_MISSION_PRACTICES_SUBCOLLECTION
  ].join("/");
}

function additionalTopicsCollectionPath(studentId, date, syllabusId) {
  return [
    syllabusDailyMissionPath(studentId, date, syllabusId),
    STUDENT_DAILY_MISSION_ADDITIONAL_TOPICS_SUBCOLLECTION
  ].join("/");
}

function additionalPracticesCollectionPath(
  studentId,
  date,
  syllabusId,
  topicId
) {
  return [
    additionalTopicsCollectionPath(
      studentId,
      date,
      syllabusId
    ),
    topicId,
    STUDENT_DAILY_MISSION_PRACTICES_SUBCOLLECTION
  ].join("/");
}

function pausedTopicsCollectionPath(studentId, syllabusId) {
  return [
    STUDENT_DAILY_MISSIONS_COLLECTION,
    studentId,
    STUDENT_DAILY_MISSION_PAUSED_TOPICS_SUBCOLLECTION,
    syllabusId,
    STUDENT_DAILY_MISSION_TOPICS_SUBCOLLECTION
  ].join("/");
}

function missionStatsTopicsCollectionPath(studentId, syllabusId) {
  return [
    studentDailyMissionPath(studentId),
    STUDENT_DAILY_MISSION_STATS_SUBCOLLECTION,
    syllabusId,
    STUDENT_DAILY_MISSION_TOPICS_SUBCOLLECTION
  ].join("/");
}

export class FirestoreDailyMissionRepository
  extends DailyMissionRepository {
  constructor({
    deleteDocumentOperation = deleteDocument,
    getDocumentRefOperation = getDocumentRef,
    getFirestoreDbOperation = getFirestoreDb,
    readCollectionOperation = readCollection,
    readCollectionIdsOperation = readCollectionIds,
    readDocumentsOperation = readDocuments,
    readDocumentOperation = readDocument
  } = {}) {
    super();
    this.deleteDocument = deleteDocumentOperation;
    this.getDocumentRef = getDocumentRefOperation;
    this.getFirestoreDb = getFirestoreDbOperation;
    this.readCollection = readCollectionOperation;
    this.readCollectionIds = readCollectionIdsOperation;
    this.readDocuments = readDocumentsOperation;
    this.readDocument = readDocumentOperation;
  }

  async getCoreMission({studentId, syllabusId, date} = {}) {
    const normalizedStudentId = requireDocumentId(studentId, "studentId");
    const normalizedSyllabusId = requireDocumentId(
      syllabusId,
      "syllabusId"
    );
    const normalizedDate = requireDateKey(date);
    const syllabus = await this.readDocument(
      [
        studentDailyMissionPath(normalizedStudentId),
        STUDENT_DAILY_MISSION_DAYS_SUBCOLLECTION,
        normalizedDate,
        STUDENT_DAILY_MISSION_SYLLABUSES_SUBCOLLECTION
      ].join("/"),
      normalizedSyllabusId
    );
    const coreMission = syllabus?.coreMission;

    if (coreMission === undefined || coreMission === null) {
      return null;
    }

    if (typeof coreMission !== "object" || Array.isArray(coreMission)) {
      throw new Error("The core daily mission reference is invalid.");
    }

    return Object.freeze({
      topicId: requireDocumentId(coreMission.topicId, "coreMission.topicId"),
      practiceId: requireDocumentId(
        coreMission.practiceId,
        "coreMission.practiceId"
      )
    });
  }

  async getAcceptedAdditionalMissionForPractice(input) {
    const scope = requireAcceptedDailyMissionScope(input);
    const lookup = await this.readDocument(
      [studentDailyMissionPath(scope.studentId), STUDENT_DAILY_MISSION_ACCEPTED_ADDITIONAL_PRACTICES_SUBCOLLECTION].join("/"),
      scope.practiceId,
    );
    if (lookup !== null && lookup !== undefined) {
      const context = requireAcceptedDailyMissionContext({...lookup, practiceId: scope.practiceId});
      const accepted = await this.readDocument(
        additionalPracticesCollectionPath(scope.studentId, context.missionDate, context.syllabusId, context.topicId),
        scope.practiceId,
      );
      return accepted !== null && accepted !== undefined ? context : null;
    }

    // Older accepted additional missions predate the lookup. Do not backfill on reads.
    const daysPath = [studentDailyMissionPath(scope.studentId), STUDENT_DAILY_MISSION_DAYS_SUBCOLLECTION].join("/");
    const dates = (await this.readCollectionIds(daysPath)).map((date) => requireDateKey(date)).sort().reverse();
    for (const missionDate of dates) {
      let match = null;
      const syllabusIds = await this.readCollectionIds(
        [daysPath, missionDate, STUDENT_DAILY_MISSION_SYLLABUSES_SUBCOLLECTION].join("/"),
      );
      for (const syllabusId of syllabusIds) {
        const topicIds = await this.readCollectionIds(
          additionalTopicsCollectionPath(scope.studentId, missionDate, syllabusId),
        );
        for (const topicId of topicIds) {
          const context = requireAcceptedDailyMissionContext({missionDate, syllabusId, topicId, practiceId: scope.practiceId});
          const accepted = await this.readDocument(
            additionalPracticesCollectionPath(scope.studentId, missionDate, syllabusId, topicId), scope.practiceId,
          );
          if (accepted !== null && accepted !== undefined) {
            if (match !== null) throw new Error("The practice has conflicting additional mission records.");
            match = context;
          }
        }
      }
      if (match !== null) return match;
    }
    return null;
  }

  async getAcceptedDailyMissionForPractice(input) {
    const scope = requireAcceptedDailyMissionScope(input);
    const lookup = await this.readDocument(
      [studentDailyMissionPath(scope.studentId), STUDENT_DAILY_MISSION_ACCEPTED_PRACTICES_SUBCOLLECTION].join("/"),
      scope.practiceId,
    );
    if (lookup !== null && lookup !== undefined) {
      const context = requireAcceptedDailyMissionContext({...lookup, practiceId: scope.practiceId});
      const accepted = await this.getCoreMission({
        studentId: scope.studentId, syllabusId: context.syllabusId, date: context.missionDate,
      });
      return accepted?.practiceId === scope.practiceId && accepted.topicId === context.topicId ? context : null;
    }

    // Older accepted missions predate the lookup. Keep this fallback read-only.
    const daysPath = [studentDailyMissionPath(scope.studentId), STUDENT_DAILY_MISSION_DAYS_SUBCOLLECTION].join("/");
    const dates = (await this.readCollectionIds(daysPath)).map((date) => requireDateKey(date)).sort().reverse();
    for (const missionDate of dates) {
      const syllabuses = await this.readCollection(
        [daysPath, missionDate, STUDENT_DAILY_MISSION_SYLLABUSES_SUBCOLLECTION].join("/"),
      );
      const matches = syllabuses.filter((syllabus) => syllabus.coreMission?.practiceId === scope.practiceId);
      if (matches.length > 1) throw new Error("The practice has conflicting daily mission records.");
      if (matches.length === 1) {
        const syllabus = matches[0];
        return requireAcceptedDailyMissionContext({
          missionDate, syllabusId: syllabus.id, topicId: syllabus.coreMission.topicId, practiceId: scope.practiceId,
        });
      }
    }
    return null;
  }

  async isPracticeCompleted({studentId, practiceId} = {}) {
    const normalizedStudentId = requireDocumentId(studentId, "studentId");
    const normalizedPracticeId = requireDocumentId(practiceId, "practiceId");
    const completedPractice = await this.readDocument(
      [
        STUDENT_PRACTICES_COLLECTION,
        normalizedStudentId,
        COMPLETED_PRACTICES_SUBCOLLECTION
      ].join("/"),
      normalizedPracticeId
    );

    return completedPractice !== null && completedPractice !== undefined;
  }

  async acceptAdditionalMission({
    studentId,
    syllabusId,
    topicId,
    practiceId,
    date
  } = {}) {
    const normalizedStudentId = requireDocumentId(studentId, "studentId");
    const normalizedSyllabusId = requireDocumentId(
      syllabusId,
      "syllabusId"
    );
    const normalizedTopicId = requireDocumentId(topicId, "topicId");
    const normalizedPracticeId = requireDocumentId(practiceId, "practiceId");
    const normalizedDate = requireDateKey(date);
    const studentPath = studentDailyMissionPath(normalizedStudentId);
    const studentDocument = this.getDocumentRef(
      STUDENT_DAILY_MISSIONS_COLLECTION,
      normalizedStudentId
    );
    const dayDocument = this.getDocumentRef(
      [studentPath, STUDENT_DAILY_MISSION_DAYS_SUBCOLLECTION].join("/"),
      normalizedDate
    );
    const syllabusDocument = this.getDocumentRef(
      [
        studentPath,
        STUDENT_DAILY_MISSION_DAYS_SUBCOLLECTION,
        normalizedDate,
        STUDENT_DAILY_MISSION_SYLLABUSES_SUBCOLLECTION
      ].join("/"),
      normalizedSyllabusId
    );
    const additionalTopicDocument = this.getDocumentRef(
      additionalTopicsCollectionPath(
        normalizedStudentId,
        normalizedDate,
        normalizedSyllabusId
      ),
      normalizedTopicId
    );
    const additionalPracticeDocument = this.getDocumentRef(
      additionalPracticesCollectionPath(
        normalizedStudentId,
        normalizedDate,
        normalizedSyllabusId,
        normalizedTopicId
      ),
      normalizedPracticeId
    );

    const missionContext = requireAcceptedDailyMissionContext({
      missionDate: normalizedDate, syllabusId: normalizedSyllabusId,
      topicId: normalizedTopicId, practiceId: normalizedPracticeId,
    });
    const lookupData = {
      missionDate: missionContext.missionDate, syllabusId: missionContext.syllabusId, topicId: missionContext.topicId,
    };
    const lookupDocument = this.getDocumentRef(
      [studentPath, STUDENT_DAILY_MISSION_ACCEPTED_ADDITIONAL_PRACTICES_SUBCOLLECTION].join("/"),
      normalizedPracticeId,
    );

    return this.getFirestoreDb().runTransaction(async (transaction) => {
      const practiceSnapshot = await transaction.get(
        additionalPracticeDocument
      );

      const lookupSnapshot = await transaction.get(lookupDocument);
      const previousLookup = lookupSnapshot.exists
        ? requireAcceptedDailyMissionContext({...lookupSnapshot.data(), practiceId: normalizedPracticeId}) : null;
      if (previousLookup?.missionDate === normalizedDate
          && (previousLookup.syllabusId !== normalizedSyllabusId || previousLookup.topicId !== normalizedTopicId)) {
        throw createCodedError("failed-precondition", "The additional mission lookup contains conflicting route data.");
      }
      const updateLookup = previousLookup === null || previousLookup.missionDate < normalizedDate;

      if (practiceSnapshot.exists) {
        if (updateLookup) transaction.set(lookupDocument, lookupData);
        return Object.freeze({created: false});
      }

      const topicSnapshot = await transaction.get(
        additionalTopicDocument
      );

      if (topicSnapshot.exists) {
        throw createCodedError(
          "failed-precondition",
          "An additional daily mission has already been accepted "
            + `for topic ${normalizedTopicId}.`
        );
      }

      const syllabusSnapshot = await transaction.get(syllabusDocument);
      const coreMission = syllabusSnapshot.exists
        ? syllabusSnapshot.data()?.coreMission
        : null;

      if (!coreMission) {
        throw createCodedError(
          "failed-precondition",
          "Complete today's Daily Mission for this subject first."
        );
      }

      const corePracticeId = requireDocumentId(
        coreMission.practiceId,
        "coreMission.practiceId"
      );
      const completedCorePractice = await transaction.get(this.getDocumentRef(
        [
          STUDENT_PRACTICES_COLLECTION,
          normalizedStudentId,
          COMPLETED_PRACTICES_SUBCOLLECTION
        ].join("/"),
        corePracticeId
      ));

      if (!completedCorePractice.exists) {
        throw createCodedError(
          "failed-precondition",
          "Complete today's Daily Mission for this subject first."
        );
      }

      if (normalizedPracticeId === corePracticeId) {
        throw createCodedError(
          "failed-precondition",
          "The Daily Mission practice cannot also be an Additional Mission."
        );
      }

      transaction.set(studentDocument, {}, {merge: true});
      transaction.set(dayDocument, {}, {merge: true});
      transaction.set(syllabusDocument, {}, {merge: true});
      transaction.set(additionalTopicDocument, {}, {merge: true});
      transaction.set(additionalPracticeDocument, {});
      if (updateLookup) transaction.set(lookupDocument, lookupData);

      return Object.freeze({created: true});
    });
  }

  async acceptCoreMission({
    studentId,
    syllabusId,
    topicId,
    practiceId,
    date
  } = {}) {
    const normalizedStudentId = requireDocumentId(studentId, "studentId");
    const normalizedSyllabusId = requireDocumentId(
      syllabusId,
      "syllabusId"
    );
    const normalizedTopicId = requireDocumentId(topicId, "topicId");
    const normalizedPracticeId = requireDocumentId(practiceId, "practiceId");
    const normalizedDate = requireDateKey(date);
    const studentPath = studentDailyMissionPath(normalizedStudentId);
    const studentDocument = this.getDocumentRef(
      STUDENT_DAILY_MISSIONS_COLLECTION,
      normalizedStudentId
    );
    const dayDocument = this.getDocumentRef(
      [studentPath, STUDENT_DAILY_MISSION_DAYS_SUBCOLLECTION].join("/"),
      normalizedDate
    );
    const syllabusDocument = this.getDocumentRef(
      [
        studentPath,
        STUDENT_DAILY_MISSION_DAYS_SUBCOLLECTION,
        normalizedDate,
        STUDENT_DAILY_MISSION_SYLLABUSES_SUBCOLLECTION
      ].join("/"),
      normalizedSyllabusId
    );
    const coreTopicDocument = this.getDocumentRef(
      coreTopicsCollectionPath(
        normalizedStudentId,
        normalizedDate,
        normalizedSyllabusId
      ),
      normalizedTopicId
    );
    const corePracticeDocument = this.getDocumentRef(
      corePracticesCollectionPath(
        normalizedStudentId,
        normalizedDate,
        normalizedSyllabusId,
        normalizedTopicId
      ),
      normalizedPracticeId
    );
    const statsSyllabusDocument = this.getDocumentRef(
      [studentPath, STUDENT_DAILY_MISSION_STATS_SUBCOLLECTION].join("/"),
      normalizedSyllabusId
    );
    const statsTopicDocument = this.getDocumentRef(
      missionStatsTopicsCollectionPath(
        normalizedStudentId,
        normalizedSyllabusId
      ),
      normalizedTopicId
    );
    const assignedPracticeDocument = this.getDocumentRef(
      [
        STUDENT_PRACTICES_COLLECTION,
        normalizedStudentId,
        ASSIGNED_PRACTICES_SUBCOLLECTION
      ].join("/"),
      normalizedPracticeId
    );
    const pausedTopicDocument = this.getDocumentRef(
      pausedTopicsCollectionPath(
        normalizedStudentId,
        normalizedSyllabusId
      ),
      normalizedTopicId
    );

    const missionContext = requireAcceptedDailyMissionContext({
      missionDate: normalizedDate, syllabusId: normalizedSyllabusId,
      topicId: normalizedTopicId, practiceId: normalizedPracticeId,
    });
    const lookupData = {
      missionDate: missionContext.missionDate, syllabusId: missionContext.syllabusId, topicId: missionContext.topicId,
    };
    const lookupDocument = this.getDocumentRef(
      [studentPath, STUDENT_DAILY_MISSION_ACCEPTED_PRACTICES_SUBCOLLECTION].join("/"),
      normalizedPracticeId,
    );

    return this.getFirestoreDb().runTransaction(async (transaction) => {
      const syllabusSnapshot = await transaction.get(syllabusDocument);
      const lookupSnapshot = await transaction.get(lookupDocument);
      const previousLookup = lookupSnapshot.exists
        ? requireAcceptedDailyMissionContext({...lookupSnapshot.data(), practiceId: normalizedPracticeId}) : null;
      if (previousLookup?.missionDate === normalizedDate
          && (previousLookup.syllabusId !== normalizedSyllabusId || previousLookup.topicId !== normalizedTopicId)) {
        throw createCodedError("failed-precondition", "The daily mission lookup contains conflicting route data.");
      }
      const updateLookup = previousLookup === null || previousLookup.missionDate < normalizedDate;
      const existingMission = syllabusSnapshot.exists
        ? syllabusSnapshot.data()?.coreMission
        : null;

      if (existingMission !== undefined && existingMission !== null) {
        const existingTopicId = requireDocumentId(
          existingMission.topicId,
          "coreMission.topicId"
        );
        const existingPracticeId = requireDocumentId(
          existingMission.practiceId,
          "coreMission.practiceId"
        );

        if (
          existingTopicId === normalizedTopicId
          && existingPracticeId === normalizedPracticeId
        ) {
          if (updateLookup) transaction.set(lookupDocument, lookupData);
          return Object.freeze({created: false});
        }

        throw createCodedError(
          "failed-precondition",
          "A different core daily mission already exists for this syllabus."
        );
      }

      const assignedSnapshot = await transaction.get(
        assignedPracticeDocument
      );
      const pausedSnapshot = await transaction.get(pausedTopicDocument);

      if (!assignedSnapshot.exists) {
        throw createCodedError(
          "failed-precondition",
          `Practice ${normalizedPracticeId} is no longer assigned.`
        );
      }

      if (pausedSnapshot.exists) {
        throw createCodedError(
          "failed-precondition",
          `Topic ${normalizedTopicId} is paused.`
        );
      }

      transaction.set(studentDocument, {}, {merge: true});
      transaction.set(dayDocument, {}, {merge: true});
      transaction.set(syllabusDocument, {
        coreMission: {
          topicId: normalizedTopicId,
          practiceId: normalizedPracticeId
        }
      }, {merge: true});
      transaction.set(coreTopicDocument, {}, {merge: true});
      transaction.set(corePracticeDocument, {});
      if (updateLookup) transaction.set(lookupDocument, lookupData);
      transaction.set(statsSyllabusDocument, {}, {merge: true});
      transaction.set(statsTopicDocument, {
        lastAcceptedDate: normalizedDate
      }, {merge: true});

      return Object.freeze({created: true});
    });
  }

  async pauseTopic({
    studentId,
    syllabusId,
    topicId,
    pausedDate
  } = {}) {
    const normalizedStudentId = requireDocumentId(studentId, "studentId");
    const normalizedSyllabusId = requireDocumentId(
      syllabusId,
      "syllabusId"
    );
    const normalizedTopicId = requireDocumentId(topicId, "topicId");
    const normalizedPausedDate = requireDateKey(pausedDate, "pausedDate");
    const studentPath = studentDailyMissionPath(normalizedStudentId);
    const studentDocument = this.getDocumentRef(
      STUDENT_DAILY_MISSIONS_COLLECTION,
      normalizedStudentId
    );
    const pausedSyllabusDocument = this.getDocumentRef(
      [
        studentPath,
        STUDENT_DAILY_MISSION_PAUSED_TOPICS_SUBCOLLECTION
      ].join("/"),
      normalizedSyllabusId
    );
    const pausedTopicDocument = this.getDocumentRef(
      pausedTopicsCollectionPath(
        normalizedStudentId,
        normalizedSyllabusId
      ),
      normalizedTopicId
    );

    return this.getFirestoreDb().runTransaction(async (transaction) => {
      const pausedTopicSnapshot = await transaction.get(
        pausedTopicDocument
      );

      if (pausedTopicSnapshot.exists) {
        return Object.freeze({
          pausedDate: requireDateKey(
            pausedTopicSnapshot.data()?.pausedDate,
            "pausedDate"
          ),
          created: false
        });
      }

      transaction.set(studentDocument, {}, {merge: true});
      transaction.set(pausedSyllabusDocument, {}, {merge: true});
      transaction.set(pausedTopicDocument, {
        pausedDate: normalizedPausedDate
      });

      return Object.freeze({
        pausedDate: normalizedPausedDate,
        created: true
      });
    });
  }

  async isTopicPaused({
    studentId,
    syllabusId,
    topicId,
    currentDate
  } = {}) {
    const normalizedStudentId = requireDocumentId(studentId, "studentId");
    const normalizedSyllabusId = requireDocumentId(
      syllabusId,
      "syllabusId"
    );
    const normalizedTopicId = requireDocumentId(topicId, "topicId");
    const normalizedCurrentDate = requireDateKey(currentDate, "currentDate");
    const pausedTopic = await this.readDocument(
      pausedTopicsCollectionPath(
        normalizedStudentId,
        normalizedSyllabusId
      ),
      normalizedTopicId
    );

    if (!pausedTopic) {
      return false;
    }

    const pausedDate = requireDateKey(pausedTopic.pausedDate, "pausedDate");

    return !isPausedTopicExpired(pausedDate, normalizedCurrentDate);
  }

  async checkPausedTopicValidity({
    studentId,
    syllabusId,
    topicId,
    currentDate
  } = {}) {
    const normalizedStudentId = requireDocumentId(studentId, "studentId");
    const normalizedSyllabusId = requireDocumentId(
      syllabusId,
      "syllabusId"
    );
    const normalizedTopicId = requireDocumentId(topicId, "topicId");
    const normalizedCurrentDate = requireDateKey(currentDate, "currentDate");
    const pausedTopicDocument = this.getDocumentRef(
      pausedTopicsCollectionPath(
        normalizedStudentId,
        normalizedSyllabusId
      ),
      normalizedTopicId
    );

    return this.getFirestoreDb().runTransaction(async (transaction) => {
      const pausedTopicSnapshot = await transaction.get(
        pausedTopicDocument
      );

      if (!pausedTopicSnapshot.exists) {
        return Object.freeze({
          pausedDate: null,
          isPaused: false,
          unpaused: false
        });
      }

      const pausedDate = requireDateKey(
        pausedTopicSnapshot.data()?.pausedDate,
        "pausedDate"
      );

      if (!isPausedTopicExpired(pausedDate, normalizedCurrentDate)) {
        return Object.freeze({
          pausedDate,
          isPaused: true,
          unpaused: false
        });
      }

      transaction.delete(pausedTopicDocument);

      return Object.freeze({
        pausedDate,
        isPaused: false,
        unpaused: true
      });
    });
  }

  async listAcceptedAdditionalPracticeIds({
    studentId,
    syllabusId,
    date,
    candidates
  } = {}) {
    const normalizedStudentId = requireDocumentId(studentId, "studentId");
    const normalizedSyllabusId = requireDocumentId(
      syllabusId,
      "syllabusId"
    );
    const normalizedDate = requireDateKey(date);

    if (!Array.isArray(candidates)) {
      throw new Error("candidates must be an array.");
    }

    const uniqueCandidates = [];
    const candidateKeys = new Set();

    candidates.forEach((candidate, index) => {
      if (
        !candidate
        || typeof candidate !== "object"
        || Array.isArray(candidate)
      ) {
        throw new Error(`candidates[${index}] must be an object.`);
      }

      const topicId = requireDocumentId(
        candidate.topicId,
        `candidates[${index}].topicId`
      );
      const practiceId = requireDocumentId(
        candidate.practiceId,
        `candidates[${index}].practiceId`
      );
      const key = `${topicId}/${practiceId}`;

      if (!candidateKeys.has(key)) {
        candidateKeys.add(key);
        uniqueCandidates.push({topicId, practiceId});
      }
    });

    if (uniqueCandidates.length === 0) {
      return [];
    }

    const records = await this.readDocuments(
      uniqueCandidates.map(({topicId, practiceId}) => ({
        collectionPath: additionalPracticesCollectionPath(
          normalizedStudentId,
          normalizedDate,
          normalizedSyllabusId,
          topicId
        ),
        documentId: practiceId
      })),
      {includeId: false}
    );

    if (!Array.isArray(records) || records.length !== uniqueCandidates.length) {
      throw new Error("The additional daily mission records are invalid.");
    }

    return uniqueCandidates
      .filter((candidate, index) => records[index] !== null)
      .map(({practiceId}) => practiceId)
      .sort((first, second) => first.localeCompare(second));
  }

  async listAcceptedAdditionalTopicIds({studentId, syllabusId, date} = {}) {
    const normalizedStudentId = requireDocumentId(studentId, "studentId");
    const normalizedSyllabusId = requireDocumentId(
      syllabusId,
      "syllabusId"
    );
    const normalizedDate = requireDateKey(date);
    const topicIds = await this.readCollectionIds(
      additionalTopicsCollectionPath(
        normalizedStudentId,
        normalizedDate,
        normalizedSyllabusId
      )
    );

    return [...topicIds].sort((first, second) => first.localeCompare(second));
  }

  async listPausedTopicIds({studentId, syllabusId} = {}) {
    const normalizedStudentId = requireDocumentId(studentId, "studentId");
    const normalizedSyllabusId = requireDocumentId(
      syllabusId,
      "syllabusId"
    );
    const topicIds = await this.readCollectionIds(
      pausedTopicsCollectionPath(normalizedStudentId, normalizedSyllabusId)
    );

    return [...topicIds].sort((first, second) => first.localeCompare(second));
  }

  async listTopicStats({studentId, syllabusId} = {}) {
    const normalizedStudentId = requireDocumentId(studentId, "studentId");
    const normalizedSyllabusId = requireDocumentId(
      syllabusId,
      "syllabusId"
    );
    const records = await this.readCollection(
      missionStatsTopicsCollectionPath(
        normalizedStudentId,
        normalizedSyllabusId
      )
    );

    return records
      .map((record) => Object.freeze({
        topicId: record.id,
        lastAcceptedDate: record.lastAcceptedDate
      }))
      .sort((first, second) => first.topicId.localeCompare(second.topicId));
  }

  async unpauseTopic({studentId, syllabusId, topicId} = {}) {
    const normalizedStudentId = requireDocumentId(studentId, "studentId");
    const normalizedSyllabusId = requireDocumentId(
      syllabusId,
      "syllabusId"
    );
    const normalizedTopicId = requireDocumentId(topicId, "topicId");

    await this.deleteDocument(
      pausedTopicsCollectionPath(
        normalizedStudentId,
        normalizedSyllabusId
      ),
      normalizedTopicId
    );
  }
}

export {
  additionalPracticesCollectionPath,
  additionalTopicsCollectionPath,
  corePracticesCollectionPath,
  coreTopicsCollectionPath,
  missionStatsTopicsCollectionPath,
  pausedTopicsCollectionPath
};
