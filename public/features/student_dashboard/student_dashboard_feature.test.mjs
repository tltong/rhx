import assert from "node:assert/strict";
import test from "node:test";

import {
  GetStudentDashboard
} from "./application/get_student_dashboard.js";
import {
  summarizeTopicProgress
} from "./domain/topic_progress_summary.js";

const framework = {
  id: "framework-1",
  name: "Primary Framework",
  endLevelName: "Ready",
  levels: [
    {id: "level-1", levelName: "Starting", sequenceOrder: 1},
    {id: "level-2", levelName: "Developing", sequenceOrder: 2},
    {id: "level-3", levelName: "Secure", sequenceOrder: 3},
  ],
};

test("topic progress includes the final level in its percentage", () => {
  assert.deepEqual(
    summarizeTopicProgress({
      hasPreAssessment: true,
      preAssessmentCompleted: true,
      currentLevelId: "level-2",
      framework,
      endLevelId: "endLevel",
    }),
    {
      preAssessmentState: "completed",
      currentLevelId: "level-2",
      currentLevelName: "Developing",
      nextLevelName: "Secure",
      finalLevelName: "Ready",
      progressPercentage: 50,
      totalLevelCount: 4,
      isFinalLevel: false,
    },
  );
});

test("an unfinished pre-assessment has no determined level", () => {
  const summary = summarizeTopicProgress({
    hasPreAssessment: true,
    preAssessmentCompleted: false,
    currentLevelId: null,
    framework,
    endLevelId: "endLevel",
  });

  assert.equal(summary.currentLevelName, "Not determined");
  assert.equal(summary.nextLevelName, "Not determined");
  assert.equal(summary.progressPercentage, 0);
});

