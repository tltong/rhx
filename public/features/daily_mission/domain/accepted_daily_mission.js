import {missionTypeFields} from "./mission_practice_type.js?v=20261018-essay-session-v1";
function requireDocumentId(value, name) {
  if (typeof value !== "string" || !value.trim() || value.includes("/")
      || [".", ".."].includes(value.trim()) || /^__.*__$/.test(value.trim())
      || new TextEncoder().encode(value.trim()).length > 1500) {
    throw new Error(`${name} must be a valid document ID.`);
  }
  return value.trim();
}

function requireAcceptedDailyMissionScope(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Daily mission lookup input must be an object.");
  }
  return {
    studentId: requireDocumentId(input.studentId, "studentId"),
    practiceId: requireDocumentId(input.practiceId, "practiceId"),
    ...missionTypeFields(input.practiceType),
  };
}

function requireAcceptedDailyMissionContext(input) {
  const missionDate = input?.missionDate;
  const date = typeof missionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(missionDate)
    ? new Date(missionDate + "T00:00:00.000Z") : null;
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== missionDate) {
    throw new Error("missionDate must be a valid YYYY-MM-DD calendar date.");
  }
  return Object.freeze({
    missionDate,
    syllabusId: requireDocumentId(input.syllabusId, "syllabusId"),
    topicId: requireDocumentId(input.topicId, "topicId"),
    practiceId: requireDocumentId(input.practiceId, "practiceId"),
    ...missionTypeFields(input.practiceType),
  });
}

export {requireAcceptedDailyMissionScope, requireAcceptedDailyMissionContext};
