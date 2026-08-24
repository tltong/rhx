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
    "assigned-next": {
      id: "assigned-next",
      type: "assessment",
      dateGenerated: new Date("2026-08-20T00:00:00.000Z"),
      questions: [{
        syllabusId: "syllabus-1",
        topicId: "topic-1",
        questionId: "assigned-next-question",
      }],
    },
    "assigned-later": {
      id: "assigned-later",
      type: "assessment",
      dateGenerated: new Date("2026-08-21T00:00:00.000Z"),
      questions: [{
        syllabusId: "syllabus-1",
        topicId: "topic-1",
        questionId: "assigned-later-question",
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
    listAssignedPractices: async () => [
      {practiceId: "assigned-later"},
      {practiceId: "assigned-next"},
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
  assert.equal(
    numbers.nextAssignedPractice.practiceId,
    "assigned-next",
  );
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
  assert.equal(shapes.nextAssignedPractice, null);
  assert.deepEqual(shapes.completedPractices, []);
  assert.deepEqual(levelReads, ["topic-1"]);
});
