import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {FirestoreStudentAssessmentProgressRepository as WebRepository} from "./infrastructure/firestore_student_assessment_progress_repository.js";
import {AssessPreAssessmentPractice as WebPreAssessment} from "./application/assess_pre_assessment_practice.js";
import {AssessNormalAssessmentPractice as WebNormalAssessment} from "./application/assess_normal_assessment_practice.js";
import {CalculatePreAssessmentLevel as WebPreCalculation} from "../assessment_framework/application/calculate_pre_assessment_level.js";
import {CalculateAssessmentProgression as WebNormalCalculation} from "../assessment_framework/application/calculate_assessment_progression.js";
import {AssessStudentEssayPractice as WebEssayAssessment} from "./application/assess_student_essay_practice.js";
import * as webFeature from "./student_assessment_progress_module.js";
import {studentAssessmentProgressSchema as webSchema} from "../../config/firebase/student_assessment_progress_schema.js";

const require = createRequire(import.meta.url);
const {FirestoreStudentAssessmentProgressRepository: BackendRepository} = require("../../../functions/features/student_assessment_progress/infrastructure/firestore_student_assessment_progress_repository");
const {AssessPreAssessmentPractice: BackendPreAssessment} = require("../../../functions/features/student_assessment_progress/application/assess_pre_assessment_practice");
const {AssessNormalAssessmentPractice: BackendNormalAssessment} = require("../../../functions/features/student_assessment_progress/application/assess_normal_assessment_practice");
const {CalculatePreAssessmentLevel: BackendPreCalculation} = require("../../../functions/features/assessment_framework/application/calculate_pre_assessment_level");
const {CalculateAssessmentProgression: BackendNormalCalculation} = require("../../../functions/features/assessment_framework/application/calculate_assessment_progression");
const {AssessStudentEssayPractice: BackendEssayAssessment} = require("../../../functions/features/student_assessment_progress/application/assess_student_essay_practice");
const scope = {studentId: "student-1", practiceId: "pre-1"};
const assessmentPath = "studentAssessmentProgress/student-1/practiceAssessments/pre-1";
const topicPath = "studentAssessmentProgress/student-1/syllabuses/math/topics/fractions";
const completedAt = new Date("2026-10-10T01:00:00Z");

function framework(target = "advanced") {
  return {id: "framework-1", endLevelName: "Ready",
    levels: ["foundation", "bridge", "advanced"].map((id, index) => ({
      id, levelName: id, sequenceOrder: index + 1,
      criteria: {requiredPracticeCount: 1, minimumScore: 75, questionsPerPractice: 10, difficultyLevel: "Easy"},
    })),
    preAssessment: {scoreLevelSplit: Object.fromEntries(
      require("../../../functions/schema/assessment_framework_schema").assessmentFrameworkPreAssessmentScoreBands.map(band => [band.field, target])),
    },
  };
}

function fixture(Repository, web) {
  const documents = new Map(), versions = new Map(), writes = [];
  let commitError = null, readError = null;
  function collection(path) {
    return {doc: id => ({path: path + "/" + id, collection: name => collection(path + "/" + id + "/" + name)}),
      where: (field, operator, value) => ({async get() {
        assert.equal(operator, "==");
        return {docs: [...documents.entries()].filter(([key, data]) => key.startsWith(path + "/")
          && key.split("/").length === path.split("/").length + 1 && data[field] === value)
          .map(([key, data]) => ({id: key.split("/").at(-1), data: () => data}))};
      }})};
  }
  const operations = {
    getDocumentRef: (path, id) => ({path: path + "/" + id}),
    readDocument: async (path, id) => {
      if (readError) throw readError;
      return documents.get(path + "/" + id) ?? null;
    },
    getFirestoreDb: () => ({collection: path => collection(path), async runTransaction(callback) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const pending = [], readVersions = new Map();
        const result = await callback({
          async get({path}) {
            assert.equal(pending.length, 0);
            if (readError) throw readError;
            readVersions.set(path, versions.get(path) || 0);
            return {exists: documents.has(path), data: () => documents.get(path)};
          },
          set(ref, data, options) {pending.push({path: ref.path, data, options});},
        });
        if ([...readVersions].some(([path, version]) => (versions.get(path) || 0) !== version)) continue;
        if (commitError) throw commitError;
        for (const write of pending) {
          documents.set(write.path, write.options?.merge ? {...documents.get(write.path), ...write.data} : write.data);
          versions.set(write.path, (versions.get(write.path) || 0) + 1);
          writes.push(write);
        }
        return result;
      }
      throw new Error("Too many retries");
    }}),
  };
  const repository = new Repository(web ? Object.fromEntries(Object.entries(operations).map(([key, value]) => [key + "Operation", value])) : operations);
  return {repository, documents, writes, setCommitError: error => {commitError = error;}, setReadError: error => {readError = error;}};
}

