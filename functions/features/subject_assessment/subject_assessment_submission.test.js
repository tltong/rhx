const {test} = require("node:test"), assert = require("node:assert/strict");
const {normalizeAnswers, resultSummary} = require("./domain/subject_assessment_submission");
const assessment = {language: "English", items: [
  {position: 1, questionType: "normal"}, {position: 2, questionType: "essay"},
  {position: 3, questionType: "fillInTheBlanks", contentSnapshot: {questions: [{questionId: "q1", position: 1, requiredWordCount: 1}]}}]};

test("submission validation preserves exact essay text, validates scope and allows unanswered items", () => {
  const answers = normalizeAnswers(assessment, [{position: 2, answer: "  My essay\n"}], {final: true});
  assert.equal(answers[1].answer, "  My essay\n"); assert.equal(answers[0].selectedOption, null); assert.deepEqual(answers[2].answers, {q1: ""});
  for (const input of [[{position: 9}], [{position: 1, selectedOption: "e"}], [{position: 1, score: 100}],
    [{position: 2, questionType: "normal"}], [{position: 1}, {position: 1}], [{position: 3, answers: {outside: "value"}}]]) assert.throws(() => normalizeAnswers(assessment, input));
  assert.doesNotThrow(() => normalizeAnswers(assessment, [{position: 3, answers: {q1: "two words"}}]));
  assert.throws(() => normalizeAnswers(assessment, [{position: 3, answers: {q1: "two words"}}], {final: true}), /requires 1 word/);
});

test("overall score gives each topic equal weight while normalizing marks within each topic", () => {
  const items = [
    {topicId: "reading", topicName: "Reading", questionType: "normal", difficulty: "easy", earnedMarks: 1, maxMarks: 1, questionCount: 1},
    {topicId: "writing", topicName: "Writing", questionType: "essay", difficulty: "medium", earnedMarks: 0.8, maxMarks: 1, questionCount: 1},
    {topicId: "reading", topicName: "Reading", questionType: "fillInTheBlanks", difficulty: "hard", earnedMarks: 1, maxMarks: 2, questionCount: 2},
  ];
  const result = resultSummary(items);
  assert.equal(result.score, (2 / 3 * 100 + 80) / 2); assert.equal(result.questionCount, 4); assert.equal(result.itemCount, 3);
  assert.equal(result.scoringPolicy.aggregation, "topic"); assert.equal(result.scoringPolicy.version, 2);
  assert.equal(result.topicBreakdown[0].score, 2 / 3 * 100);
  assert.equal(result.formatBreakdown.find(value => value.questionType === "essay").score, 80);
  assert.equal(resultSummary(items, {version: 1, aggregation: "question"}).score, 70, "Previously frozen policies retain their scoring behavior");
  assert.throws(() => resultSummary([{...items[0], earnedMarks: Infinity}]), /Invalid item/);
});

test("both essay scorers can mark a frozen snapshot without loading the pool or current settings", async () => {
  const {ScoreEssay: Backend} = require("../essay_scoring/application/score_essay");
  const {ScoreEssay: Web} = await import("../../../public/features/essay_scoring/application/score_essay.js");
  const configuration = require("../essay_scoring/domain/essay_scoring_config").createDefaultConfiguration();
  for (const Scorer of [Backend, Web]) {
    const scorer = new Scorer({getEssayQuestionById: () => assert.fail("No mutable pool lookup"), getEssayScoringConfig: () => assert.fail("Use frozen settings"),
      generateLlmText: async prompt => {assert.match(prompt, /Frozen written task/); return {score: 80, reviewComment: "Clear ideas.", corrections: []};}});
    const result = await scorer.executeSnapshot({question: {level: "primary", standard: 4, language: "English", difficulty: "medium", questionText: "Frozen written task"},
      answer: "My answer", configuration});
    assert.equal(result.score, 80);
  }
});

test("callable uses authenticated identity and does not expose marking or result-saving commands", async () => {
  const {createSubjectAssessmentHandler} = require("../../subject_assessment");
  let received;
  const handler = createSubjectAssessmentHandler({apis: {submitSubjectAssessment: async (input, context) => {received = context; return {status: "submitted"};}}});
  await assert.rejects(handler({data: {action: "submit"}}), {code: "unauthenticated"});
  for (const action of ["mark", "saveResult", "prepareSubscription", "prepareSubscribedSubjectAssessment", "__proto__", "constructor"]) await assert.rejects(handler({auth: {uid: "student"}, data: {action}}), {code: "invalid-argument"});
  await handler({auth: {uid: "student"}, data: {action: "submit", input: {studentId: "another"}, context: {auth: {uid: "admin"}}}});
  assert.equal(received.auth.uid, "student");
});

test("submission trigger ignores draft/worker updates and only starts new marking requests", async () => {
  const {processSubjectAssessmentSubmission} = require("../../triggers/subject_assessment_submission_trigger");
  const event = (before, after) => ({params: {assessmentId: "paper"}, data: {before: {data: () => before}, after: {data: () => after}}});
  let calls = 0;
  const deps = {mark: async () => {calls++;}};
  await processSubjectAssessmentSubmission(event(undefined, {status: "draft", markingRequest: 0}), deps);
  await processSubjectAssessmentSubmission(event({status: "submitted", markingRequest: 1}, {status: "submitted", markingRequest: 1, markingStatus: "marking"}), deps);
  assert.equal(calls, 0);
  await processSubjectAssessmentSubmission(event({status: "draft"}, {status: "submitted", markingRequest: 1}), deps);
  await processSubjectAssessmentSubmission(event({status: "submitted", markingRequest: 1}, {status: "submitted", markingRequest: 2}), deps);
  assert.equal(calls, 2);
  await processSubjectAssessmentSubmission(event(undefined, {status: "submitted", markingRequest: 1}), {mark: async () => {throw new Error("Provider failed");}, getStatus: async () => "failed"});
});
