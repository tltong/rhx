const {test} = require("node:test"), assert = require("node:assert/strict");
const {availability, subjectOverview, generationView, normalizeStart} = require("./domain/student_subject_assessment");
const {StudentSubjectAssessmentService} = require("./application/student_subject_assessment_service");

test("the shared interval gates each subject at the exact elapsed-day boundary", () => {
  const submittedAt = new Date("2026-11-01T03:00:00Z"), next = +submittedAt + 7 * 86400000;
  assert.equal(availability({intervalDays: 7}, null, +submittedAt).canStart, true);
  assert.equal(availability({intervalDays: 7}, submittedAt, next - 1).canStart, false);
  assert.equal(availability({intervalDays: 7}, submittedAt, next).canStart, true);
  assert.equal(+availability({intervalDays: 7}, submittedAt, next).nextAvailableAt, next);
  for (const settings of [null, {}, {intervalDays: 0}, {intervalDays: 0.5}, {intervalDays: Number.MAX_SAFE_INTEGER}]) assert.equal(availability(settings, null, next).canStart, false);
});
test("overview separates unfinished work, marking, score availability and subject cooldown", () => {
  const now = Date.now(), submittedAt = new Date(now - 86400000), scope = {syllabusId: "english", language: "English"};
  const input = {scope, configured: true, settings: {intervalDays: 7}, now,
    assessments: [{assessmentId: "old", syllabusId: "english"}],
    submissions: [{assessmentId: "old", syllabusId: "english", status: "submitted", submittedAt, markingStatus: "pending"}],
    results: [{assessmentId: "previous", syllabusId: "english", submittedAt: new Date(now - 10 * 86400000), score: 80},
      {assessmentId: "other", syllabusId: "math", submittedAt: new Date(now), score: 100}]};
  const state = subjectOverview(input);
  assert.equal(state.canStart, false); assert.equal(state.reason, "cooldown"); assert.equal(state.latestResult.score, 80); assert.equal(state.latestSubmission.markingStatus, "pending");
  assert.equal(subjectOverview({...input, scope: {syllabusId: "math", language: "English"}}).canStart, true, "One subject never starts another subject's cooldown");
  const active = subjectOverview({...input, settings: null, assessments: [...input.assessments, {assessmentId: "active", syllabusId: "english"}]});
  assert.equal(active.activeAssessment.assessmentId, "active"); assert.equal(active.canStart, false);
});
test("no repeat permits an initial assessment per subject and blocks later starts after submission", () => {
  const now = Date.now(), settings = {repeatMode: "none", intervalDays: null};
  assert.deepEqual(availability(settings, null, now), {canStart: true, nextAvailableAt: null, reason: null});
  assert.deepEqual(availability(settings, new Date(now - 400 * 86400000), now), {canStart: false, nextAvailableAt: null, reason: "noRepeat"});
  assert.equal(availability({intervalDays: null}, null, now).reason, "intervalNotConfigured");
  assert.equal(availability({repeatMode: "unknown", intervalDays: 7}, null, now).canStart, false);
  const input = {scope: {syllabusId: "english", language: "English"}, settings, configured: true, now,
    assessments: [{assessmentId: "first", syllabusId: "english"}],
    submissions: [{assessmentId: "first", syllabusId: "english", status: "submitted", markingStatus: "pending"}], results: []};
  assert.equal(subjectOverview(input).reason, "noRepeat", "A legacy submitted record without a timestamp still counts as the initial assessment");
  assert.equal(subjectOverview({...input, scope: {syllabusId: "math", language: "English"}}).canStart, true);
  assert.equal(subjectOverview({...input, assessments: [...input.assessments, {assessmentId: "in-progress", syllabusId: "english"}]}).activeAssessment.assessmentId, "in-progress");
});
test("student-visible generation progress excludes settings, answer keys, drafts and leases", () => {
  const now = Date.now(), job = {generationId: "job", clientRequestId: "request", status: "generating", updatedAt: new Date(now), leaseUntil: new Date(now + 60000),
    progress: {prepared: 1, total: 3, drafts: "private"}, configurationSnapshot: {private: true}, leaseToken: "secret", marking: {correctAnswer: "a"}};
  const dto = generationView(job, now);
  assert.deepEqual(Object.keys(dto).sort(), ["canRetry", "errorMessage", "generationId", "progress", "requestId", "status"]);
  assert.deepEqual(dto.progress, {prepared: 1, total: 3}); assert.equal(dto.canRetry, false);
  assert.equal(generationView({...job, leaseUntil: new Date(now - 1)}, now).canRetry, true);
});
test("student start derives identity and subscription language rather than accepting client overrides", async () => {
  const calls = [];
  const service = new StudentSubjectAssessmentService({authorize: async (scope, context) => {assert.equal(scope.studentId, context.auth.uid); return {uid: context.auth.uid};},
    listSubjects: async studentId => {assert.equal(studentId, "student"); return [{syllabusId: "english", language: "Chinese"}];},
    repository: {subscribedSubjects: async (_id, scopes) => scopes,
      start: async (...args) => {calls.push(args); return {status: "generating"};}, overview: async () => ({subjects: []})}});
  await assert.rejects(service.overview({}), {code: "unauthenticated"});
  for (const extra of [{studentId: "other"}, {language: "English"}]) assert.throws(() => normalizeStart({syllabusId: "english", requestId: "request", ...extra}));
  await assert.rejects(service.start({syllabusId: "unsubscribed", requestId: "request"}, {auth: {uid: "student"}}), {code: "permission-denied"});
  await service.start({syllabusId: "english", requestId: "request"}, {auth: {uid: "student"}});
  assert.equal(calls.length, 1); assert.equal(calls[0][0], "student"); assert.equal(calls[0][1].language, "Chinese");
});
test("generation trigger starts only student queue/continuation requests", async () => {
  const {processStudentSubjectAssessmentGeneration} = require("../../triggers/student_subject_assessment_generation_trigger");
  let calls = 0;
  const event = (before, after) => ({params: {generationId: "job"}, data: {before: {data: () => before}, after: {data: () => after}}});
  const deps = {generate: async (id, request) => {assert.equal(id, "job"); assert.equal(request, 1); calls++;}};
  await processStudentSubjectAssessmentGeneration(event(null, {status: "generating"}), deps);
  await processStudentSubjectAssessmentGeneration(event({generationRequest: 1}, {entryPoint: "student", status: "generating", generationRequest: 1}), deps);
  await processStudentSubjectAssessmentGeneration(event(null, {entryPoint: "student", status: "queued", generationRequest: 1}), deps);
  assert.equal(calls, 1);
});