function input(type = "pre assessment", practiceId = scope.practiceId) {
  return {studentId: scope.studentId,
    practice: {id: practiceId, type, questions: [{syllabusId: "math", topicId: "fractions", questionId: "q1"}]},
    practiceResult: {practiceId, studentId: scope.studentId, score: 95, submittedAt: completedAt},
  };
}
function dependencies(f) {
  return {studentAssessmentProgressRepository: f.repository,
    getSyllabusById: async () => ({id: "math", assessmentFrameworkId: "framework-1", topics: [{id: "fractions"}]}),
  };
}

test("practice assessment read API is exported in both layers without a Firebase callable", () => {
  const backendFeature = require("../../../functions/features/student_assessment_progress/student_assessment_progress_module");
  assert.equal(typeof backendFeature.getStudentPracticeAssessment, "function");
  assert.equal(typeof webFeature.getStudentPracticeAssessment, "function");
  assert.equal(typeof webFeature.assessStudentEssayPractice, "function");
  assert.equal(typeof backendFeature.assessStudentEssayPractice, "function");
  assert.equal(Object.hasOwn(require("../../../functions/index"), "assessStudentEssayPractice"), false);
  assert.equal(Object.hasOwn(require("../../../functions/index"), "getStudentPracticeAssessment"), false);
  assert.deepEqual(webSchema, require("../../../functions/schema/student_assessment_progress_schema").studentAssessmentProgressSchema);
});

