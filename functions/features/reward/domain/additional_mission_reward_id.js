const {createHash} = require("node:crypto");

async function createAdditionalMissionRewardId({missionDate, syllabusId, topicId}) {
  // Encode both IDs unambiguously, then bound the award ID with a digest.
  const key = JSON.stringify([syllabusId, topicId]);
  return "additional-mission-" + missionDate + "-" + createHash("sha256").update(key, "utf8").digest("hex");
}

module.exports = {createAdditionalMissionRewardId};
