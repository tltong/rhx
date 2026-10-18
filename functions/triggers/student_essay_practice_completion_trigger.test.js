const assert = require("node:assert/strict");
const test = require("node:test");
const {scoreCompletedStudentEssay, onStudentEssayPracticeCompleted} = require("./student_essay_practice_completion_trigger");
const scope = {studentId: "student", essayPracticeId: "attempt"};
const reviewComment = "Your paragraphs are clear. Develop the final idea with an example.";
const completion = {...scope, essayQuestionId: "question", essayText: "  My essay.\nSecond paragraph.  ",
  syllabusId: "syllabus", topicId: "writing",
  completedAt: new Date("2026-10-18T08:00:00Z")};
function harness(overrides = {}) {
  const calls = [];
  let result = null, finished = false;
  const deps = {
    getCompletion: async input => {assert.deepEqual(input, scope); return completion;},
    claimScoring: async () => !finished,
    getResult: async () => result,
    score: async input => {calls.push(["score", input]); return {score: 82, reviewComment, corrections: []};},
    saveResult: async (input, context) => {calls.push(["save", input, context]); result = {...input, scoredAt: new Date()}; return result;},
    setStatus: async input => {calls.push(["status", input.status]); finished = input.status === "completed";},
    awardDailyMission: async input => {calls.push(["reward", input]);},
    awardAdditionalMission: async input => {calls.push(["bonusReward", input]);},
    assessEssay: async input => {calls.push(["assess", input]); return {assessed: true, levelChanged: true, reachedLevelIds: ["level-2"]};},
    awardLevelUp: async input => {calls.push(["levelReward", input]); return null;},
    generateNextEssay: async (input, context) => {calls.push(["generate", input, context]); return {essayPracticeId: "next"};},
    calculateReadiness: async input => {calls.push(["calculateReadiness", input]); return 82;},
    saveReadiness: async input => {calls.push(["saveReadiness", input]); return input;},
    calculateSubjectReadiness: async input => {calls.push(["calculateSubjectReadiness", input]); return 70;},
    saveSubjectReadiness: async input => {calls.push(["saveSubjectReadiness", input]); return input;},
    calculateTopicReliability: async input => {calls.push(["calculateReliability", input]); return {score: 10, completedPracticeCount: 1};},
    saveTopicReliability: async input => {calls.push(["saveReliability", input]); return input;},
    calculateSubjectReliability: async input => {calls.push(["calculateSubjectReliability", input]); return 5;},
    saveSubjectReliability: async input => {calls.push(["saveSubjectReliability", input]); return input;},
    ...overrides,
  };
  return {calls, deps, run: () => scoreCompletedStudentEssay(scope, deps), setResult: value => {result = value;}};
}
test("saved submission is scored, prepares its next essay and saves topic then subject metrics", async () => {
  const h = harness();
  assert.equal((await h.run()).score, 82);
  assert.deepEqual(h.calls.find(c => c[0] === "score")[1], {questionId: "question", answer: completion.essayText});
  assert.deepEqual(h.calls.find(c => c[0] === "save").slice(1), [
    {studentId: "student", questionId: "question", answer: completion.essayText, score: 82, reviewComment, corrections: []},
    {submittedAt: completion.completedAt},
  ]);
  assert.deepEqual(h.calls.find(c => c[0] === "reward")[1], {studentId: "student", practiceId: "attempt", practiceType: "essay"});
  assert.deepEqual(h.calls.find(c => c[0] === "bonusReward")[1], {studentId: "student", practiceId: "attempt", practiceType: "essay"});
  assert.deepEqual(h.calls.find(c => c[0] === "generate").slice(1), [
    {studentId: "student", completedEssayPracticeId: "attempt"}, {updatedBy: "system:onStudentEssayPracticeCompleted"},
  ]);
  assert.deepEqual(h.calls.find(c => c[0] === "saveReadiness")[1], {
    studentId: "student", syllabusId: "syllabus", topicId: "writing", score: 82, practiceId: "attempt", practiceType: "essay",
  });
  assert.deepEqual(h.calls.find(c => c[0] === "saveSubjectReadiness")[1], {
    studentId: "student", syllabusId: "syllabus", score: 70, practiceId: "attempt", practiceType: "essay",
  });
  assert.deepEqual(h.calls.find(c => c[0] === "saveReliability")[1], {
    studentId: "student", syllabusId: "syllabus", topicId: "writing", score: 10, completedPracticeCount: 1,
  });
  const position = name => h.calls.findIndex(c => c[0] === name);
  assert.ok(position("save") < position("assess"));
  assert.ok(position("assess") < position("generate"));
  assert.ok(position("assess") < position("levelReward"));
  assert.deepEqual(h.calls.find(c => c[0] === "assess")[1], scope);
  assert.deepEqual(h.calls.find(c => c[0] === "levelReward")[1], {studentId: "student", practiceId: "attempt"});
  assert.ok(position("save") < position("generate"));
  assert.ok(position("save") < position("calculateReadiness"));
  assert.ok(position("saveReadiness") < position("calculateSubjectReadiness"));
  assert.ok(position("saveReliability") < position("calculateSubjectReliability"));
  await h.run();
  assert.equal(h.calls.filter(c => c[0] === "score").length, 1);
  assert.equal(h.calls.filter(c => c[0] === "save").length, 1);
  assert.equal(h.calls.filter(c => c[0] === "generate").length, 2, "Terminal grading does not skip retryable downstream work");
});
test("a saved grade is reused after a status write failed", async () => {
  const h = harness(); h.setResult({answer: completion.essayText, score: 75, reviewComment, corrections: []});
  assert.equal((await h.run()).score, 75);
  assert.equal(h.calls.some(c => c[0] === "score"), false);
  assert.equal(h.calls.find(c => c[0] === "save")[1].reviewComment, reviewComment);
  assert.ok(h.calls.some(c => c[0] === "status" && c[1] === "completed"));
});

