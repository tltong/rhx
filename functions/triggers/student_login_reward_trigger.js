const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const {awardStudentLogin} = require("../features/reward/reward_module");
const {STUDENT_LOGINS_COLLECTION, STUDENT_LOGIN_HISTORY_SUBCOLLECTION} = require("../schema/student_login_schema");

const STUDENT_LOGIN_DOCUMENT = [
  STUDENT_LOGINS_COLLECTION, "{studentId}", STUDENT_LOGIN_HISTORY_SUBCOLLECTION, "{loginDate}",
].join("/");

async function processStudentLoginRecorded(event, {awardLogin = awardStudentLogin} = {}) {
  if (!event.data) {
    logger.warn("Student login event has no document.", {eventId: event.id});
    return null;
  }
  const context = {eventId: event.id, studentId: event.params.studentId, loginDate: event.params.loginDate};
  try {
    const result = await awardLogin({studentId: context.studentId, loginDate: context.loginDate});
    logger.info("Student login rewards processed.", {
      ...context,
      dailyCoins: result.dailyReward.award.coins,
      dailyAlreadyAwarded: result.dailyReward.alreadyAwarded,
      streakCoins: result.streakReward?.award.coins ?? null,
      streakAlreadyAwarded: result.streakReward?.alreadyAwarded ?? null,
    });
    return result;
  } catch (error) {
    logger.error("Student login rewards could not be processed.", {
      ...context, errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

const onStudentLoginRecorded = onDocumentCreated({
  document: STUDENT_LOGIN_DOCUMENT,
  region: "us-central1",
  retry: true,
  timeoutSeconds: 120,
}, processStudentLoginRecorded);

module.exports = {onStudentLoginRecorded, processStudentLoginRecorded};