test("student dashboard combines progress and practice history", async () => {
  const levelReads = [];
  const readinessReads = [];
  const subjectReadinessReads = [];
  const reliabilityReads = [];
  const subjectReliabilityReads = [];
  const difficultyReads = [];
  const practices = {
    "practice-1": {
      id: "practice-1",
      type: "pre assessment",
      dateGenerated: new Date("2026-08-10T00:00:00.000Z"),
      questions: [{
        syllabusId: "syllabus-1",
        topicId: "topic-1",
        questionId: "pre-question",
      }],
    },
    "completed-normal": {
      id: "completed-normal",
      type: "assessment",
      dateGenerated: new Date("2026-08-22T00:00:00.000Z"),
      questions: [{
        syllabusId: "syllabus-1",
        topicId: "topic-1",
        language: "English",
        hasDiagram: false,
        questionId: "normal-question",
      }],
    },
  };
  const useCase = new GetStudentDashboard({
    getStudentById: async () => ({
      id: "student-1",
      name: "Student One",
      country: "Malaysia",
      level: "primary",
      yearOfRegistration: 2025,
      standardAtYearOfRegistration: "3",
    }),
    getStudentStreamSubscription: async () => ({streamId: "stream-1"}),
    getStreamById: async () => ({id: "stream-1", name: "Primary Stream"}),
    listActiveStudentSyllabusSubscriptions: async () => [{
      syllabusId: "syllabus-1",
      language: "English",
    }],
    getSyllabusById: async () => ({
      id: "syllabus-1",
      subject: "Mathematics",
      assessmentFrameworkId: "framework-1",
      topics: [
        {
          id: "topic-1",
          topicName: "Numbers",
          preAssessmentPractices: {
            english: {language: "English", practiceId: "practice-1"},
          },
        },
        {
          id: "topic-2",
          topicName: "Shapes",
          preAssessmentPractices: {
            english: {language: "English", practiceId: "practice-2"},
          },
        },
      ],
    }),
    listCompletedPractices: async () => [
      {
        practiceId: "completed-normal",
        dateCompleted: new Date("2026-08-24T00:00:00.000Z"),
        score: 80,
      },
      {
        practiceId: "practice-1",
        dateCompleted: new Date("2026-08-18T00:00:00.000Z"),
        score: 60,
      },
    ],
    getPracticeById: async (practiceId) => practices[practiceId] || null,
    getQuestionDifficulty: async (questionReference) => {
      difficultyReads.push(questionReference.questionId);
      return "Medium";
    },
    preAssessmentPracticeType: "pre assessment",
    getStudentTopicLevel: async ({topicId}) => {
      levelReads.push(topicId);
      return "level-2";
    },
    getReadinessScore: async (scope) => {
      readinessReads.push(scope);
      return scope.topicId === "topic-1" ? {score: 105.625} : null;
    },
    getSubjectReadinessScore: async (scope) => {
      subjectReadinessReads.push(scope);
      return {score: 95.875};
    },
    getTopicReliabilityScore: async (scope) => {
      reliabilityReads.push(scope);
      return scope.topicId === "topic-1" ? {score: 20} : null;
    },
    getSubjectReliabilityScore: async (scope) => {
      subjectReliabilityReads.push(scope);
      return {score: 10};
    },
    getAssessmentFrameworkById: async () => framework,
    endLevelId: "endLevel",
    now: () => new Date("2026-08-24T00:00:00.000Z"),
  });

  const dashboard = await useCase.execute("student-1");
  const [numbers, shapes] = dashboard.syllabuses[0].topics;

  assert.equal(dashboard.student.currentGrade, 4);
  assert.equal(dashboard.stream.name, "Primary Stream");
  assert.equal(numbers.preAssessmentState, "completed");
  assert.equal(numbers.progressPercentage, 50);
  assert.equal("nextAssignedPractice" in numbers, false);
  assert.deepEqual(
    numbers.completedPractices.map((practice) => ({
      id: practice.practiceId,
      difficulty: practice.difficulty,
      score: practice.score,
    })),
    [
      {id: "completed-normal", difficulty: "Medium", score: 80},
      {id: "practice-1", difficulty: null, score: 60},
    ],
  );
  assert.deepEqual(difficultyReads, ["normal-question"]);
  assert.equal(shapes.preAssessmentState, "not-completed");
  assert.equal(shapes.currentLevelName, "Not determined");
  assert.deepEqual(shapes.completedPractices, []);
  assert.deepEqual(levelReads, ["topic-1"]);
  assert.equal(numbers.readinessScore, 105.625);
  assert.equal(numbers.readinessUnavailable, false);
  assert.equal(shapes.readinessScore, null);
  assert.equal(shapes.readinessUnavailable, false);
  assert.deepEqual(readinessReads, [
    {studentId: "student-1", syllabusId: "syllabus-1", topicId: "topic-1"},
    {studentId: "student-1", syllabusId: "syllabus-1", topicId: "topic-2"}
  ]);
  assert.equal(dashboard.syllabuses[0].readinessScore, 95.875);
  assert.equal(dashboard.syllabuses[0].readinessUnavailable, false);
  assert.deepEqual(subjectReadinessReads, [{studentId: "student-1", syllabusId: "syllabus-1"}]);
  assert.equal(numbers.reliabilityScore, 20);
  assert.equal(numbers.reliabilityUnavailable, false);
  assert.equal(shapes.reliabilityScore, null);
  assert.equal(shapes.reliabilityUnavailable, false);
  assert.deepEqual(reliabilityReads, readinessReads);
  assert.equal(dashboard.syllabuses[0].reliabilityScore, 10);
  assert.equal(dashboard.syllabuses[0].reliabilityUnavailable, false);
  assert.deepEqual(subjectReliabilityReads, subjectReadinessReads);
});

