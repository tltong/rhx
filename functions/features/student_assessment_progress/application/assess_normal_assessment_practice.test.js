const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CalculateAssessmentProgression,
} = require(
  "../../assessment_framework/application/calculate_assessment_progression",
);
const {
  StudentAssessmentTopicProgress,
} = require("../domain/student_assessment_topic_progress");
const {
  AssessNormalAssessmentPractice,
} = require("./assess_normal_assessment_practice");

const framework = {
  id: "framework-1",
  endLevelName: "Ready",
  levels: [
    {
      id: "level-1",
      levelName: "Starting",
      sequenceOrder: 1,
      criteria: {
        requiredPracticeCount: 2,
        minimumScore: 80,
        questionsPerPractice: 10,
        difficultyLevel: "Easy",
      },
    },
    {
      id: "level-2",
      levelName: "Developing",
      sequenceOrder: 2,
      criteria: {
        requiredPracticeCount: 2,
        minimumScore: 80,
        questionsPerPractice: 10,
        difficultyLevel: "Medium",
      },
    },
  ],
};

function createPractice(id, questionId, type = "assessment") {
  return {
    id,
    type,
    questions: [{
      syllabusId: "syllabus-1",
      topicId: "topic-1",
      language: "English",
      hasDiagram: false,
      questionId,
    }],
  };
}

function createResult(practiceId, score, submittedAt) {
  return {
    practiceId,
    studentId: "student-1",
    score,
    submittedAt: new Date(submittedAt),
  };
}

test("advances using matching-difficulty scores completed after level entry", async () => {
  const currentPractice = createPractice("current", "q-current");
  const currentResult = createResult("current", 85, "2026-08-10T10:00:00Z");
  const practices = new Map([
    ["qualifying", createPractice("qualifying", "q-qualifying")],
    ["before-level", createPractice("before-level", "q-before")],
    ["wrong-difficulty", createPractice("wrong-difficulty", "q-hard")],
  ]);
  const results = new Map([
    ["qualifying", createResult(
      "qualifying",
      90,
      "2026-08-09T10:00:00Z",
    )],
    ["before-level", createResult(
      "before-level",
      100,
      "2026-07-31T10:00:00Z",
    )],
    ["wrong-difficulty", createResult(
      "wrong-difficulty",
      100,
      "2026-08-09T11:00:00Z",
    )],
  ]);
  const existingProgress = new StudentAssessmentTopicProgress({
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    initialLevel: {
      levelId: "level-1",
      setAt: new Date("2026-08-01T00:00:00Z"),
    },
    currentLevelId: "level-1",
    levelHistory: {
      "level-1": new Date("2026-08-01T00:00:00Z"),
    },
  });
  let savedProgress = null;
  const progression = new CalculateAssessmentProgression({
    async getById() {
      return framework;
    },
  });
  const useCase = new AssessNormalAssessmentPractice({
    studentAssessmentProgressRepository: {
      async getByTopic() {
        return existingProgress;
      },
      async saveProgress(progress) {
        savedProgress = progress;
        return progress;
      },
    },
    async getSyllabusById() {
      return {
        id: "syllabus-1",
        assessmentFrameworkId: "framework-1",
        topics: [{id: "topic-1"}],
      };
    },
    async getAssessmentLevelCriteria() {
      return {
        criteria: framework.levels[0].criteria,
      };
    },
    calculateAssessmentProgression: progression.execute.bind(progression),
    async listCompletedPracticeIds() {
      return ["qualifying", "before-level", "wrong-difficulty", "current"];
    },
    async getPracticeById(practiceId) {
      return practices.get(practiceId) || null;
    },
    async getPracticeResult({practiceId}) {
      return results.get(practiceId) || null;
    },
    async getQuestionDifficulty(questionReference) {
      return questionReference.questionId === "q-hard" ? "Hard" : "Easy";
    },
    assessmentPracticeType: "assessment",
  });

  const result = await useCase.execute({
    studentId: "student-1",
    practice: currentPractice,
    practiceResult: currentResult,
  });

  assert.equal(result.assessed, true);
  assert.equal(result.previousLevelId, "level-1");
  assert.equal(result.levelId, "level-2");
  assert.equal(result.levelChanged, true);
  assert.equal(result.eligiblePracticeCount, 2);
  assert.equal(result.qualifyingPracticeCount, 2);
  assert.equal(savedProgress.currentLevelId, "level-2");
  assert.equal(
    savedProgress.levelHistory["level-2"].toISOString(),
    currentResult.submittedAt.toISOString(),
  );
});

test("does not advance twice when retried after the level transition", async () => {
  const completedAt = new Date("2026-08-10T10:00:00Z");
  const progress = new StudentAssessmentTopicProgress({
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    initialLevel: {levelId: "level-1", setAt: completedAt},
    currentLevelId: "level-2",
    levelHistory: {
      "level-1": new Date("2026-08-01T00:00:00Z"),
      "level-2": completedAt,
    },
  });
  const progression = new CalculateAssessmentProgression({
    async getById() {
      return framework;
    },
  });
  const useCase = new AssessNormalAssessmentPractice({
    studentAssessmentProgressRepository: {
      async getByTopic() {
        return progress;
      },
      async saveProgress(savedProgress) {
        return savedProgress;
      },
    },
    async getSyllabusById() {
      return {
        id: "syllabus-1",
        assessmentFrameworkId: "framework-1",
        topics: [{id: "topic-1"}],
      };
    },
    async getAssessmentLevelCriteria() {
      return {criteria: framework.levels[1].criteria};
    },
    calculateAssessmentProgression: progression.execute.bind(progression),
    async listCompletedPracticeIds() {
      return [];
    },
    async getPracticeById() {
      return null;
    },
    async getPracticeResult() {
      return null;
    },
    async getQuestionDifficulty() {
      return "Medium";
    },
    assessmentPracticeType: "assessment",
  });

  const result = await useCase.execute({
    studentId: "student-1",
    practice: createPractice("current", "q-current"),
    practiceResult: createResult("current", 85, completedAt),
  });

  assert.equal(result.assessed, true);
  assert.equal(result.reason, null);
  assert.equal(result.levelId, "level-2");
  assert.equal(result.levelChanged, false);
});
