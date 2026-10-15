async function createAdditionalMissionRewardId({missionDate, syllabusId, topicId}) {
  const key = JSON.stringify([syllabusId, topicId]);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const topicKey = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  return "additional-mission-" + missionDate + "-" + topicKey;
}

export {createAdditionalMissionRewardId};
