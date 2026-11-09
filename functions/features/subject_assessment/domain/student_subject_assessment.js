const {id, problem, clean} = require("./subject_assessment");
const {requireRepeatPolicy} = require("../../subject_assessment_config/domain/subject_assessment_config");

function subjectStateReference(db, studentId, syllabusId) {
  return db.collection("subjectAssessmentGenerations").doc("_students").collection("students").doc(id(studentId))
    .collection("subjects").doc(id(syllabusId));
}
function subscriptionKey(snapshot) {
  const time = snapshot?.createTime;
  return snapshot?.exists && time && Number.isSafeInteger(time.seconds) && Number.isInteger(time.nanoseconds)
    ? `${time.seconds}:${time.nanoseconds}` : null;
}
function milliseconds(value) {
  if (!value) return null;
  const result = +(value instanceof Date ? value : value.toDate?.() || new Date(value));
  return Number.isFinite(result) ? result : null;
}
function normalizeStart(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["syllabusId", "requestId"].includes(key))) {
    throw problem("Provide the subject and request ID only.");
  }
  return {syllabusId: id(input.syllabusId, "Syllabus ID"), requestId: id(input.requestId, "Request ID")};
}
function availability(settings, lastSubmittedAt, now, hasSubmitted = lastSubmittedAt !== null && lastSubmittedAt !== undefined) {
  let policy;
  try {policy = requireRepeatPolicy(settings);} catch (_) {return {canStart: false, nextAvailableAt: null, reason: "intervalNotConfigured"};}
  if (policy.repeatMode === "none") return {canStart: !hasSubmitted, nextAvailableAt: null, reason: hasSubmitted ? "noRepeat" : null};
  const duration = policy.intervalDays * 86400000;
  if (!Number.isSafeInteger(duration) || duration < 86400000 || duration > 8e15) return {canStart: false, nextAvailableAt: null, reason: "intervalNotConfigured"};
  const last = milliseconds(lastSubmittedAt);
  const next = last === null ? null : last + duration;
  if (next !== null && (!Number.isSafeInteger(next) || !Number.isFinite(+new Date(next)))) return {canStart: false, nextAvailableAt: null, reason: "intervalNotConfigured"};
  return {canStart: next === null || now >= next, nextAvailableAt: next === null ? null : new Date(next), reason: next !== null && now < next ? "cooldown" : null};
}
function generationView(job, now) {
  if (!job || job.status === "completed") return null;
  const expired = job.status === "generating" && (milliseconds(job.leaseUntil) || 0) <= now;
  const staleQueue = job.status === "queued" && (milliseconds(job.updatedAt) || 0) <= now - 10 * 60 * 1000;
  return clean({generationId: job.generationId, requestId: job.clientRequestId, status: job.status,
    progress: {prepared: job.progress?.prepared || 0, total: job.progress?.total || 0},
    canRetry: job.status === "failed" || expired || staleQueue,
    errorMessage: job.status === "failed" ? "Assessment preparation could not finish. Retry to resume." : null});
}
function subjectOverview({scope, settings, configured, assessments, submissions, results, generation, now}) {
  const matching = records => records.filter(item => item.syllabusId === scope.syllabusId);
  const submitted = matching(submissions).filter(item => item.status === "submitted").sort((a, b) => (milliseconds(b.submittedAt) || 0) - (milliseconds(a.submittedAt) || 0));
  const byAssessment = new Map(matching(submissions).map(item => [item.assessmentId, item]));
  const unfinished = matching(assessments).filter(item => byAssessment.get(item.assessmentId)?.status !== "submitted")
    .sort((a, b) => (milliseconds(b.generatedAt) || 0) - (milliseconds(a.generatedAt) || 0))[0];
  const latest = matching(results).sort((a, b) => (milliseconds(b.submittedAt) || 0) - (milliseconds(a.submittedAt) || 0))[0];
  const timing = availability(settings, submitted[0]?.submittedAt, now, submitted.length > 0), progress = generationView(generation, now);
  return clean({...scope, configured, ...timing, canStart: timing.canStart && configured && !unfinished && !progress,
    reason: unfinished ? "unfinishedAssessment" : progress ? "preparing" : !configured ? "subjectNotConfigured" : timing.reason,
    lastSubmittedAt: submitted[0]?.submittedAt || null,
    activeAssessment: unfinished ? {assessmentId: unfinished.assessmentId, status: byAssessment.has(unfinished.assessmentId) ? "inProgress" : "ready"} : null,
    generation: progress,
    latestSubmission: submitted[0] ? {assessmentId: submitted[0].assessmentId, markingStatus: submitted[0].markingStatus,
      markedItemCount: submitted[0].markedItemCount || 0, itemCount: submitted[0].itemCount || 0} : null,
    latestResult: latest ? {assessmentId: latest.assessmentId, score: latest.score, submittedAt: latest.submittedAt, scoredAt: latest.scoredAt} : null});
}
module.exports = {subjectStateReference, subscriptionKey, milliseconds, normalizeStart, availability, generationView, subjectOverview};
