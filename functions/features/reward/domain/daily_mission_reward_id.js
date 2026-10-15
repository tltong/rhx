const {createHash} = require("node:crypto");

async function createDailyMissionRewardId({missionDate, syllabusId}) {
  // Hash the subject ID to keep award IDs bounded even for long Firestore IDs.
  return "daily-mission-" + missionDate + "-" + createHash("sha256").update(syllabusId, "utf8").digest("hex");
}

module.exports = {createDailyMissionRewardId};
