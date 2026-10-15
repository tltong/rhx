async function createDailyMissionRewardId({missionDate, syllabusId}) {
  // Match the backend's bounded award ID for the same subject and mission day.
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(syllabusId));
  const subjectKey = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  return "daily-mission-" + missionDate + "-" + subjectKey;
}

export {createDailyMissionRewardId};
