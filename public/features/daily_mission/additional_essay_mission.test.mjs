import assert from "node:assert/strict";
import {test} from "node:test";
import {createRequire} from "node:module";
import {ListAdditionalMissions as WebList} from "./application/list_additional_missions.js";
import {ListAdditionalMissionPracticeIds as WebLegacyList} from "./application/list_additional_mission_practice_ids.js";
import {AcceptAdditionalDailyMission as WebAccept} from "./application/accept_additional_daily_mission.js";
import {GetAdditionalMissionAvailability as WebAvailability} from "./application/get_additional_mission_availability.js";
import {FirestoreDailyMissionRepository as WebRepository} from "./infrastructure/firestore_daily_mission_repository.js";
import {AwardAdditionalMissionCompletion as WebReward} from "../reward/application/award_additional_mission_completion.js";
import {AwardDailyMissionCompletion as WebDailyReward} from "../reward/application/award_daily_mission_completion.js";
import * as webApi from "./daily_mission_module.js";

const require = createRequire(import.meta.url);
const {ListAdditionalMissions: BackendList} = require("../../../functions/features/daily_mission/application/list_additional_missions");
const {ListAdditionalMissionPracticeIds: BackendLegacyList} = require("../../../functions/features/daily_mission/application/list_additional_mission_practice_ids");
const {AcceptAdditionalDailyMission: BackendAccept} = require("../../../functions/features/daily_mission/application/accept_additional_daily_mission");
const {GetAdditionalMissionAvailability: BackendAvailability} = require("../../../functions/features/daily_mission/application/get_additional_mission_availability");
const {FirestoreDailyMissionRepository: BackendRepository} = require("../../../functions/features/daily_mission/infrastructure/firestore_daily_mission_repository");
const {AwardAdditionalMissionCompletion: BackendReward} = require("../../../functions/features/reward/application/award_additional_mission_completion");
const {AwardDailyMissionCompletion: BackendDailyReward} = require("../../../functions/features/reward/application/award_daily_mission_completion");
const {requireMatchingAward} = require("../../../functions/features/reward/domain/student_reward");
const {fakeFirestore} = require("../../../functions/features/student_topic_practice_reset/test_support");
const scope = {studentId: "student", syllabusId: "language"}, date = "2026-10-18";
const writing = {...scope, topicId: "writing"};
const subject = `studentDailyMissions/student/days/${date}/syllabuses/language`;
const essayAssignment = "studentEssayPractices/student/assignedEssayPractices/next";
const essayCompletion = "studentEssayPractices/student/completedEssayPractices/core";
const essayLookup = "studentDailyMissions/student/acceptedAdditionalMissionEssays/next";

test("typed mission and availability APIs are exposed by both feature layers without new Firebase callables", () => {
  const backendApi = require("../../../functions/features/daily_mission/daily_mission_module");
  const endpoints = require("../../../functions/index");
  for (const name of ["listAdditionalMissions", "getAdditionalMissionAvailability"]) {
    assert.equal(typeof backendApi[name], "function"); assert.equal(typeof webApi[name], "function");
    assert.equal(Object.hasOwn(endpoints, name), false);
  }
});

