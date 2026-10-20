import assert from "node:assert/strict";
import {test} from "node:test";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import {GenerateNextStudentEssayPractice as WebGenerator} from "./application/generate_next_student_essay_practice.js";
import {FirestoreEssayGenerationRepository as WebRepository} from "./infrastructure/firestore_essay_generation_repository.js";
import * as webSchema from "../../config/firebase/student_essay_practice_generator_schema.js";
import * as webConfig from "./config/student_essay_practice_generator_config.js";
import * as webApi from "./student_essay_practice_generator_module.js";

const require = createRequire(import.meta.url);
const {GenerateNextStudentEssayPractice: BackendGenerator} = require("../../../functions/features/student_essay_practice_generator/application/generate_next_student_essay_practice");
const {FirestoreEssayGenerationRepository: BackendRepository} = require("../../../functions/features/student_essay_practice_generator/infrastructure/firestore_essay_generation_repository");
const backendSchema = require("../../../functions/schema/student_essay_practice_generator_schema");
const backendConfig = require("../../../functions/features/student_essay_practice_generator/config/student_essay_practice_generator_config");
const backendApi = require("../../../functions/features/student_essay_practice_generator/student_essay_practice_generator_module");

const request = {studentId: "student", completedEssayPracticeId: "source"};
const actor = {updatedBy: "trusted-actor"};
const generationPath = "studentEssayPracticeGenerations/student/completions/source";
const source = {studentId: "student", essayPracticeId: "source", essayQuestionId: "original",
  syllabusId: "language-syllabus", topicId: "writing", essayText: "My essay.",
  completedAt: new Date("2026-10-18T08:00:00Z")};
const originalQuestion = {questionId: "original", level: "primary", standard: 3, language: "English",
  difficulty: "easy", seedUsed: "Friendship", questionText: "Write about a friend.", wordCountRequirement: {minWords: 100}};

function fakeFirestore() {
  const documents = new Map();
  let nextId = 0, transactionQueue = Promise.resolve();
  function reference(path) {return {path, id: path.split("/").at(-1), collection: name => collection(path + "/" + name)};}
  function collection(path) {return {doc: id => reference(path + "/" + (id ?? "auto" + String(++nextId).padStart(6, "0")))};}
  const db = {collection, async runTransaction(operation) {
    const pending = [];
    const run = transactionQueue.then(async () => {
      const result = await operation({
        async get(ref) {
          assert.equal(pending.length, 0, "Firestore requires transaction reads before writes");
          const data = structuredClone(documents.get(ref.path));
          return {exists: data !== undefined, data: () => structuredClone(data)};
        },
        set(ref, data) {pending.push([ref.path, structuredClone(data)]);},
      });
      for (const [path, data] of pending) documents.set(path, data);
      return result;
    });
    transactionQueue = run.catch(() => {});
    return run;
  }};
  return {db, documents};
}