for (const [layer, Repository, PreAssessment, NormalAssessment, PreCalculation, NormalCalculation, web] of [
  ["backend", BackendRepository, BackendPreAssessment, BackendNormalAssessment, BackendPreCalculation, BackendNormalCalculation, false],
  ["web", WebRepository, WebPreAssessment, WebNormalAssessment, WebPreCalculation, WebNormalCalculation, true],
]) {
  test(layer + ": high pre-assessment captures both newly reached dynamic levels and commits with progress", async () => {
    const f = fixture(Repository, web);
    const calculate = new PreCalculation({getById: async () => framework()});
    const useCase = new PreAssessment({...dependencies(f), calculatePreAssessmentLevel: value => calculate.execute(value)});
    const result = await useCase.execute(input());
    assert.deepEqual(result.reachedLevelIds, ["bridge", "advanced"]);
    assert.equal(result.previousLevelId, null);
    assert.equal(result.progress.currentLevelId, "advanced");
    assert.equal(f.documents.get(topicPath).currentLevelId, "advanced");
    assert.equal(f.writes.length, 4);
    const saved = await f.repository.getPracticeAssessment(scope);
    assert.deepEqual(saved.reachedLevelIds, ["bridge", "advanced"]);
    assert.ok(Object.isFrozen(saved));
    assert.ok(Object.isFrozen(saved.reachedLevelIds));
    assert.deepEqual(saved.assessedAt, completedAt);
    assert.equal(Object.hasOwn(f.documents.get(assessmentPath), "studentId"), false);
  });

  test(layer + ": first-level placement has no level-up and end placement captures all levels above baseline", async () => {
    for (const [target, reached] of [["foundation", []], ["endLevel", ["bridge", "advanced", "endLevel"]]]) {
      const f = fixture(Repository, web);
      const calculate = new PreCalculation({getById: async () => framework(target)});
      const result = await new PreAssessment({...dependencies(f), calculatePreAssessmentLevel: value => calculate.execute(value)}).execute(input());
      assert.deepEqual(result.reachedLevelIds, reached);
      assert.equal(result.isFrameworkCompleted, target === "endLevel");
    }
  });

  test(layer + ": retry replays the original jump without recalculating after framework or progress changes", async () => {
    const f = fixture(Repository, web);
    const calculate = new PreCalculation({getById: async () => framework()});
    const useCase = new PreAssessment({...dependencies(f), calculatePreAssessmentLevel: value => calculate.execute(value)});
    const original = await useCase.execute(input());
    useCase.getSyllabusById = async () => {throw new Error("must not consult a changed syllabus");};
    useCase.calculatePreAssessmentLevel = async () => {throw new Error("must not recalculate a saved practice");};
    f.documents.set(topicPath, {...f.documents.get(topicPath), currentLevelId: "endLevel", isFrameworkCompleted: true});
    const before = f.writes.length;
    const retry = await useCase.execute(input());
    assert.deepEqual(retry.reachedLevelIds, original.reachedLevelIds);
    assert.equal(retry.levelChanged, true);
    assert.equal(retry.levelId, "advanced");
    assert.equal(retry.progress.currentLevelId, "endLevel");
    assert.equal(f.writes.length, before);
  });

  test(layer + ": concurrent deliveries commit only one assessment and preserve its first result", async () => {
    const f = fixture(Repository, web);
    const calculate = new PreCalculation({getById: async () => framework()});
    const useCase = new PreAssessment({...dependencies(f), calculatePreAssessmentLevel: value => calculate.execute(value)});
    const results = await Promise.all(Array.from({length: 6}, () => useCase.execute(input())));
    assert.ok(results.every(result => result.levelId === "advanced"));
    assert.equal(f.writes.length, 4);
  });

  test(layer + ": normal assessment captures a single transition and repeats without progressing twice", async () => {
    const f = fixture(Repository, web);
    const calculate = new NormalCalculation({getById: async () => framework()});
    const useCase = new NormalAssessment({...dependencies(f),
      getAssessmentLevelCriteria: async () => ({criteria: framework().levels[0].criteria}),
      calculateAssessmentProgression: value => calculate.execute(value),
      listCompletedPracticeIds: async () => [],
      getPracticeById: async () => null, getPracticeResult: async () => null,
      getQuestionDifficulty: async () => "Easy", assessmentPracticeType: "assessment",
    });
    const value = input("assessment");
    const result = await useCase.execute(value);
    assert.equal(result.previousLevelId, "foundation");
    assert.equal(result.levelId, "bridge");
    assert.deepEqual(result.reachedLevelIds, ["bridge"]);
    const before = f.writes.length;
    const retry = await useCase.execute(value);
    assert.deepEqual(retry.reachedLevelIds, ["bridge"]);
    assert.equal(f.writes.length, before);
  });

  test(layer + ": failed commit cannot save a level change without its assessment record", async () => {
    const f = fixture(Repository, web); f.setCommitError(new Error("Commit failed"));
    const calculate = new PreCalculation({getById: async () => framework()});
    const useCase = new PreAssessment({...dependencies(f), calculatePreAssessmentLevel: value => calculate.execute(value)});
    await assert.rejects(() => useCase.execute(input()), /Commit failed/);
    assert.equal(f.documents.has(topicPath), false);
    assert.equal(f.documents.has(assessmentPath), false);
    assert.deepEqual(f.writes, []);
    f.setCommitError(null);
    assert.deepEqual((await useCase.execute(input())).reachedLevelIds, ["bridge", "advanced"]);
  });

  test(layer + ": missing records return null; malformed records and invalid scope fail", async () => {
    const f = fixture(Repository, web);
    assert.equal(await f.repository.getPracticeAssessment(scope), null);
    for (const value of [undefined, {}, {...scope, practiceId: "bad/id"}]) await assert.rejects(() => f.repository.getPracticeAssessment(value));
    f.documents.set(assessmentPath, {reachedLevelIds: ["bridge"]});
    await assert.rejects(() => f.repository.getPracticeAssessment(scope));
    const error = new Error("Read failed"); f.setReadError(error);
    await assert.rejects(() => f.repository.getPracticeAssessment(scope), actual => actual === error);
  });
}

for (const [layer, Repository, PreAssessment, NormalAssessment, PreCalculation, NormalCalculation, web] of [
 ["backend", BackendRepository, BackendPreAssessment, BackendNormalAssessment, BackendPreCalculation, BackendNormalCalculation, false],
 ["web", WebRepository, WebPreAssessment, WebNormalAssessment, WebPreCalculation, WebNormalCalculation, true],
]) {
 for (const pre of [true, false]) test(layer + ": " + (pre ? "initial level" : "ongoing progression") + " uses the topic/language framework override", async () => {
  const f = fixture(Repository, web), configured = {...framework("foundation"), id: "topic-framework"};
  const calculator = new (pre ? PreCalculation : NormalCalculation)({getById: async id => {assert.equal(id, "topic-framework"); return configured;}});
  const dependenciesForOverride = {...dependencies(f),
   getSyllabusById: async () => ({id: "math", languages: ["English"], assessmentFrameworkId: "parent-framework", topics: [{id: "fractions", assessmentFrameworkIds: {english: "topic-framework"}}]}),
   getStudentSyllabusSubscriptionLanguage: async (studentId, syllabusId) => {assert.equal(studentId, "student-1"); assert.equal(syllabusId, "math"); return "English";},
   calculatePreAssessmentLevel: value => calculator.execute(value), calculateAssessmentProgression: value => calculator.execute(value),
   getAssessmentLevelCriteria: async () => ({criteria: configured.levels[0].criteria}),
   listCompletedPracticeIds: async () => [], getPracticeById: async () => null, getPracticeResult: async () => null,
   getQuestionDifficulty: async () => "Easy", assessmentPracticeType: "assessment",
  };
  const result = await new (pre ? PreAssessment : NormalAssessment)(dependenciesForOverride).execute(input(pre ? "pre assessment" : "assessment"));
  assert.equal(result.assessmentFrameworkId, "topic-framework");
  assert.equal(result.levelId, pre ? "foundation" : "bridge");
 });
}