function dashboardFixture(
  getReadinessScore,
  getSubjectReadinessScore = async () => null,
  getTopicReliabilityScore = async () => null,
  getSubjectReliabilityScore = async () => null
) {
  return new GetStudentDashboard({
    getStudentById: async (id) => ({
      id, name: "Student", country: "Malaysia", level: "primary",
      yearOfRegistration: 2026, standardAtYearOfRegistration: "4"
    }),
    getStudentStreamSubscription: async () => null,
    getStreamById: async () => null,
    listActiveStudentSyllabusSubscriptions: async () => [
      {syllabusId: "math", language: "English"},
      {syllabusId: "science", language: "English"}
    ],
    getSyllabusById: async (id) => ({
      id, subject: id, assessmentFrameworkId: "framework-1",
      topics: [
        {id: "shared-topic", topicName: "Topic One", preAssessmentPractices: {}},
        {id: "second-topic", topicName: "Topic Two", preAssessmentPractices: {}}
      ]
    }),
    listCompletedPractices: async () => [],
    getPracticeById: async () => null,
    getQuestionDifficulty: async () => "Medium",
    preAssessmentPracticeType: "pre assessment",
    getStudentTopicLevel: async () => null,
    getReadinessScore,
    getSubjectReadinessScore,
    getTopicReliabilityScore,
    getSubjectReliabilityScore,
    getAssessmentFrameworkById: async () => framework,
    endLevelId: "endLevel",
    now: () => new Date("2026-10-07")
  });
}

test("dashboard readiness reads are scoped to the requested student and syllabus even before first assessment", async () => {
  const reads = [];
  const subjectReads = [];
  const dashboard = await dashboardFixture(async (scope) => {
    reads.push(scope);
    return {score: scope.syllabusId === "math" ? 0 : 175};
  }, async (scope) => {
    subjectReads.push(scope);
    return {score: scope.syllabusId === "math" ? 0 : 140};
  }).execute("student-2");
  assert.equal(reads.length, 4);
  assert.ok(reads.every(({studentId}) => studentId === "student-2"));
  assert.deepEqual(dashboard.syllabuses.map(({topics}) => topics.map(({readinessScore}) => readinessScore)), [
    [0, 0], [175, 175]
  ]);
  assert.deepEqual(subjectReads, [
    {studentId: "student-2", syllabusId: "math"},
    {studentId: "student-2", syllabusId: "science"}
  ]);
  assert.deepEqual(dashboard.syllabuses.map(({readinessScore}) => readinessScore), [0, 140]);
});

test("dashboard refresh reads newly saved readiness instead of keeping the initial value", async () => {
  let score = 40;
  let subjectScore = 70;
  const useCase = dashboardFixture(async () => ({score}), async () => ({score: subjectScore}));
  const initial = await useCase.execute("student-1");
  score = 85.25;
  subjectScore = 91.375;
  const refreshed = await useCase.execute("student-1");
  assert.equal(initial.syllabuses[0].topics[0].readinessScore, 40);
  assert.equal(refreshed.syllabuses[0].topics[0].readinessScore, 85.25);
  assert.equal(initial.syllabuses[0].readinessScore, 70);
  assert.equal(refreshed.syllabuses[0].readinessScore, 91.375);
});

test("a failed subject readiness read leaves topics and other subjects available", async () => {
  const dashboard = await dashboardFixture(async () => ({score: 80}), async ({syllabusId}) => {
    if (syllabusId === "math") throw new Error("subject read failed");
    return {score: 65.5};
  }).execute("student-1");
  const [math, science] = dashboard.syllabuses;
  assert.equal(math.readinessScore, null);
  assert.equal(math.readinessUnavailable, true);
  assert.equal(math.topics[0].readinessScore, 80);
  assert.equal(math.topics[0].readinessUnavailable, false);
  assert.equal(math.topics[0].currentLevelName, "Not determined");
  assert.equal(science.readinessScore, 65.5);
  assert.equal(science.readinessUnavailable, false);
});

test("missing saved subject readiness is distinct from a failed read", async () => {
  const dashboard = await dashboardFixture(async () => ({score: 80}), async () => null).execute("student-1");
  for (const syllabus of dashboard.syllabuses) {
    assert.equal(syllabus.readinessScore, null);
    assert.equal(syllabus.readinessUnavailable, false);
    assert.equal(syllabus.topics[0].readinessScore, 80);
  }
});

