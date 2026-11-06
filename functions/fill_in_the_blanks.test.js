const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./features/fill_in_the_blanks_question_generator/domain/fill_in_the_blanks");
const {markPassage} = require("./features/fill_in_the_blanks_scoring/application/mark_passage");
const {createFillInTheBlanksQuestionGenerator} = require("./features/fill_in_the_blanks_question_generator/fill_in_the_blanks_question_generator_module");
const {processFillInTheBlanksSubmission} = require("./triggers/student_fill_in_the_blanks_practice_submission_trigger");
const settings = {questionsPerPassage: 3, imageEnabled: false, additionalLlmInstructions: "Use a short passage."};
const generated = {passageText: "We took {{q1}} to the park. It was {{q2}}. My {{q3}} came too.", summary: "Family park outing", imagePrompt: null,
  questions: [{questionId: "q1", requiredWordCount: 2, correctAnswer: "the dog"},
    {questionId: "q2", requiredWordCount: 1, correctAnswer: "sunny"}, {questionId: "q3", requiredWordCount: 1, correctAnswer: "sister"}]};
const passage = {...generated, language: "english", grade: 1, difficulty: "easy", topicId: "vocabulary"};
test("one passage contains individually counted blanks with exact model-answer word counts", () => {
  assert.equal(core.validateGenerated(generated, settings).questions.length, 3);
  assert.throws(() => core.validateGenerated({...generated, questions: generated.questions.slice(0, 2)}, settings), /wrong number/);
  assert.throws(() => core.validateGenerated({...generated, passageText: generated.passageText.replace("{{q2}}", "{{q1}}")}, settings), /markers/);
  assert.equal(core.validateGenerated({...generated, questions: generated.questions.map((q, i) => i ? q : {...q, requiredWordCount: 1})}, settings).questions[0].requiredWordCount, 2);
});
test("backend and web derive counts from model-answer text, including Tamil and multiword answers", async () => {
  const web = await import("../public/features/fill_in_the_blanks_question_generator/domain/fill_in_the_blanks.js");
  for (const validator of [core.validateGenerated, web.validateGenerated]) {
    for (const [answer, expected] of [["the dog", 2], ["  the   dog  ", 2], ["தமிழ் மொழி", 2], ["நாய்", 1],
      ["kucing itu", 2], ["well-known", 1], ["don't", 1], ["word — word", 2], ["the\u00a0dog", 2]]) {
      for (const declared of [1, 17, undefined, "incorrect"]) {
        const raw = {...generated, questions: generated.questions.map((q, i) => i ? q : {...q, correctAnswer: answer, requiredWordCount: declared})};
        const validated = validator(raw, settings);
        assert.equal(validated.questions[0].requiredWordCount, expected);
        assert.equal(raw.questions[0].requiredWordCount, declared, "Validation does not mutate the provider response");
        assert.doesNotThrow(() => core.validateAnswers(validated.questions, {q1: answer}));
      }
    }
  }
});
test("invalid model answers remain rejected while student word-count enforcement stays strict", async () => {
  const web = await import("../public/features/fill_in_the_blanks_question_generator/domain/fill_in_the_blanks.js");
  for (const validator of [core.validateGenerated, web.validateGenerated]) {
    for (const answer of ["...", "—", Array(31).fill("word").join(" ")]) {
      assert.throws(() => validator({...generated, questions: generated.questions.map((q, i) => i ? q : {...q, correctAnswer: answer})}, settings), /1 to 30 words/);
    }
    const valid = validator({...generated, questions: generated.questions.map((q, i) => i ? q : {...q, requiredWordCount: 1})}, settings);
    assert.throws(() => core.validateAnswers(valid.questions, {q1: "dog"}), /requires 2 word/);
  }
});
test("static matching ignores capitalization and extra whitespace; empty answers never call LLM", async () => {
  const outcome = await markPassage({passage, answers: {q1: " THE   DOG ", q2: "SUNNY", q3: "   "}, generateText: () => assert.fail("LLM must not run")});
  assert.equal(outcome.questionsCorrect, 2); assert.equal(outcome.totalQuestions, 3);
  assert.equal(outcome.score, 2 / 3 * 100); assert.equal(outcome.answers.q3.markingMethod, "unanswered");
});
test("unmatched nonempty alternatives are marked together in exactly one call", async () => {
  let calls = 0;
  const outcome = await markPassage({passage, answers: {q1: "our puppy", q2: "bright", q3: ""}, generateText: async prompt => {
    calls++; const data = JSON.parse(prompt.slice(prompt.indexOf("\n") + 1));
    assert.equal(data.answers.length, 2); assert.equal(data.passageText, passage.passageText);
    assert.deepEqual(data.answers.map(answer => answer.questionId), ["q1", "q2"]);
    return {answers: [{questionId: "q2", isCorrect: false}, {questionId: "q1", isCorrect: true}]};
  }});
  assert.equal(calls, 1); assert.equal(outcome.questionsCorrect, 1);
  assert.equal(outcome.answers.q1.submittedAnswer, "our puppy"); assert.equal(outcome.answers.q1.markingMethod, "llm");
});
test("word-count and foreign-question errors are rejected before LLM marking", async () => {
  for (const answers of [{q1: "dog"}, {q2: "very sunny"}, {q4: "extra"}, {q1: 17}]) {
    await assert.rejects(markPassage({passage, answers, generateText: () => assert.fail("LLM must not run")}), /word|outside|text/);
  }
});
test("incomplete, duplicate and nonboolean LLM marks never produce a partial final score", async () => {
  for (const response of [
    {answers: [{questionId: "q1", isCorrect: true}]},
    {answers: [{questionId: "q1", isCorrect: true}, {questionId: "q1", isCorrect: false}]},
    {answers: [{questionId: "q1", isCorrect: "yes"}, {questionId: "q2", isCorrect: true}]},
  ]) await assert.rejects(markPassage({passage, answers: {q1: "our puppy", q2: "bright"}, generateText: async () => response}), /marking/);
  await assert.rejects(markPassage({passage, answers: {q1: "our puppy"}, generateText: async () => {throw new Error("Provider unavailable");}}), /Provider unavailable/);
});
test("saved model answers and draft internals are excluded from student passage payloads", () => {
  const result = core.publicPassage({...passage, answers: {q1: "the dog"}, draft: {secret: "answer"}, leaseToken: "private"});
  assert.equal(result.answers, undefined); assert.equal(result.draft, undefined);
  assert.equal(result.leaseToken, undefined); assert.equal(result.questions[0].correctAnswer, undefined);
});