for (const [layer, Repository, EssayAssessment, Calculation, web] of [
  ["backend", BackendRepository, BackendEssayAssessment, BackendNormalCalculation, false],
  ["web", WebRepository, WebEssayAssessment, WebNormalCalculation, true],
]) {
  function essayHarness({required = 2, frameworkType = "essay"} = {}) {
    const f = fixture(Repository, web), essays = new Map(), results = new Map();
    const configured = {...framework(), frameworkType};
    configured.levels.forEach(level => {level.criteria.requiredPracticeCount = required; level.criteria.difficultyLevel = "Medium";});
    const calculator = new Calculation({getById: async () => configured});
    const deps = {...dependencies(f), getCompletedEssayPractice: async input => essays.get(input.essayPracticeId) ?? null,
      getEssayQuestionById: async () => ({language: "English", difficulty: "medium"}),
      getEssayResult: async ({questionId}) => results.get(questionId) ?? null,
      getSyllabusById: async () => ({id: "math", languages: ["English"], assessmentFrameworkId: "wrong-parent",
        topics: [{id: "fractions", assessmentFrameworkIds: {english: "framework-1"}}]}),
      getAssessmentLevelCriteria: async ({assessmentFrameworkId, levelId}) => {
        assert.equal(assessmentFrameworkId, "framework-1");
        return {frameworkType, criteria: configured.levels.find(level => level.id === levelId).criteria};
      },
      calculateAssessmentProgression: value => {assert.equal(value.assessmentFrameworkId, "framework-1"); return calculator.execute(value);},
    };
    const assessor = new EssayAssessment(deps);
    return {...f, essays, results, configured, deps, assessor,
      add(id, score = 80, date = completedAt) {
        const essay = {studentId: scope.studentId, essayPracticeId: id, essayQuestionId: "question-" + id,
          syllabusId: "math", topicId: "fractions", essayText: "Essay " + id, completedAt: date};
        essays.set(id, essay); results.set(essay.essayQuestionId, {answer: essay.essayText, score});
        f.documents.set("studentEssayPractices/student-1/completedEssayPractices/" + id, essay);
      },
      run: (id, context) => assessor.execute({studentId: scope.studentId, essayPracticeId: id}, context),
    };
  }

  test(layer + ": essays start at first level without pre-assessment and use the topic/language framework", async () => {
    const h = essayHarness(); h.add("first", 100);
    const first = await h.run("first");
    assert.equal(first.levelId, "foundation"); assert.equal(first.levelChanged, false);
    assert.equal(first.qualifyingPracticeCount, 1); assert.equal(first.requiredPracticeCount, 2);
    assert.deepEqual(first.reachedLevelIds, []); assert.equal(first.practiceType, "essay");
    h.add("second", 75);
    const second = await h.run("second");
    assert.equal(second.levelId, "bridge"); assert.deepEqual(second.reachedLevelIds, ["bridge"]);
    assert.equal(h.documents.get(topicPath).assessmentRevision, 2);
    const before = h.writes.length;
    assert.deepEqual((await h.run("second")).reachedLevelIds, ["bridge"]);
    assert.equal(h.writes.length, before);
  });

  test(layer + ": only qualifying scores advance; each essay counts at a single level even with equal timestamps", async () => {
    const h = essayHarness();
    for (const [id, score] of [["low", 74], ["a", 80], ["b", 90], ["c", 100], ["d", 100]]) {h.add(id, score); await h.run(id);}
    assert.equal(h.documents.get(topicPath).currentLevelId, "advanced");
    const records = [...h.documents.entries()].filter(([key]) => key.includes("/practiceAssessments/"));
    assert.equal(records.filter(([, value]) => value.previousLevelId === "foundation").length, 3);
    assert.equal(records.filter(([, value]) => value.previousLevelId === "bridge").length, 2);
  });

  test(layer + ": simultaneous essays recalculate after topic revisions and cannot lose a qualifying completion", async () => {
    const h = essayHarness();
    for (const id of ["a", "b", "c", "d"]) h.add(id);
    await Promise.all(["a", "b", "c", "d"].map(id => h.run(id)));
    assert.equal(h.documents.get(topicPath).currentLevelId, "advanced");
    assert.equal(h.documents.get(topicPath).assessmentRevision, 4);
    assert.equal([...h.documents.keys()].filter(key => key.includes("/practiceAssessments/")).length, 4);
    const before = h.writes.length;
    await Promise.all(["a", "b", "c", "d"].map(id => h.run(id)));
    assert.equal(h.writes.length, before);
  });

  test(layer + ": concurrent redeliveries save one transition and replay it after framework changes", async () => {
    const h = essayHarness({required: 1}); h.add("a", 100);
    const outcomes = await Promise.all(Array.from({length: 6}, () => h.run("a")));
    assert.ok(outcomes.every(outcome => outcome.levelId === "bridge"));
    assert.equal(h.documents.get(topicPath).assessmentRevision, 1);
    assert.equal(h.writes.length, 4);
    h.assessor.getSyllabusById = async () => {throw new Error("Must replay original assessment");};
    assert.deepEqual((await h.run("a")).reachedLevelIds, ["bridge"]);
  });

  test(layer + ": completion level is terminal and old essays never cause extra progression", async () => {
    const h = essayHarness({required: 1});
    for (const id of ["a", "b", "c"]) {h.add(id); await h.run(id);}
    assert.equal(h.documents.get(topicPath).isFrameworkCompleted, true);
    const before = h.writes.length;
    h.add("d"); const outcome = await h.run("d");
    assert.equal(outcome.assessed, false); assert.equal(outcome.reason, "framework-already-completed");
    assert.equal(h.writes.length, before);
  });

  test(layer + ": missing and normal frameworks skip essay progression without affecting the completion", async () => {
    const h = essayHarness({frameworkType: "normal"}); h.add("a");
    assert.equal((await h.run("a")).reason, "essay-assessment-framework-required");
    h.assessor.getSyllabusById = async () => ({topics: [{id: "fractions"}]});
    assert.equal((await h.run("a")).reason, "assessment-framework-not-configured");
    assert.equal(h.writes.length, 0);
  });

  test(layer + ": a missing grade, changed answer or deleted completion cannot advance a level", async () => {
    const h = essayHarness(); h.add("a");
    h.results.delete("question-a"); await assert.rejects(h.run("a"), /graded essay result/);
    h.results.set("question-a", {answer: "Changed answer", score: 100});
    await assert.rejects(h.run("a"), /graded essay result/);
    h.results.set("question-a", {answer: "Essay a", score: 100});
    h.documents.delete("studentEssayPractices/student-1/completedEssayPractices/a");
    await assert.rejects(h.run("a"), {code: "topic-practice-reset"});
    assert.equal(h.writes.length, 0);
  });

  test(layer + ": another topic, framework or normal assessment cannot contribute to essay level counts", async () => {
    const h = essayHarness({required: 3}); h.add("a"); await h.run("a");
    const original = h.documents.get("studentAssessmentProgress/student-1/practiceAssessments/a");
    for (const [id, changes] of [["other-topic", {topicId: "another"}], ["other-framework", {assessmentFrameworkId: "another"}], ["normal", {practiceType: "assessment"}]]) {
      h.documents.set("studentAssessmentProgress/student-1/practiceAssessments/" + id, {...original, ...changes});
    }
    h.add("b"); const outcome = await h.run("b");
    assert.equal(outcome.levelChanged, false); assert.equal(outcome.qualifyingPracticeCount, 2);
  });

  test(layer + ": account changes during grade lookup stop progress writes", async () => {
    const h = essayHarness(); h.add("a"); let valid = true;
    const read = h.assessor.getEssayResult;
    h.assessor.getEssayResult = async input => {const result = await read(input); valid = false; return result;};
    await assert.rejects(h.run("a", {assertAccess: () => {if (!valid) throw new Error("Account changed");}}), /Account changed/);
    assert.equal(h.writes.length, 0);
  });

  test(layer + ": failed atomic saves leave no assessment or progression and recover on retry", async () => {
    const h = essayHarness({required: 1}); h.add("a");
    h.setCommitError(new Error("Commit failed"));
    await assert.rejects(h.run("a"), /Commit failed/);
    assert.equal(h.documents.has(topicPath), false); assert.equal(h.writes.length, 0);
    h.setCommitError(null);
    assert.equal((await h.run("a")).levelId, "bridge");
  });
}