test("a missing syllabus reports unavailable readiness without reading unrelated scores", async () => {
  let subjectReads = 0;
  const useCase = dashboardFixture(async () => { throw new Error("must not read a topic"); }, async () => {
    subjectReads++;
    return {score: 80};
  });
  useCase.getSyllabusById = async () => null;
  useCase.getTopicReliabilityScore = async () => { throw new Error("must not read a topic"); };
  useCase.getSubjectReliabilityScore = async () => { subjectReads++; return {score: 10}; };
  const dashboard = await useCase.execute("student-1");
  assert.equal(subjectReads, 0);
  for (const syllabus of dashboard.syllabuses) {
    assert.equal(syllabus.readinessScore, null);
    assert.equal(syllabus.readinessUnavailable, true);
    assert.equal(syllabus.reliabilityScore, null);
    assert.equal(syllabus.reliabilityUnavailable, true);
    assert.match(syllabus.error, /Syllabus details/);
    assert.deepEqual(syllabus.topics, []);
  }
});

test("a failed readiness read affects only that topic and is distinct from no stored score", async () => {
  const dashboard = await dashboardFixture(async ({syllabusId, topicId}) => {
    if (syllabusId === "math" && topicId === "shared-topic") throw new Error("read failed");
    if (topicId === "second-topic") return null;
    return {score: 65};
  }).execute("student-1");
  const [math, science] = dashboard.syllabuses;
  assert.equal(math.topics[0].readinessUnavailable, true);
  assert.equal(math.topics[0].readinessScore, null);
  assert.equal(math.topics[0].currentLevelName, "Not determined");
  assert.equal(math.topics[1].readinessUnavailable, false);
  assert.equal(math.topics[1].readinessScore, null);
  assert.equal(science.topics[0].readinessScore, 65);
  assert.equal(science.topics[0].readinessUnavailable, false);
});

test("dashboard reliability reads use the requested student and syllabus, including unassessed topics", async () => {
  const topicReads = [];
  const subjectReads = [];
  const dashboard = await dashboardFixture(async () => ({score: 80}), async () => ({score: 75}), async (scope) => {
    topicReads.push(scope);
    return {score: scope.syllabusId === "math" ? 0 : 100};
  }, async (scope) => {
    subjectReads.push(scope);
    return {score: scope.syllabusId === "math" ? 0 : 50};
  }).execute("student-2");
  assert.deepEqual(topicReads, [
    {studentId: "student-2", syllabusId: "math", topicId: "shared-topic"},
    {studentId: "student-2", syllabusId: "math", topicId: "second-topic"},
    {studentId: "student-2", syllabusId: "science", topicId: "shared-topic"},
    {studentId: "student-2", syllabusId: "science", topicId: "second-topic"},
  ]);
  assert.deepEqual(subjectReads, [
    {studentId: "student-2", syllabusId: "math"},
    {studentId: "student-2", syllabusId: "science"},
  ]);
  assert.deepEqual(dashboard.syllabuses.map(({reliabilityScore}) => reliabilityScore), [0, 50]);
  assert.deepEqual(dashboard.syllabuses.map(({topics}) => topics.map(({reliabilityScore}) => reliabilityScore)), [[0, 0], [100, 100]]);
  assert.ok(dashboard.syllabuses.every((syllabus) => !syllabus.reliabilityUnavailable));
  assert.ok(dashboard.syllabuses.flatMap(({topics}) => topics).every((topic) => !topic.reliabilityUnavailable));
});

test("dashboard reloads both reliability levels after new scores are saved", async () => {
  let topicScore = 10;
  let subjectScore = 5;
  const useCase = dashboardFixture(async () => ({score: 80}), async () => ({score: 75}),
    async () => ({score: topicScore}), async () => ({score: subjectScore}));
  const initial = await useCase.execute("student-1");
  topicScore = 20;
  subjectScore = 10;
  const refreshed = await useCase.execute("student-1");
  assert.equal(initial.syllabuses[0].topics[0].reliabilityScore, 10);
  assert.equal(refreshed.syllabuses[0].topics[0].reliabilityScore, 20);
  assert.equal(initial.syllabuses[0].reliabilityScore, 5);
  assert.equal(refreshed.syllabuses[0].reliabilityScore, 10);
  assert.equal(refreshed.syllabuses[0].readinessScore, 75);
});

