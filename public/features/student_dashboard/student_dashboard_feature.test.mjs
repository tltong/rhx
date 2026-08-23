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

test("student dashboard combines progress and next assigned practices", async () => {
  const levelReads = [];
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
    listCompletedPracticeIds: async () => ["practice-1"],
    listAssignedPractices: async () => [
      {practiceId: "assigned-later"},
      {practiceId: "assigned-next"},
    ],
    getPracticeById: async (practiceId) => ({
      id: practiceId,
      type: "assessment",
      dateGenerated: new Date(
        practiceId === "assigned-next"
          ? "2026-08-20T00:00:00.000Z"
          : "2026-08-21T00:00:00.000Z"
      ),
      questions: [{
        syllabusId: "syllabus-1",
        topicId: "topic-1",
        questionId: `${practiceId}-question`,
      }],
    }),
    getStudentTopicLevel: async ({topicId}) => {
      levelReads.push(topicId);
      return "level-2";
    },
    getAssessmentFrameworkById: async () => framework,
    endLevelId: "endLevel",
    now: () => new Date("2026-08-23T00:00:00.000Z"),
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
  assert.equal(shapes.preAssessmentState, "not-completed");
  assert.equal(shapes.currentLevelName, "Not determined");
  assert.equal(shapes.nextAssignedPractice, null);
  assert.deepEqual(levelReads, ["topic-1"]);
});