test("malformed optional image prompts do not discard a valid written passage", () => {
  for (const imagePrompt of [{scene: "invalid shape"}, "x".repeat(8001), ""]) {
    const result = core.validateGenerated({...generated, imagePrompt}, {...settings, imageEnabled: true});
    assert.equal(result.imagePrompt, null); assert.equal(result.passageText, generated.passageText);
  }
});
test("grade configuration supports exact counts, optional images and all summary history", () => {
  const config = core.normaliseConfig({gradeSettings: {primary: {1: settings}}, summaryHistory: {mode: "all", count: 20}});
  assert.equal(config.gradeSettings.primary[1].questionsPerPassage, 3);
  assert.equal(config.summaryHistory.mode, "all"); assert.equal(config.gradeSettings.secondary[6].questionsPerPassage, 5);
  assert.throws(() => core.normaliseConfig({gradeSettings: {primary: {1: {questionsPerPassage: 0}}}}), /questionsPerPassage/);
  assert.throws(() => core.id("__proto__"), /invalid/);
  assert.equal(core.wordCount("  தமிழ்  மொழி  "), 2);
});
test("image failure keeps a reusable text passage, using history without a seed or duplicate-check call", async () => {
  const draftStore = new Map(), saved = new Map(); let calls = 0, pictureCalls = 0;
  const configuration = core.normaliseConfig({gradeSettings: {primary: {1: {...settings, imageEnabled: true}}}, summaryHistory: {mode: "all", count: 20}});
  const repository = {config: () => ({get: async () => ({exists: true, data: () => configuration})}),
    draft: key => ({get: async () => ({exists: draftStore.has(key), data: () => draftStore.get(key)}),
      set: async value => draftStore.set(key, value), update: async value => draftStore.set(key, {...draftStore.get(key), ...value})}),
    summaries: async (criteria, history) => {assert.equal(history.mode, "all"); assert.equal(criteria.grade, 1); return ["Family park outing", "School library visit"];},
    save: async value => {saved.set(value.passageId, value); return core.publicPassage(value);},
  };
  const feature = createFillInTheBlanksQuestionGenerator({repository, authorize: async () => "admin", getSyllabus: async () => ({level: "primary", year: 1,
    languages: ["English"], topics: [{id: "vocabulary", topicName: "Vocabulary"}]}),
    generateText: async prompt => {calls++; assert.match(prompt, /Family park outing/); assert.match(prompt, /School library visit/);
      return {...generated, imagePrompt: "A family and their dog walking in a sunny park."};},
    createPicture: async () => {pictureCalls++; throw new Error("Image quota exceeded");},
  });
  const input = {syllabusId: "english-1", topicId: "vocabulary", language: "English", difficulty: "easy", passageId: "passage-a", save: false};
  const draft = await feature.generateFillInTheBlanksQuestion(input, {updatedBy: "admin"});
  assert.equal(draft.imageStatus, "failed"); assert.equal(draft.image, null); assert.equal(saved.size, 0);
  assert.equal(draft.questions[0].correctAnswer, "the dog");
  await feature.saveFillInTheBlanksQuestion({passageId: draft.passageId}, {updatedBy: "admin"});
  await feature.generateFillInTheBlanksQuestion(input, {updatedBy: "admin"});
  assert.equal(saved.size, 1); assert.equal(calls, 1); assert.equal(pictureCalls, 1);
});
function submissionEvent(before, after) {
  return {params: {studentId: "student", practiceId: "practice"}, data: {
    before: {data: () => before}, after: {exists: Boolean(after), data: () => after, createTime: new Date()}}};
}
test("submission events ignore backend status writes and deleted documents", async () => {
  const overrides = {sessions: {loadFillInTheBlanksPracticeSession: () => assert.fail("Backend status writes must not grade again")}};
  for (const [before, after] of [[{requestId: "one"}, {requestId: "one", markingStatus: "marking"}], [{requestId: "one"}, null], [null, {}]]) {
    assert.equal(await processFillInTheBlanksSubmission(submissionEvent(before, after), overrides), null);
  }
});
test("a Firestore submission marks the saved complete passage without an HTTP call", async () => {
  let marks = 0;
  const submission = {requestId: "one", answers: {q1: "our puppy"}, timeTakenSeconds: 12, markingStatus: "submitted"};
  const result = await processFillInTheBlanksSubmission(submissionEvent(null, submission), {
    sessions: {loadFillInTheBlanksPracticeSession: async () => ({practice: {syllabusId: "syllabus", topicId: "topic"}}),
      submitFillInTheBlanksPracticeSession: async input => {marks++; assert.deepEqual(input.answers, submission.answers); return {status: "completed"};}},
    guard: async (scope, operation) => {assert.deepEqual(scope.scopes, [{syllabusId: "syllabus", topicId: "topic"}]); return operation();},
    followup: () => assert.fail("A new completion uses its existing follow-up trigger"),
  });
  assert.equal(marks, 1); assert.equal(result.status, "completed");
});
test("retry requests on completed submissions repair follow-up work", async () => {
  let repaired = 0;
  await processFillInTheBlanksSubmission(submissionEvent({requestId: "one", markingStatus: "completed"},
    {requestId: "two", markingStatus: "completed", answers: {q1: "saved"}, timeTakenSeconds: 12}), {
    sessions: {loadFillInTheBlanksPracticeSession: async () => ({practice: {syllabusId: "syllabus", topicId: "topic"}}),
      submitFillInTheBlanksPracticeSession: async () => ({status: "completed"})},
    guard: async (_, operation) => operation(), followup: async () => {repaired++;},
  });
  assert.equal(repaired, 1);
});
test("marking failures propagate so Firestore can retry the saved submission", async () => {
  await assert.rejects(processFillInTheBlanksSubmission(submissionEvent(null, {requestId: "one", answers: {}, timeTakenSeconds: 12}), {
    sessions: {loadFillInTheBlanksPracticeSession: async () => ({practice: {syllabusId: "syllabus", topicId: "topic"}}),
      submitFillInTheBlanksPracticeSession: async () => {throw new Error("Provider unavailable");}},
    guard: async (_, operation) => operation(),
  }), /Provider unavailable/);
});
test("invalid saved answers produce a failed state without repeated marking events", async () => {
  let rejected;
  await processFillInTheBlanksSubmission(submissionEvent(null, {requestId: "one", answers: {}, timeTakenSeconds: 12}), {
    sessions: {loadFillInTheBlanksPracticeSession: async () => ({practice: {syllabusId: "syllabus", topicId: "topic"}}),
      submitFillInTheBlanksPracticeSession: async () => {throw core.problem("Wrong word count");}},
    guard: async (_, operation) => operation(), rejectSubmission: async (...args) => {rejected = args;},
  });
  assert.deepEqual(rejected, [{studentId: "student", practiceId: "practice"}, "one", "invalid-argument"]);
});
test("fill-in-the-blanks keeps feature APIs internal and exports only Firestore triggers", () => {
  const functions = require("./index");
  assert.equal(Object.hasOwn(functions, "fillInTheBlanks"), false);
  assert.equal(typeof functions.onStudentFillInTheBlanksPracticeSubmitted, "function");
  assert.equal(typeof functions.onStudentFillInTheBlanksPracticeCompleted, "function");
});
