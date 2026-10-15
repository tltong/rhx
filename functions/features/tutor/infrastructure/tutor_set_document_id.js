const {createHash} = require("node:crypto");

async function tutorSetDocumentId({questionId, language}) {
  const key = JSON.stringify([questionId, language]);
  return "set-" + createHash("sha256").update(key, "utf8").digest("hex");
}

module.exports = {tutorSetDocumentId};