function harness(Generator, Repository) {
  const store = fakeFirestore();
  store.documents.set("studentEssayPractices/student/completedEssayPractices/source", structuredClone(source));
  let clock = Date.parse("2026-10-18T09:00:00Z"), pageSize = 2, access = true;
  const calls = [], questions = new Map([["original", {...originalQuestion}]]);
  const completed = new Map([["source", {...source}]]), assigned = new Map();
  const controls = {seeds: ["Space exploration"], saveFailure: null, assignFailure: null,
    assignResponseFailure: null, generateFailure: null, generatedChanges: {}, afterSeed: null};
  const repository = new Repository({getFirestoreDb: () => store.db, serverTimestamp: () => new Date(clock), now: () => clock});
  function list(kind, records) {return async input => {
    calls.push([kind, {...input}]);
    const all = [...records.values()].filter(p => p.studentId === input.studentId);
    const offset = input.cursor ? Number(input.cursor) : 0;
    const practices = all.slice(offset, offset + Math.min(input.limit, pageSize));
    return {practices, nextCursor: offset + practices.length < all.length ? String(offset + practices.length) : null};
  };}
  const deps = {
    repository,
    requireAdministrator: async context => {calls.push(["access"]); return {uid: context?.updatedBy, assertAccess() {
      if (!access) throw new Error("The signed-in account changed.");
    }};},
    getCompletedEssayPractice: async input => {
      calls.push(["getCompleted", {...input}]);
      const record = completed.get(input.essayPracticeId);
      return record?.studentId === input.studentId ? record : null;
    },
    getAssignedEssayPractice: async input => {
      calls.push(["getAssigned", {...input}]);
      const record = assigned.get(input.essayPracticeId);
      return record?.studentId === input.studentId ? record : null;
    },
    listCompletedEssayPractices: list("listCompleted", completed),
    listAssignedEssayPractices: list("listAssigned", assigned),
    random: () => 0,
    listEssayQuestions: async input => {
      calls.push(["listQuestions", {...input}]);
      const all = [...questions.values()].filter(q => ["level", "standard", "language", "difficulty"].every(key => q[key] === input[key]));
      const offset = input.cursor ? Number(input.cursor) : 0;
      const page = all.slice(offset, offset + Math.min(pageSize, input.limit));
      return {questions: page, nextCursor: offset + page.length < all.length ? String(offset + page.length) : null};
    },
    getEssayQuestionById: async id => {calls.push(["question", id]); return questions.get(id) ?? null;},
    getQuestionSeedEntries: async input => {
      calls.push(["seed", {...input}]);
      await controls.afterSeed?.();
      return controls.seeds.map(value => {
        if (value instanceof Error) throw value;
        return {value, associations: {[input.level]: [input.grade]}};
      });
    },
    getDefaultQuestionSeedTheme: async () => {calls.push(["defaultTheme"]); return "latest news";},
    generateEssayQuestion: async (input, context) => {
      calls.push(["generate", {...input}, context]);
      if (controls.generateFailure) throw controls.generateFailure;
      return {questionId: "generated-question", level: input.level, standard: input.standard, language: input.language,
        difficulty: input.difficulty, seedUsed: input.seed, questionText: "Write about " + input.seed + ".",
        wordCountRequirement: {minWords: 100}, ...controls.generatedChanges};
    },
    saveEssayQuestion: async (input, context) => {
      calls.push(["save", structuredClone(input), context]);
      if (controls.saveFailure) throw controls.saveFailure;
      const question = {...input, generatedAt: new Date(clock)};
      questions.set(input.questionId, question);
      return question;
    },
    assignEssayPracticeToStudent: async (input, context) => {
      calls.push(["assign", {...input}, context]);
      await controls.beforeAssign?.(input);
      if (controls.usedQuestionIds?.has(input.essayQuestionId)) throw Object.assign(new Error("Essay already used"), {code: "essay-question-already-used"});
      if (context.preventQuestionReuse && [...assigned.values(), ...completed.values()].some(p => p.studentId === input.studentId
          && p.essayQuestionId === input.essayQuestionId && p.essayPracticeId !== input.essayPracticeId)) {
        throw Object.assign(new Error("Essay already used"), {code: "essay-question-already-used"});
      }
      if (controls.assignFailure) throw controls.assignFailure;
      if (completed.has(input.essayPracticeId)) throw new Error("Already completed");
      const record = assigned.get(input.essayPracticeId) ?? {...input, assignedAt: new Date(clock)};
      assigned.set(input.essayPracticeId, record);
      if (controls.assignResponseFailure) throw controls.assignResponseFailure;
      return record;
    },
  };
  const generator = new Generator(deps);
  return {...store, calls, questions, completed, assigned, repository, controls,
    run: (input = request, context = actor) => generator.execute(input, context),
    count: name => calls.filter(call => call[0] === name).length,
    advance: delta => {clock += delta;}, changeAccount: () => {access = false;},
    setPageSize: value => {pageSize = value;},
  };
}