for (const [layer, List, LegacyList, Accept, Availability, Repository, Reward, DailyReward] of [
  ["backend", BackendList, BackendLegacyList, BackendAccept, BackendAvailability, BackendRepository, BackendReward, BackendDailyReward],
  ["web", WebList, WebLegacyList, WebAccept, WebAvailability, WebRepository, WebReward, WebDailyReward],
]) {
  function harness() {
    const store = fakeFirestore({
      [subject]: {coreMission: {topicId: "writing", practiceId: "core", practiceType: "essay"}},
      [essayCompletion]: {...writing, essayQuestionId: "q-core", essayText: "First essay", completedAt: new Date("2026-10-18T08:00:00Z")},
      [essayAssignment]: {...writing, essayQuestionId: "q-next"},
      "studentPractices/student/assignedPractices/next": {},
    });
    const readDocument = async (collection, id) => store.documents.get(collection + "/" + id) ?? null;
    const readCollection = async collection => (await store.db.collection(collection).get()).docs.map(doc => ({...doc.data(), id: doc.id}));
    const readCollectionIds = async collection => (await readCollection(collection)).map(doc => doc.id);
    const getDocumentRef = (collection, id) => store.db.doc(collection + "/" + id);
    const dependencies = {getFirestoreDb: () => store.db, getFirestoreDbOperation: () => store.db,
      getDocumentRef, getDocumentRefOperation: getDocumentRef, readDocument, readDocumentOperation: readDocument,
      readCollection, readCollectionOperation: readCollection, readCollectionIds, readCollectionIdsOperation: readCollectionIds};
    const repository = new Repository(dependencies);
    const listAssignedEssayPractices = async () => ({practices: (await readCollection("studentEssayPractices/student/assignedEssayPractices"))
      .map(doc => ({...doc, essayPracticeId: doc.id})), nextCursor: null});
    const listCompletedEssayPractices = async () => ({practices: (await readCollection("studentEssayPractices/student/completedEssayPractices"))
      .map(doc => ({...doc, essayPracticeId: doc.id})), nextCursor: null});
    const deps = {dailyMissionRepository: repository,
      listAssignedPracticeIds: async () => readCollectionIds("studentPractices/student/assignedPractices"),
      listAssignedEssayPractices, getPracticeById: async id => ({id, questions: [{syllabusId: "language", topicId: "reading"}]}),
      checkPausedTopicValidity: async input => ({...input, isPaused: store.documents.has(`studentDailyMissions/student/pausedTopics/${input.syllabusId}/topics/${input.topicId}`)}),
      getCurrentDate: () => date};
    const list = new List(deps), legacy = new LegacyList(deps);
    const accept = new Accept({...deps, getAssignedEssayPractice: async input => readDocument("studentEssayPractices/student/assignedEssayPractices", input.essayPracticeId),
      getCompletedEssayPractice: async input => readDocument("studentEssayPractices/student/completedEssayPractices", input.essayPracticeId)});
    const availability = new Availability({...deps, listAdditionalMissions: input => list.execute(input), listCompletedEssayPractices});
    return {...store, deps, repository, list, legacy, accept, availability, listCompletedEssayPractices};
  }

  test(layer + ": includes assigned essays after the subject daily mission, keeping the legacy ID API normal-only", async () => {
    const h = harness(), missions = await h.list.execute(scope);
    assert.deepEqual(new Set(missions.map(m => `${m.practiceType}/${m.practiceId}/${m.topicId}`)), new Set(["normal/next/reading", "essay/next/writing"]));
    assert.deepEqual(await h.legacy.execute(scope), ["next"]);
    h.documents.delete(essayCompletion); assert.deepEqual(await h.list.execute(scope), []);
    h.documents.delete(subject); assert.deepEqual(await h.list.execute(scope), []);
  });

  test(layer + ": completing a normal daily mission also unlocks an assigned essay in the same subject", async () => {
    const h = harness();
    h.documents.set(subject, {coreMission: {topicId: "reading", practiceId: "core-normal"}});
    h.documents.set("studentPractices/student/completedPractices/core-normal", {});
    assert.ok((await h.list.execute(scope)).some(mission => mission.practiceType === "essay"));
  });

  test(layer + ": essay pagination, paused topics, other subjects and accepted topics are respected", async () => {
    const h = harness(), cursors = [];
    h.list.listAssignedEssayPractices = async input => {
      cursors.push(input.cursor);
      return input.cursor ? {practices: [{...writing, essayPracticeId: "next"}, {...writing, essayPracticeId: "core"}], nextCursor: null}
        : {practices: [{...writing, syllabusId: "other", essayPracticeId: "wrong"}], nextCursor: "more"};
    };
    assert.equal((await h.list.execute(scope)).filter(m => m.practiceType === "essay").length, 1);
    assert.deepEqual(cursors, [null, "more"]);
    h.documents.set("studentDailyMissions/student/pausedTopics/language/topics/writing", {});
    assert.equal((await h.list.execute(scope)).some(m => m.practiceType === "essay"), false);
    h.documents.delete("studentDailyMissions/student/pausedTopics/language/topics/writing");
    h.documents.set(subject + "/additionalTopics/writing", {});
    assert.equal((await h.list.execute(scope)).some(m => m.topicId === "writing"), false);
  });

  test(layer + ": essay acceptance stores a separate typed lookup, validates assignment and is idempotent", async () => {
    const h = harness(), input = {studentId: "student", practiceId: "next", practiceType: "essay"};
    const results = await Promise.all([h.accept.execute(input), h.accept.execute(input)]);
    assert.deepEqual(results.map(r => r.created).sort(), [false, true]);
    assert.equal(results[0].practiceType, "essay");
    assert.equal(h.documents.get(essayLookup).practiceType, "essay");
    assert.equal(h.documents.has(subject + "/additionalTopics/writing/essays/next"), true);
    assert.equal(h.documents.has(subject + "/additionalTopics/writing/practices/next"), false);
    assert.deepEqual(await h.repository.getAcceptedAdditionalMissionForPractice(input), {
      missionDate: date, syllabusId: "language", topicId: "writing", practiceId: "next", practiceType: "essay",
    });
    assert.equal(await h.repository.getAcceptedAdditionalMissionForPractice({...input, practiceType: "normal"}), null);
    await assert.rejects(h.accept.execute({...input, practiceType: "unknown"}));
  });

  test(layer + ": stale, wrong-topic, paused and daily-essay assignments cannot be accepted as an additional mission", async () => {
    const h = harness(); h.documents.delete(essayAssignment);
    await assert.rejects(h.repository.acceptAdditionalMission({...writing, practiceId: "next", practiceType: "essay", date}), /no longer assigned/);
    h.documents.set(essayAssignment, {...writing, topicId: "other"});
    await assert.rejects(h.repository.acceptAdditionalMission({...writing, practiceId: "next", practiceType: "essay", date}), /does not match/);
    h.documents.set(essayAssignment, writing);
    h.documents.set("studentDailyMissions/student/pausedTopics/language/topics/writing", {});
    await assert.rejects(h.repository.acceptAdditionalMission({...writing, practiceId: "next", practiceType: "essay", date}), /paused/);
    await assert.rejects(h.repository.acceptAdditionalMission({...writing, practiceId: "core", practiceType: "essay", date}), /cannot also/);
    assert.equal(h.documents.has(essayLookup), false);
  });

  test(layer + ": normal and essay missions share the one additional mission per topic per day limit", async () => {
    const h = harness(); h.accept.getPracticeById = async () => ({questions: [writing]});
    const results = await Promise.allSettled([
      h.accept.execute({studentId: "student", practiceId: "next"}),
      h.accept.execute({studentId: "student", practiceId: "next", practiceType: "essay"}),
    ]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(results.find(r => r.status === "rejected").reason.code, "failed-precondition");
  });

  test(layer + ": preparation distinguishes pending generation from exhausted or paused essay topics", async () => {
    const h = harness(); h.documents.delete(essayAssignment); h.documents.delete("studentPractices/student/assignedPractices/next");
    assert.deepEqual(await h.availability.execute(scope), {missions: [], preparingEssay: true});
    h.documents.set("studentEssayPracticeGenerations/student/completions/core", {status: "completed"});
    assert.equal((await h.availability.execute(scope)).preparingEssay, false);
    h.documents.delete("studentEssayPracticeGenerations/student/completions/core");
    h.documents.set(subject + "/additionalTopics/writing", {});
    assert.equal((await h.availability.execute(scope)).preparingEssay, false);
    h.documents.delete(subject + "/additionalTopics/writing");
    h.documents.set("studentDailyMissions/student/pausedTopics/language/topics/writing", {});
    assert.equal((await h.availability.execute(scope)).preparingEssay, false);
  });

  test(layer + ": additional essay reward requires accepted, matching completed work and awards configured coins once", async () => {
    const h = harness(), awards = new Map(); let totalCoins = 0, coins = 23;
    const studentRewardRepository = {getById: async input => awards.get(input.awardId) ?? null, save: async input => {
      const existing = awards.get(input.awardId);
      if (existing) {requireMatchingAward(existing, input); return {award: existing, totalCoins, alreadyAwarded: true};}
      awards.set(input.awardId, structuredClone(input)); totalCoins += input.coins; return {award: input, totalCoins, alreadyAwarded: false};
    }};
    const getCompletedEssayPractice = async input => h.documents.get("studentEssayPractices/student/completedEssayPractices/" + input.essayPracticeId) ?? null;
    const deps = {studentRewardRepository, getAcceptedAdditionalMissionForPractice: input => h.repository.getAcceptedAdditionalMissionForPractice(input),
      listCompletedPracticeIds: async () => assert.fail("Essay rewards must not use normal completions"), getCompletedEssayPractice,
      getRewardConfig: async () => ({bonusMissionCompletionCoins: coins})};
    const reward = new Reward(deps), input = {studentId: "student", practiceId: "next", practiceType: "essay"};
    assert.equal(await reward.execute(input), null);
    await h.accept.execute(input);
    await assert.rejects(reward.execute(input), {code: "failed-precondition"});
    h.documents.set("studentEssayPractices/student/completedEssayPractices/next", {...writing, essayQuestionId: "q-next"});
    const result = await reward.execute(input); assert.equal(result.totalCoins, 23); assert.equal(result.award.details.practiceType, "essay");
    coins = 200; assert.equal((await reward.execute(input)).alreadyAwarded, true); assert.equal(totalCoins, 23);
    const daily = new DailyReward({...deps, getAcceptedDailyMissionForPractice: input => h.repository.getAcceptedDailyMissionForPractice(input)});
    assert.equal(await daily.execute(input), null, "An additional essay must not receive a daily reward");
  });
}
