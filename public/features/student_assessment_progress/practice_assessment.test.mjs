import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {FirestoreStudentAssessmentProgressRepository as WebRepository} from "./infrastructure/firestore_student_assessment_progress_repository.js";
import {AssessPreAssessmentPractice as WebPreAssessment} from "./application/assess_pre_assessment_practice.js";
import {AssessNormalAssessmentPractice as WebNormalAssessment} from "./application/assess_normal_assessment_practice.js";
import {CalculatePreAssessmentLevel as WebPreCalculation} from "../assessment_framework/application/calculate_pre_assessment_level.js";
import {CalculateAssessmentProgression as WebNormalCalculation} from "../assessment_framework/application/calculate_assessment_progression.js";
import * as webFeature from "./student_assessment_progress_module.js";
import {studentAssessmentProgressSchema as webSchema} from "../../config/firebase/student_assessment_progress_schema.js";

const require = createRequire(import.meta.url);
const {FirestoreStudentAssessmentProgressRepository: BackendRepository} = require("../../../functions/features/student_assessment_progress/infrastructure/firestore_student_assessment_progress_repository");
const {AssessPreAssessmentPractice: BackendPreAssessment} = require("../../../functions/features/student_assessment_progress/application/assess_pre_assessment_practice");
const {AssessNormalAssessmentPractice: BackendNormalAssessment} = require("../../../functions/features/student_assessment_progress/application/assess_normal_assessment_practice");
const {CalculatePreAssessmentLevel: BackendPreCalculation} = require("../../../functions/features/assessment_framework/application/calculate_pre_assessment_level");
const {CalculateAssessmentProgression: BackendNormalCalculation} = require("../../../functions/features/assessment_framework/application/calculate_assessment_progression");
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
  const operations = {
    getDocumentRef: (path, id) => ({path: path + "/" + id}),
    readDocument: async (path, id) => {
      if (readError) throw readError;
      return documents.get(path + "/" + id) ?? null;
    },
    getFirestoreDb: () => ({async runTransaction(callback) {
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
