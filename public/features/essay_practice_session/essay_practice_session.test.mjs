import assert from "node:assert/strict";
import {test} from "node:test";
import {createRequire} from "node:module";
import {LoadEssayPracticeSession as WebLoad} from "./application/load_essay_practice_session.js";
import {SubmitEssayPracticeSession as WebSubmit} from "./application/submit_essay_practice_session.js";
const require = createRequire(import.meta.url);
const {LoadEssayPracticeSession: BackendLoad} = require("../../../functions/features/essay_practice_session/application/load_essay_practice_session");
const {SubmitEssayPracticeSession: BackendSubmit} = require("../../../functions/features/essay_practice_session/application/submit_essay_practice_session");
const scope = {studentId: "student", essayPracticeId: "attempt"};
const practice = {...scope, essayQuestionId: "question"};
for (const [layer, Load, Submit] of [["backend", BackendLoad, BackendSubmit], ["web", WebLoad, WebSubmit]]) {
  const make = overrides => new Load({getCompletedEssayPractice: async () => null, getAssignedEssayPractice: async () => practice,
    getEssayQuestionById: async id => ({questionId: id, questionText: "Write an essay."}), getEssayResult: async () => null, ...overrides});
  test(layer + ": loads assignment and saved question without invoking AI or writing", async () => {
    const session = await make().execute(scope);
    assert.equal(session.status, "assigned"); assert.equal(session.question.questionId, "question");
    assert.equal(session.result, null); assert.equal(session.practice, practice);
  });
  test(layer + ": loads completion with grade only when the exact submitted answer matches", async () => {
    for (const answer of ["Original essay", "Another essay"]) {
      const completed = {...practice, essayText: "Original essay"};
      const result = {answer, score: 80, corrections: []};
      const session = await make({getCompletedEssayPractice: async () => completed, getEssayResult: async () => result}).execute(scope);
      assert.equal(session.status, "completed"); assert.equal(session.result, answer === completed.essayText ? result : null);
    }
  });
  test(layer + ": resolves a completion that moves the assignment between reads", async () => {
    let reads = 0;
    const result = await make({getAssignedEssayPractice: async () => null,
      getCompletedEssayPractice: async () => ++reads === 1 ? null : {...practice, essayText: "Saved"}}).execute(scope);
    assert.equal(result.status, "completed");
  });
  test(layer + ": missing assignment and missing question fail visibly", async () => {
    await assert.rejects(make({getAssignedEssayPractice: async () => null}).execute(scope), /not assigned/);
    await assert.rejects(make({getEssayQuestionById: async () => null}).execute(scope), /question could not be found/);
  });
  test(layer + ": submission returns the persisted completion without waiting for scoring", async () => {
    const input = {...scope, essayText: "  My essay.\n", timeTakenSeconds: 13};
    const saved = {...input, essayQuestionId: "question", scoring: {status: "pending"}};
    const submit = new Submit({getCompletedEssayPractice: async () => null, getAssignedEssayPractice: async () => practice,
      getEssayQuestionById: async () => ({wordCountRequirement: {minWords: 2}}),
      completeAssignedEssayPractice: async value => {assert.equal(value, input); return saved;}});
    assert.equal(await submit.execute(input), saved);
  });
  test(layer + ": rejects a short essay using the saved question's minimum and accepts the exact boundary", async () => {
    const writes = [];
    const submit = new Submit({getCompletedEssayPractice: async () => null, getAssignedEssayPractice: async () => practice,
      getEssayQuestionById: async id => {assert.equal(id, "question"); return {wordCountRequirement: {minWords: 3}};},
      completeAssignedEssayPractice: async input => {writes.push(input); return input;}});
    const short = {...scope, essayText: "Two words", timeTakenSeconds: 12, minWords: 1};
    await assert.rejects(submit.execute(short), error => error.code === "failed-precondition" && /at least 3 words/.test(error.message));
    assert.deepEqual(writes, []);
    const enough = {...short, essayText: "  Three\nwhole words.  "};
    assert.equal(await submit.execute(enough), enough);
  });
  test(layer + ": a retry of a completed essay retains the saved submission without rechecking its length", async () => {
    const saved = {...practice, essayText: "Original submission"};
    const submit = new Submit({getCompletedEssayPractice: async () => saved,
      getAssignedEssayPractice: async () => assert.fail("Already completed"),
      getEssayQuestionById: async () => assert.fail("Do not reapply changed requirements to a saved submission"),
      completeAssignedEssayPractice: async () => saved});
    assert.equal(await submit.execute({...scope, essayText: "Short", timeTakenSeconds: 0}), saved);
  });
  test(layer + ": a question lookup or account change prevents submission writes", async () => {
    let current = true;
    const submit = new Submit({getCompletedEssayPractice: async () => null, getAssignedEssayPractice: async () => practice,
      getEssayQuestionById: async () => {current = false; return {wordCountRequirement: {minWords: 1}};},
      completeAssignedEssayPractice: async () => assert.fail("No write after account change")});
    await assert.rejects(submit.execute({...scope, essayText: "Enough", timeTakenSeconds: 1}, {
      assertAccess() {if (!current) throw Error("Account changed");},
    }), /Account changed/);
  });
  test(layer + ": a missing assignment cannot bypass word validation, while a concurrent completion can be retried", async () => {
    let reads = 0, completed = false;
    const saved = {...practice, essayText: "Already saved essay"};
    const submit = new Submit({getAssignedEssayPractice: async () => null,
      getCompletedEssayPractice: async () => ++reads > 1 && completed ? saved : null,
      getEssayQuestionById: async () => assert.fail("No question lookup without an assignment"),
      completeAssignedEssayPractice: async () => {assert.ok(completed); return saved;}});
    const input = {...scope, essayText: "Short", timeTakenSeconds: 1};
    await assert.rejects(submit.execute(input), /assigned essay practice could not be found/);
    completed = true; reads = 0;
    assert.equal(await submit.execute(input), saved);
  });
  test(layer + ": account change prevents reading the question after assignment lookup", async () => {
    let current = true;
    await assert.rejects(make({getAssignedEssayPractice: async () => {current = false; return practice;},
      getEssayQuestionById: async () => assert.fail("No question read after account change")}).execute(scope, {assertAccess() {if (!current) throw Error("Account changed");}}), /Account changed/);
  });
}
