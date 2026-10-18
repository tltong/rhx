import assert from "node:assert/strict";
import {test} from "node:test";
import {createRequire} from "node:module";
import {GetNextCoreDailyMission as WebNext} from "./application/get_next_core_daily_mission.js";
import {AcceptCoreDailyMission as WebAccept} from "./application/accept_core_daily_mission.js";
import {PauseCoreDailyMission as WebPause} from "./application/pause_core_daily_mission.js";
const require = createRequire(import.meta.url);
const {GetNextCoreDailyMission: BackendNext} = require("../../../functions/features/daily_mission/application/get_next_core_daily_mission");
const {AcceptCoreDailyMission: BackendAccept} = require("../../../functions/features/daily_mission/application/accept_core_daily_mission");
const {PauseCoreDailyMission: BackendPause} = require("../../../functions/features/daily_mission/application/pause_core_daily_mission");
const scope = {studentId: "student", syllabusId: "syllabus"};
const assignment = {studentId: "student", essayPracticeId: "attempt", essayQuestionId: "question", syllabusId: "syllabus", topicId: "writing"};
for (const [layer, Next, Accept, Pause] of [["backend", BackendNext, BackendAccept, BackendPause], ["web", WebNext, WebAccept, WebPause]]) {
  function make(overrides = {}) {
    return new Next({dailyMissionRepository: {getCoreMission: async () => null, listPausedTopicIds: async () => [],
      listTopicStats: async () => [], listAcceptedAdditionalPracticeIds: async () => []},
      listAssignedPracticeIds: async () => [], getPracticeById: async () => assert.fail("An essay is not a normal shared practice"),
      listAssignedEssayPractices: async () => ({practices: [assignment], nextCursor: null}),
      checkPausedTopicValidity: async () => ({isPaused: false}), getCurrentDate: () => "2026-10-18", ...overrides});
  }
  test(layer + ": selects an assigned essay and carries its student attempt ID and type", async () => {
    assert.deepEqual(await make().execute(scope), {...scope, topicId: "writing", practiceId: "attempt", practiceType: "essay", date: "2026-10-18", isAccepted: false});
  });
  test(layer + ": selection reads all essay pages and does not offer paused or other-subject assignments", async () => {
    const cursors = [];
    const next = make({listAssignedEssayPractices: async input => {
      cursors.push(input.cursor);
      return input.cursor ? {practices: [assignment], nextCursor: null}
        : {practices: [{...assignment, syllabusId: "other"}], nextCursor: "page-2"};
    }});
    assert.equal((await next.execute(scope)).practiceId, "attempt");
    assert.deepEqual(cursors, [null, "page-2"]);
    next.dailyMissionRepository.listPausedTopicIds = async () => ["writing"];
    next.checkPausedTopicValidity = async input => ({...input, isPaused: true});
    assert.equal(await next.execute(scope), null);
  });
  test(layer + ": an accepted essay occupies the one subject mission slot without reading more assignments", async () => {
    const next = make({listAssignedEssayPractices: async () => assert.fail("Already accepted")});
    next.dailyMissionRepository.getCoreMission = async () => ({topicId: "writing", practiceId: "attempt", practiceType: "essay"});
    assert.equal((await next.execute(scope)).isAccepted, true);
  });
  test(layer + ": accepts only the current typed essay mission and supports completion retries", async () => {
    const next = make(), mission = await next.execute(scope), writes = [];
    const accept = new Accept({dailyMissionRepository: {acceptCoreMission: async input => {writes.push(input); return {created: true};}},
      getNextCoreDailyMission: async () => mission, getPracticeById: async () => assert.fail("No normal lookup"),
      getAssignedEssayPractice: async () => null, getCompletedEssayPractice: async () => assignment});
    const input = {studentId: "student", practiceId: "attempt", practiceType: "essay"};
    assert.equal((await accept.execute(input)).practiceType, "essay");
    assert.equal(writes[0].practiceType, "essay");
    accept.getNextCoreDailyMission = async () => ({...mission, practiceType: "normal"});
    await assert.rejects(accept.execute(input), /not the student's current/);
  });
  test(layer + ": the syllabus pausable flag is enforced for essay missions", async () => {
    const writes = [];
    const pause = new Pause({dailyMissionRepository: {pauseTopic: async input => {writes.push(input); return {created: true, pausedDate: "2026-10-18"};}},
      getPracticeById: async () => assert.fail("No normal lookup"), getAssignedEssayPractice: async () => assignment,
      isTopicPausable: async () => false, getCurrentDate: () => "2026-10-18"});
    const input = {studentId: "student", practiceId: "attempt", practiceType: "essay"};
    await assert.rejects(pause.execute(input), /cannot be paused/); assert.deepEqual(writes, []);
    pause.isTopicPausable = async () => true;
    assert.equal((await pause.execute(input)).isPaused, true); assert.equal(writes.length, 1);
  });
}