test("a retry scores a legacy grade lacking an overall review before saving it", async () => {
  const h = harness(); h.setResult({answer: completion.essayText, score: 75, corrections: []});
  assert.equal((await h.run()).reviewComment, reviewComment);
  assert.equal(h.calls.filter(c => c[0] === "score").length, 1);
  assert.equal(h.calls.find(c => c[0] === "save")[1].reviewComment, reviewComment);
});
test("grading failures retain submission, record failed status, award mission and propagate for retry", async () => {
  const h = harness({score: async () => {throw new Error("AI unavailable");}});
  await assert.rejects(h.run, /AI unavailable/);
  assert.ok(h.calls.some(c => c[0] === "status" && c[1] === "failed"));
  assert.ok(h.calls.some(c => c[0] === "reward"));
  assert.equal(h.calls.some(c => c[0] === "save"), false);
  assert.equal(h.calls.some(c => c[0] === "generate" || c[0] === "saveReadiness" || c[0] === "assess" || c[0] === "levelReward"), false);
  assert.ok(h.calls.some(c => c[0] === "saveSubjectReliability"));
});
test("reward failure still lets grading finish and requests an event retry", async () => {
  const h = harness({awardDailyMission: async () => {throw new Error("Reward unavailable");}});
  await assert.rejects(h.run, /Reward unavailable/);
  assert.ok(h.calls.some(c => c[0] === "status" && c[1] === "completed"));
});

test("additional reward failures retain grading and metrics and are retried with the completion", async () => {
  let fail = true;
  const h = harness({awardAdditionalMission: async () => {if (fail) throw new Error("Bonus award failed");}});
  await assert.rejects(h.run(), /Bonus award failed/);
  assert.ok(h.calls.some(c => c[0] === "generate")); assert.ok(h.calls.some(c => c[0] === "saveReadiness"));
  fail = false; await h.run(); assert.equal(h.calls.filter(c => c[0] === "score").length, 1);
});

test("generation failures retain grading and both metrics; retries skip AI grading but retry generation", async () => {
  let unavailable = true;
  const h = harness({generateNextEssay: async () => {if (unavailable) throw new Error("Generation unavailable");}});
  await assert.rejects(h.run, /Generation unavailable/);
  assert.ok(h.calls.some(c => c[0] === "saveSubjectReadiness"));
  assert.ok(h.calls.some(c => c[0] === "saveSubjectReliability"));
  assert.equal(h.calls.some(c => c[0] === "status" && c[1] === "failed"), false);
  unavailable = false;
  await h.run(); assert.equal(h.calls.filter(c => c[0] === "score").length, 1);
});

