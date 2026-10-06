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
});

function dashboardFixture(getReadinessScore) {
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
    getAssessmentFrameworkById: async () => framework,
    endLevelId: "endLevel",
    now: () => new Date("2026-10-07")
  });
}

test("dashboard readiness reads are scoped to the requested student and syllabus even before first assessment", async () => {
  const reads = [];
  const dashboard = await dashboardFixture(async (scope) => {
    reads.push(scope);
    return {score: scope.syllabusId === "math" ? 0 : 175};
  }).execute("student-2");
  assert.equal(reads.length, 4);
  assert.ok(reads.every(({studentId}) => studentId === "student-2"));
  assert.deepEqual(dashboard.syllabuses.map(({topics}) => topics.map(({readinessScore}) => readinessScore)), [
    [0, 0], [175, 175]
  ]);
});

test("dashboard refresh reads newly saved readiness instead of keeping the initial value", async () => {
  let score = 40;
  const useCase = dashboardFixture(async () => ({score}));
  const initial = await useCase.execute("student-1");
  score = 85.25;
  const refreshed = await useCase.execute("student-1");
  assert.equal(initial.syllabuses[0].topics[0].readinessScore, 40);
  assert.equal(refreshed.syllabuses[0].topics[0].readinessScore, 85.25);
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