test("reliability read failures affect only their topic or subject while readiness and progress remain visible", async () => {
  const dashboard = await dashboardFixture(async () => ({score: 80}), async () => ({score: 75}), async ({syllabusId, topicId}) => {
    if (syllabusId === "math" && topicId === "shared-topic") throw new Error("topic reliability read failed");
    return topicId === "second-topic" ? null : {score: 40};
  }, async ({syllabusId}) => {
    if (syllabusId === "math") throw new Error("subject reliability read failed");
    return {score: 20};
  }).execute("student-1");
  const [math, science] = dashboard.syllabuses;
  assert.equal(math.reliabilityScore, null);
  assert.equal(math.reliabilityUnavailable, true);
  assert.equal(math.topics[0].reliabilityScore, null);
  assert.equal(math.topics[0].reliabilityUnavailable, true);
  assert.equal(math.topics[1].reliabilityScore, null);
  assert.equal(math.topics[1].reliabilityUnavailable, false);
  assert.equal(math.topics[0].readinessScore, 80);
  assert.equal(math.topics[0].currentLevelName, "Not determined");
  assert.equal(math.readinessScore, 75);
  assert.equal(science.reliabilityScore, 20);
  assert.equal(science.reliabilityUnavailable, false);
  assert.equal(science.topics[0].reliabilityScore, 40);
  assert.equal(science.topics[0].reliabilityUnavailable, false);
});

test("no saved reliability score is distinct from a failed read at both levels", async () => {
  const dashboard = await dashboardFixture(async () => ({score: 80})).execute("student-1");
  for (const syllabus of dashboard.syllabuses) {
    assert.equal(syllabus.reliabilityScore, null);
    assert.equal(syllabus.reliabilityUnavailable, false);
    for (const topic of syllabus.topics) {
      assert.equal(topic.reliabilityScore, null);
      assert.equal(topic.reliabilityUnavailable, false);
      assert.equal(topic.readinessScore, 80);
    }
  }
});

test("essay topics without an essay framework retain their grade and leave levels unavailable", async () => {
  const completion = {essayPracticeId: "student-attempt", essayQuestionId: "essay-question", syllabusId: "language", topicId: "writing",
    essayText: "Saved essay", completedAt: new Date("2026-10-18T08:00:00Z")};
  const useCase = new GetStudentDashboard({
    getStudentById: async () => ({id: "student", name: "Student", level: "primary", country: "Malaysia", yearOfRegistration: 2026, standardAtYearOfRegistration: 3}),
    getStudentStreamSubscription: async () => null, getStreamById: async () => null,
    listActiveStudentSyllabusSubscriptions: async () => [{syllabusId: "language", language: "English"}],
    getSyllabusById: async () => ({id: "language", subject: "English", topics: [{id: "writing", topicName: "Writing",
      preAssessmentPractices: {english: {practiceId: "shared-essay-practice", practiceType: "essay", language: "English"}}}]}),
    listCompletedPractices: async () => [], getPracticeById: async () => assert.fail("No normal lookup"),
    listCompletedEssayPractices: async ({cursor}) => cursor ? {practices: [completion], nextCursor: null} : {practices: [], nextCursor: "next"},
    getEssayPracticeById: async id => {assert.equal(id, "shared-essay-practice"); return {id, essayQuestionId: "essay-question"};},
    getEssayResult: async () => ({answer: "Saved essay", score: 85}),
    getStudentTopicLevel: async () => assert.fail("Essay completion does not advance framework levels"),
    getReadinessScore: async () => null, getSubjectReadinessScore: async () => null,
    getTopicReliabilityScore: async () => null, getSubjectReliabilityScore: async () => null,
    now: () => new Date("2026-10-18"), endLevelId: "endLevel",
  });
  const dashboard = await useCase.execute("student");
  const topic = dashboard.syllabuses[0].topics[0];
  assert.equal(topic.preAssessmentState, "completed"); assert.equal(topic.currentLevelName, "Not applicable");
  assert.equal(dashboard.syllabuses[0].error, null);
  assert.deepEqual(topic.completedPractices[0], {practiceId: "student-attempt", essayQuestionId: "essay-question", practiceType: "essay",
    dateCompleted: completion.completedAt, difficulty: null, score: 85});
  useCase.getEssayResult = async () => ({answer: "A different answer", score: 95});
  assert.equal((await useCase.execute("student")).syllabuses[0].topics[0].completedPractices[0].score, null);
});