test("readiness failure cannot cancel generation, reliability or the saved grade", async () => {
  const h = harness({calculateReadiness: async () => {throw new Error("Readiness unavailable");}});
  await assert.rejects(h.run, /Readiness unavailable/);
  assert.ok(h.calls.some(c => c[0] === "generate"));
  assert.ok(h.calls.some(c => c[0] === "saveSubjectReliability"));
  assert.ok(h.calls.some(c => c[0] === "status" && c[1] === "completed"));
});

test("reliability failures cannot cancel grading, readiness or next essay generation", async () => {
  const h = harness({calculateTopicReliability: async () => {throw new Error("Reliability unavailable");}});
  await assert.rejects(h.run, /Reliability unavailable/);
  assert.ok(h.calls.some(c => c[0] === "generate"));
  assert.ok(h.calls.some(c => c[0] === "saveSubjectReadiness"));
});

test("no readiness data skips readiness writes while preserving the other follow-ups", async () => {
  const h = harness({calculateReadiness: async () => null});
  await h.run();
  assert.equal(h.calls.some(c => c[0] === "saveReadiness" || c[0] === "calculateSubjectReadiness"), false);
  assert.ok(h.calls.some(c => c[0] === "generate"));
  assert.ok(h.calls.some(c => c[0] === "saveSubjectReliability"));
});
test("an active grading worker is not marked failed by a duplicate delivery", async () => {
  const h = harness({claimScoring: async () => {throw new Error("Already scoring");}});
  await assert.rejects(h.run, /Already scoring/);
  assert.equal(h.calls.some(c => c[0] === "status" || c[0] === "score"), false);
});
test("a newer result returned by conditional save marks the old attempt superseded", async () => {
  const h = harness({saveResult: async () => ({answer: "A newer essay", score: 90})});
  assert.equal((await h.run()).score, 90);
  assert.ok(h.calls.some(c => c[0] === "status" && c[1] === "superseded"));
});
test("missing completions cannot be scored or rewarded", async () => {
  const h = harness({getCompletion: async () => null});
  await assert.rejects(h.run, /could not be found/); assert.deepEqual(h.calls, []);
});
test("exports a retryable Firestore completion trigger with the AI secret", () => {
  const options = onStudentEssayPracticeCompleted.__endpoint;
  assert.equal(options.eventTrigger.eventFilterPathPatterns.document, "studentEssayPractices/{studentId}/completedEssayPractices/{essayPracticeId}");
  assert.equal(options.eventTrigger.retry, true);
  assert.ok(options.secretEnvironmentVariables.length);
});

test("assessment failures retain grading and metrics, block generation and retry without rescoring", async () => {
  let fail = true;
  const h = harness({assessEssay: async () => {if (fail) throw new Error("Assessment unavailable"); return {assessed: true};}});
  await assert.rejects(h.run(), /Assessment unavailable/);
  assert.ok(h.calls.some(c => c[0] === "saveSubjectReadiness"));
  assert.ok(h.calls.some(c => c[0] === "saveSubjectReliability"));
  assert.equal(h.calls.some(c => c[0] === "generate" || c[0] === "levelReward"), false);
  fail = false; await h.run();
  assert.equal(h.calls.filter(c => c[0] === "score").length, 1);
  assert.ok(h.calls.some(c => c[0] === "generate"));
  assert.ok(h.calls.some(c => c[0] === "levelReward"));
});

test("level reward failures retry the saved transition without blocking next essay assignment", async () => {
  let fail = true;
  const h = harness({awardLevelUp: async () => {if (fail) throw new Error("Level coins unavailable");}});
  await assert.rejects(h.run(), /Level coins unavailable/);
  assert.ok(h.calls.some(c => c[0] === "generate"));
  fail = false; await h.run();
  assert.equal(h.calls.filter(c => c[0] === "score").length, 1);
  assert.equal(h.calls.filter(c => c[0] === "assess").length, 2);
});

test("topics without essay frameworks continue practice without level rewards", async () => {
  const h = harness({assessEssay: async () => ({assessed: false, reason: "essay-assessment-framework-required"})});
  await h.run();
  assert.ok(h.calls.some(c => c[0] === "generate"));
  assert.equal(h.calls.some(c => c[0] === "levelReward"), false);
});

test("a superseded grade cannot advance levels or award level coins", async () => {
  const h = harness({saveResult: async () => ({answer: "A newer essay", score: 90})});
  await h.run();
  assert.equal(h.calls.some(c => c[0] === "assess" || c[0] === "levelReward"), false);
});