test("matching backend/web schema, limits and internal API without Firebase endpoint exports", async () => {
  for (const key of Object.keys(backendSchema)) assert.deepEqual(webSchema[key], backendSchema[key]);
  for (const key of Object.keys(backendConfig)) assert.equal(webConfig[key], backendConfig[key]);
  assert.equal(webConfig.QUESTION_SELECTION_ATTEMPT_LIMIT, 10);
  assert.deepEqual(Object.keys(backendApi), ["generateNextStudentEssayPractice"]);
  assert.deepEqual(Object.keys(webApi), ["generateNextStudentEssayPractice"]);
  await assert.rejects(() => backendApi.generateNextStudentEssayPractice(request), /updatedBy/);
  const index = await readFile(new URL("../../../functions/index.js", import.meta.url), "utf8");
  assert.doesNotMatch(index, /student_essay_practice_generator|generateNextStudentEssayPractice/);
});

for (const [layer, Generator, Repository] of [["backend", BackendGenerator, BackendRepository], ["web", WebGenerator, WebRepository]]) {
  const make = () => harness(Generator, Repository);

  test(layer + ": reuses a stored question from the full eligible unused theme pool without calling the LLM", async () => {
    const h = make();
    h.controls.seeds = ["Adventure"];
    h.questions.set("bank", {...originalQuestion, questionId: "bank", difficulty: "medium", seedUsed: "Adventure"});
    const next = await h.run();
    assert.equal(next.essayQuestionId, "bank");
    for (const name of ["defaultTheme", "generate", "save"]) assert.equal(h.count(name), 0);
    assert.deepEqual(h.calls.find(c => c[0] === "seed")[1], {vertical: "theme", level: "primary", grade: 3});
    assert.equal(h.calls.find(c => c[0] === "assign")[2].preventQuestionReuse, true);
    assert.equal(h.documents.get(generationPath).essayQuestionId, "bank");
  });

  test(layer + ": scans every bank and history page and never reuses assigned or completed questions across topics", async () => {
    const h = make(); h.setPageSize(1);
    h.controls.seeds = Array.from({length: 5}, (_, index) => "Theme " + index);
    for (let index = 0; index < 5; index++) {
      const id = "bank" + index;
      h.questions.set(id, {...originalQuestion, questionId: id, difficulty: "medium", seedUsed: "Theme " + index});
      if (index < 4) (index % 2 ? h.assigned : h.completed).set(id, {...source, essayPracticeId: id, essayQuestionId: id,
        syllabusId: "another-subject", topicId: "another-topic"});
    }
    const next = await h.run();
    assert.equal(next.essayQuestionId, "bank4"); assert.equal(h.count("listQuestions"), 5);
    assert.equal(h.count("generate"), 0);
  });

  test(layer + ": uses an unused bank theme, then generates the default instead of another used-theme question", async () => {
    const h = make();
    h.controls.seeds = ["Friendship", "Space"];
    h.questions.set("new-theme", {...originalQuestion, questionId: "new-theme", difficulty: "medium", seedUsed: "Space"});
    h.questions.set("old-theme", {...originalQuestion, questionId: "old-theme", difficulty: "medium"});
    assert.equal((await h.run()).essayQuestionId, "new-theme");
    h.completed.set("next-source", {...source, essayPracticeId: "next-source", essayQuestionId: "new-theme"});
    h.documents.set("studentEssayPractices/student/completedEssayPractices/next-source", h.completed.get("next-source"));
    assert.equal((await h.run({...request, completedEssayPracticeId: "next-source"})).essayQuestionId, "generated-question");
    assert.equal(h.count("generate"), 1); assert.equal(h.count("defaultTheme"), 1);
    assert.equal(h.calls.find(c => c[0] === "generate")[1].seed, "latest news");
  });

  test(layer + ": other students can reuse the same stored question", async () => {
    const h = make();
    h.questions.set("shared", {...originalQuestion, questionId: "shared", difficulty: "medium", seedUsed: "Space exploration"});
    h.completed.set("other", {...source, studentId: "other-student", essayPracticeId: "other", essayQuestionId: "shared"});
    assert.equal((await h.run()).essayQuestionId, "shared"); assert.equal(h.count("generate"), 0);
  });

  test(layer + ": an exhausted matching pool generates, saves and assigns a new question", async () => {
    const h = make(); h.questions.get("original").difficulty = "medium";
    h.questions.set("pending", {...originalQuestion, questionId: "pending", difficulty: "medium"});
    h.assigned.set("pending", {...source, essayPracticeId: "pending", essayQuestionId: "pending"});
    assert.equal((await h.run()).essayQuestionId, "generated-question");
    assert.equal(h.count("generate"), 1); assert.equal(h.count("save"), 1);
    assert.ok(h.questions.has("generated-question"));
  });

  test(layer + ": resumes a saved reuse selection after assignment failure without saving or generating a question", async () => {
    const h = make();
    h.questions.set("bank", {...originalQuestion, questionId: "bank", difficulty: "medium", seedUsed: "Space exploration"});
    h.controls.assignFailure = new Error("Assignment unavailable");
    await assert.rejects(h.run(), /Assignment unavailable/);
    const state = h.documents.get(generationPath);
    assert.equal(state.reusedQuestionId, "bank"); assert.equal(state.draft, undefined);
    h.controls.assignFailure = null;
    const next = await h.run();
    assert.equal(next.essayQuestionId, "bank"); assert.equal(next.essayPracticeId, state.nextEssayPracticeId);
    assert.equal(h.count("listQuestions"), 1); assert.equal(h.count("save"), 0); assert.equal(h.count("generate"), 0);
  });

  test(layer + ": reselects when another assignment claims a question concurrently", async () => {
    const h = make();
    h.controls.seeds = ["first", "second"];
    for (const id of ["first", "second"]) h.questions.set(id, {...originalQuestion, questionId: id, difficulty: "medium", seedUsed: id});
    let collided = false;
    h.controls.beforeAssign = input => {
      if (!collided) {
        collided = true;
        h.assigned.set("competing", {...source, essayPracticeId: "competing", essayQuestionId: input.essayQuestionId});
      }
    };
    const next = await h.run();
    assert.notEqual(next.essayQuestionId, h.assigned.get("competing").essayQuestionId);
    assert.equal(h.count("assign"), 2); assert.equal(h.count("generate"), 0);
  });

  test(layer + ": skips a usage conflict even if its assignment is absent from the history scan", async () => {
    const h = make();
    h.questions.set("bank", {...originalQuestion, questionId: "bank", difficulty: "medium", seedUsed: "Space exploration"});
    h.controls.usedQuestionIds = new Set(["bank"]);
    const next = await h.run();
    assert.equal(next.essayQuestionId, "generated-question");
    assert.equal(h.count("assign"), 2); assert.equal(h.count("generate"), 1); assert.equal(h.count("save"), 1);
  });

  test(layer + ": rechecks a resumed selection against legacy student history", async () => {
    const h = make();
    h.controls.seeds = ["first", "second"];
    for (const id of ["first", "second"]) h.questions.set(id, {...originalQuestion, questionId: id, difficulty: "medium", seedUsed: id});
    h.controls.assignFailure = new Error("Assignment unavailable");
    await assert.rejects(h.run(), /Assignment unavailable/);
    const selected = h.documents.get(generationPath).reusedQuestionId;
    h.assigned.set("legacy", {...source, essayPracticeId: "legacy", essayQuestionId: selected});
    h.controls.assignFailure = null;
    assert.notEqual((await h.run()).essayQuestionId, selected); assert.equal(h.count("generate"), 0);
  });

  test(layer + ": checks all student history and pending assignments, across subjects, before generating and assigning", async () => {
    const h = make();
    for (let index = 0; index < 5; index++) {
      const id = "past" + index;
      h.questions.set(id, {...originalQuestion, questionId: id, seedUsed: index === 4 ? "Environment" : "Friendship"});
      h.completed.set(id, {...source, essayPracticeId: id, essayQuestionId: id, syllabusId: "other-subject", topicId: "other-topic"});
    }
    h.questions.set("pending", {...originalQuestion, seedUsed: "Kindness"});
    h.assigned.set("pending-attempt", {...source, essayPracticeId: "pending-attempt", essayQuestionId: "pending", syllabusId: "third-subject"});
    h.controls.seeds = [" FRIENDSHIP ", "  environment  ", "Kindness", "Space exploration"];
    const next = await h.run({...request, level: "secondary", standard: 6, language: "Spoofed", difficulty: "hard", seed: "Spoofed"});
    assert.equal(h.count("seed"), 1); assert.equal(h.count("defaultTheme"), 0); assert.equal(h.count("generate"), 1); assert.equal(h.count("assign"), 1);
    const generated = h.calls.find(c => c[0] === "generate");
    assert.deepEqual(generated.slice(1), [{level: "primary", standard: 3, language: "English", difficulty: "medium", seed: "Space exploration", save: false}, actor]);
    assert.deepEqual(h.calls.find(c => c[0] === "save")[2], actor);
    assert.equal(next.studentId, "student"); assert.equal(next.essayQuestionId, "generated-question");
    assert.equal(next.syllabusId, source.syllabusId); assert.equal(next.topicId, source.topicId);
    assert.equal(h.count("listCompleted"), 3);
    assert.equal(h.calls.filter(c => c[0].startsWith("list")).every(c => !c[1].syllabusId && !c[1].topicId && c[1].limit === 100), true);
    assert.equal(h.calls.filter(c => c[0] === "question" && c[1] === "original").length, 1);
    assert.deepEqual(h.documents.get(generationPath), {status: "completed", nextEssayPracticeId: next.essayPracticeId,
      essayQuestionId: next.essayQuestionId, updatedAt: new Date("2026-10-18T09:00:00Z")});
  });

  test(layer + ": full-pool comparison ignores Unicode case and whitespace before using the default", async () => {
    const h = make(); h.questions.get("original").seedUsed = "Helping   Others";
    h.controls.seeds = ["  ＨＥＬＰＩＮＧ others  "];
    await h.run();
    assert.equal(h.count("seed"), 1); assert.equal(h.count("defaultTheme"), 1);
    assert.equal(h.calls.find(c => c[0] === "generate")[1].seed, "latest news");
    assert.equal(h.count("generate"), 1); assert.equal(h.assigned.size, 1);
  });

  test(layer + ": uses the default API after all themes are used, regardless of pool size", async () => {
    const h = make(); h.questions.set("older", {...originalQuestion, seedUsed: "Environment"});
    h.completed.set("older", {...source, essayPracticeId: "older", essayQuestionId: "older"});
    h.controls.seeds = Array.from({length: 10}, (_, index) => index % 2 ? "Environment" : "Friendship");
    await h.run();
    assert.equal(h.count("seed"), 1); assert.equal(h.count("defaultTheme"), 1);
    assert.equal(h.calls.find(c => c[0] === "generate")[1].seed, "latest news");
  });

  test(layer + ": Food then Games cannot select a different stored Food question while an unused theme remains", async () => {
    const h = make(); h.questions.get("original").seedUsed = "food";
    h.questions.set("games", {...originalQuestion, questionId: "games", seedUsed: "Games"});
    h.completed.set("games", {...source, essayPracticeId: "games", essayQuestionId: "games"});
    h.questions.set("other-food", {...originalQuestion, questionId: "other-food", difficulty: "medium", seedUsed: " FOOD "});
    h.controls.seeds = ["Food", "Games", "Adventure"];
    const next = await h.run();
    assert.equal(next.essayQuestionId, "generated-question");
    assert.equal(h.calls.find(c => c[0] === "generate")[1].seed, "Adventure");
    assert.equal(h.count("defaultTheme"), 0);
  });

  test(layer + ": inspects beyond ten used themes before selecting the last unused theme", async () => {
    const h = make(); h.controls.seeds = ["Friendship"];
    for (let index = 0; index < 12; index++) {
      const id = "history" + index, theme = "Used theme " + index;
      h.controls.seeds.push(theme);
      h.questions.set(id, {...originalQuestion, questionId: id, seedUsed: theme});
      h.completed.set(id, {...source, essayPracticeId: id, essayQuestionId: id});
    }
    h.controls.seeds.push("Unused theme");
    await h.run();
    assert.equal(h.calls.find(c => c[0] === "generate")[1].seed, "Unused theme");
    assert.equal(h.count("seed"), 1); assert.equal(h.count("defaultTheme"), 0);
  });

  test(layer + ": an empty eligible theme pool uses the default API", async () => {
    const h = make(); h.controls.seeds = [];
    await h.run();
    assert.equal(h.count("defaultTheme"), 1);
    assert.equal(h.calls.find(c => c[0] === "generate")[1].seed, "latest news");
  });

  test(layer + ": exhausted themes generate a fresh default question even when that theme has appeared before", async () => {
    const h = make(); h.controls.seeds = ["Friendship"];
    h.questions.set("past-news", {...originalQuestion, questionId: "past-news", seedUsed: "latest news"});
    h.completed.set("past-news", {...source, essayPracticeId: "past-news", essayQuestionId: "past-news"});
    h.questions.set("bank-news", {...originalQuestion, questionId: "bank-news", difficulty: "medium", seedUsed: "latest news"});
    const next = await h.run();
    assert.equal(next.essayQuestionId, "generated-question");
    assert.equal(h.calls.find(c => c[0] === "generate")[1].seed, "latest news");
    assert.equal(h.count("defaultTheme"), 1);
  });

  test(layer + ": stored bank themes outside the eligible level-grade pool are not reused", async () => {
    const h = make(); h.controls.seeds = ["Eligible theme"];
    h.questions.set("unconfigured", {...originalQuestion, questionId: "unconfigured", difficulty: "medium", seedUsed: "Unconfigured"});
    await h.run();
    assert.equal(h.calls.find(c => c[0] === "generate")[1].seed, "Eligible theme");
    assert.equal(h.count("defaultTheme"), 0);
  });

  test(layer + ": a saved bank selection is cleared when its theme has since been attempted under another question ID", async () => {
    const h = make(); h.controls.seeds = ["Space exploration", "Adventure"];
    h.questions.set("bank", {...originalQuestion, questionId: "bank", difficulty: "medium", seedUsed: "Space exploration"});
    h.controls.assignFailure = new Error("Assignment unavailable");
    await assert.rejects(h.run(), /Assignment unavailable/);
    h.questions.set("same-theme", {...originalQuestion, questionId: "same-theme", seedUsed: "Space exploration"});
    h.completed.set("same-theme", {...source, essayPracticeId: "same-theme", essayQuestionId: "same-theme"});
    h.controls.assignFailure = null;
    assert.equal((await h.run()).essayQuestionId, "generated-question");
    assert.equal(h.calls.find(c => c[0] === "generate")[1].seed, "Adventure");
    assert.equal(h.count("defaultTheme"), 0);
  });

  test(layer + ": a saved draft from a now-used theme is replaced instead of resuming the repeated theme", async () => {
    const h = make(); h.controls.seeds = ["Space exploration", "Adventure"];
    h.controls.saveFailure = new Error("Save unavailable");
    await assert.rejects(h.run(), /Save unavailable/);
    h.questions.set("same-theme", {...originalQuestion, questionId: "same-theme", seedUsed: "Space exploration"});
    h.assigned.set("same-theme", {...source, essayPracticeId: "same-theme", essayQuestionId: "same-theme"});
    h.controls.saveFailure = null;
    await h.run();
    const generated = h.calls.filter(c => c[0] === "generate");
    assert.deepEqual(generated.map(c => c[1].seed), ["Space exploration", "Adventure"]);
  });

  test(layer + ": a different student's essays do not exclude a theme", async () => {
    const h = make(); h.completed.set("other-student", {...source, studentId: "another", essayPracticeId: "other-student", essayQuestionId: "missing-other-question"});
    await h.run(); assert.equal(h.count("seed"), 1);
    assert.equal(h.calls.some(c => c[0] === "question" && c[1] === "missing-other-question"), false);
  });

  test(layer + ": resumes the saved draft after a question-save failure without selecting or generating again", async () => {
    const h = make(); h.controls.saveFailure = new Error("Question write unavailable");
    await assert.rejects(h.run(), /Question write unavailable/);
    const state = h.documents.get(generationPath);
    assert.equal(state.status, "failed"); assert.equal(state.draft.questionId, "generated-question");
    assert.equal(h.assigned.size, 0);
    h.controls.saveFailure = null;
    const next = await h.run();
    assert.equal(h.count("generate"), 1); assert.equal(h.count("seed"), 2);
    assert.equal(next.essayPracticeId, state.nextEssayPracticeId);
    assert.equal(h.documents.get(generationPath).draft, undefined);
  });

  test(layer + ": resumes assignment failures with the same question and reserved practice ID", async () => {
    const h = make(); h.controls.assignFailure = new Error("Assignment unavailable");
    await assert.rejects(h.run(), /Assignment unavailable/);
    const reserved = h.documents.get(generationPath).nextEssayPracticeId;
    h.controls.assignFailure = null;
    const next = await h.run();
    assert.equal(h.count("generate"), 1); assert.equal(h.assigned.size, 1);
    assert.equal(next.essayPracticeId, reserved);
    assert.equal(h.questions.size, 2);
  });

  test(layer + ": a lost assignment response is recovered from the existing assignment", async () => {
    const h = make(); h.controls.assignResponseFailure = new Error("Response lost");
    const next = await h.run();
    assert.equal(h.assigned.get(next.essayPracticeId), next);
    assert.equal(h.documents.get(generationPath).status, "completed");
    await h.run(); assert.equal(h.count("generate"), 1); assert.equal(h.count("assign"), 1);
  });

  test(layer + ": a failed final status save resumes from the assignment without further question writes", async () => {
    const h = make(), finish = h.repository.finish.bind(h.repository);
    let fail = true;
    h.repository.finish = (...args) => {if (fail) throw new Error("Status write failed"); return finish(...args);};
    await assert.rejects(h.run(), /Status write failed/);
    fail = false; await h.run();
    assert.equal(h.count("generate"), 1); assert.equal(h.count("save"), 1); assert.equal(h.count("assign"), 1);
    assert.equal(h.documents.get(generationPath).status, "completed");
  });

  test(layer + ": retries after the next essay was completed return it without resurrecting its assignment", async () => {
    const h = make(), first = await h.run();
    h.assigned.delete(first.essayPracticeId);
    const completedNext = {...first, essayText: "My next essay.", completedAt: new Date()};
    h.completed.set(first.essayPracticeId, completedNext);
    assert.equal(await h.run(), completedNext);
    assert.equal(h.assigned.size, 0); assert.equal(h.count("generate"), 1); assert.equal(h.count("assign"), 1);
  });

  test(layer + ": concurrent calls for the same source create one question and one next assignment", async () => {
    const h = make(), results = await Promise.allSettled([h.run(), h.run()]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(results.find(r => r.status === "rejected").reason.code, "essay-generation-in-progress");
    assert.equal(h.count("generate"), 1); assert.equal(h.assigned.size, 1);
  });

  test(layer + ": an expired lease can be reclaimed and the old worker cannot change the new state", async () => {
    const h = make(), old = await h.repository.claim(request);
    h.advance(webConfig.GENERATION_LEASE_MILLISECONDS + 1);
    const current = await h.repository.claim(request);
    assert.equal(current.nextEssayPracticeId, old.nextEssayPracticeId); assert.notEqual(current.leaseToken, old.leaseToken);
    await assert.rejects(() => h.repository.fail(request, old.leaseToken), error => error.code === "essay-generation-lease-lost");
    assert.equal(h.documents.get(generationPath).leaseToken, current.leaseToken);
  });

  test(layer + ": model failures leave no question or assignment and allow a later retry", async () => {
    const h = make(); h.controls.generateFailure = new Error("AI unavailable");
    await assert.rejects(h.run(), /AI unavailable/);
    assert.equal(h.documents.get(generationPath).status, "failed");
    assert.equal(h.questions.size, 1); assert.equal(h.assigned.size, 0);
    h.controls.generateFailure = null; await h.run(); assert.equal(h.assigned.size, 1);
  });

  test(layer + ": seed read failures and missing history questions fail without silently using the default", async () => {
    const h = make(); h.controls.seeds = [new Error("No question seed entries are available")];
    await assert.rejects(h.run(), /No question seed entries/); assert.equal(h.count("generate"), 0); assert.equal(h.count("defaultTheme"), 0);
    const broken = make(); broken.completed.set("missing", {...source, essayPracticeId: "missing", essayQuestionId: "missing"});
    await assert.rejects(broken.run(), /history could not be found/); assert.equal(broken.count("seed"), 0);
  });

  test(layer + ": missing source and invalid input fail before generation or assignment", async () => {
    const h = make();
    for (const input of [null, [], {}, {...request, studentId: "a/b"}, {...request, completedEssayPracticeId: ".."}]) {
      await assert.rejects(() => h.run(input));
    }
    assert.deepEqual(h.calls, []); assert.equal(h.documents.size, 1); // Only the source submission exists.
    await assert.rejects(() => h.run(request, {}), /updatedBy/);
    assert.equal(h.count("getCompleted"), 0);
    h.completed.clear(); await assert.rejects(h.run(), /completed essay practice could not be found/);
    assert.equal(h.documents.size, 1);
  });

  test(layer + ": source question criteria and generated draft are validated before persistence", async () => {
    const h = make(); h.questions.get("original").standard = 7;
    await assert.rejects(h.run(), /invalid level, grade or language/); assert.equal(h.count("seed"), 0);
    for (const changes of [{questionId: undefined}, {difficulty: "hard"}, {seedUsed: "Wrong theme"}, {wordCountRequirement: {minWords: -1}}]) {
      const bad = make(); bad.controls.generatedChanges = changes;
      await assert.rejects(bad.run()); assert.equal(bad.count("save"), 0); assert.equal(bad.assigned.size, 0);
    }
  });

  test(layer + ": account changes after seed selection stop model calls and assignment", async () => {
    const h = make(); h.controls.afterSeed = h.changeAccount;
    await assert.rejects(h.run(), /account changed/);
    assert.equal(h.count("generate"), 0); assert.equal(h.count("assign"), 0);
  });

  test(layer + ": completed generation with a missing next practice never generates a replacement", async () => {
    const h = make(), first = await h.run(); h.assigned.delete(first.essayPracticeId);
    await assert.rejects(h.run(), /previously generated essay assignment could not be found/);
    assert.equal(h.count("generate"), 1); assert.equal(h.count("assign"), 1);
    assert.equal(h.documents.get(generationPath).status, "completed");
  });
}