test("essay frameworks show their first level before any essay is completed, without pre-assessment", () => {
  const summary = summarizeTopicProgress({hasPreAssessment: false, preAssessmentCompleted: false,
    requiresPreAssessment: false, currentLevelId: null, framework: {...framework, frameworkType: "essay"}, endLevelId: "endLevel"});
  assert.equal(summary.preAssessmentState, "not-configured");
  assert.equal(summary.currentLevelId, "level-1"); assert.equal(summary.currentLevelName, "Starting");
  assert.equal(summary.nextLevelName, "Developing"); assert.equal(summary.progressPercentage, 25);
});

for (const [savedLevel, expectedName, expectedPercentage] of [["level-1", "Starting", 25], ["level-2", "Developing", 50], ["endLevel", "Ready", 100]]) {
  test("essay dashboard reads saved progression at " + savedLevel + " without requiring the attached first essay", async () => {
    let attached = false, completed = false;
    const levelReads = [];
    const useCase = new GetStudentDashboard({
      getStudentById: async () => ({id: "student", name: "Student", level: "primary", country: "Malaysia", yearOfRegistration: 2026, standardAtYearOfRegistration: 3}),
      getStudentStreamSubscription: async () => null, getStreamById: async () => null,
      listActiveStudentSyllabusSubscriptions: async () => [{syllabusId: "language", language: "English"}],
      getSyllabusById: async () => ({id: "language", subject: "English", languages: ["English"], assessmentFrameworkId: "normal-parent",
        topics: [{id: "writing", topicName: "Writing", assessmentFrameworkIds: {english: "essay-framework"},
          preAssessmentPractices: attached ? {english: {practiceId: "initial-essay", practiceType: "essay", language: "English"}} : {}}]}),
      getAssessmentFrameworkById: async id => id === "essay-framework" ? {...framework, id, frameworkType: "essay"} : framework,
      listCompletedPractices: async () => [], getPracticeById: async () => assert.fail("No normal practice lookup"),
      listCompletedEssayPractices: async () => ({practices: completed ? [{essayPracticeId: "attempt", essayQuestionId: "question",
        syllabusId: "language", topicId: "writing", essayText: "My essay", completedAt: new Date("2026-10-18")}] : [], nextCursor: null}),
      getEssayPracticeById: async () => ({essayQuestionId: "question"}), getEssayResult: async () => ({answer: "My essay", score: 85}),
      getStudentTopicLevel: async scope => {levelReads.push(scope); return savedLevel;},
      getReadinessScore: async () => null, getSubjectReadinessScore: async () => null,
      getTopicReliabilityScore: async () => null, getSubjectReliabilityScore: async () => null,
      now: () => new Date("2026-10-18"), endLevelId: "endLevel",
    });
    for (const [hasAttachment, hasCompletion] of [[false, false], [true, false], [true, true]]) {
      attached = hasAttachment; completed = hasCompletion;
      const topic = (await useCase.execute("student")).syllabuses[0].topics[0];
      assert.equal(topic.currentLevelId, savedLevel); assert.equal(topic.currentLevelName, expectedName);
      assert.equal(topic.progressPercentage, expectedPercentage); assert.equal(topic.isFinalLevel, savedLevel === "endLevel");
      assert.equal(topic.assessmentFrameworkId, "essay-framework");
      assert.notEqual(topic.nextLevelName, "Not applicable");
    }
    assert.equal(levelReads.length, 3);
    assert.deepEqual(levelReads[0], {studentId: "student", syllabusId: "language", topicId: "writing"});
  });
}
