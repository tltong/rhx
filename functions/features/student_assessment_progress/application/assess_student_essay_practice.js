const {resolveTopicAssessmentFrameworkId} = require("../../syllabus/syllabus_module");
const {StudentAssessmentTopicProgress} = require("../domain/student_assessment_topic_progress");
const {requirePracticeAssessmentScope} = require("../domain/practice_assessment");
const {requireSyllabusTopic, toDate} = require("./assessment_helpers");

class AssessStudentEssayPractice {
  constructor(dependencies) {Object.assign(this, dependencies);}

  async execute(input, context = {}) {
    const scope = requirePracticeAssessmentScope({studentId: input?.studentId, practiceId: input?.essayPracticeId});
    for (let attempt = 0; ; attempt++) {
      try {return await this.assess(scope, context);}
      catch (error) {if (error.code !== "aborted" || attempt >= 9) throw error;}
    }
  }

  async assess(scope, {assertAccess = () => {}}) {
    assertAccess();
    const completion = await this.getCompletedEssayPractice({studentId: scope.studentId, essayPracticeId: scope.practiceId});
    assertAccess();
    if (!completion) throw new Error("The completed essay practice could not be found.");
    const {syllabusId, topicId} = completion;
    const repository = this.studentAssessmentProgressRepository;
    const saved = await repository.getPracticeAssessment(scope);
    assertAccess();
    if (saved) {
      if (saved.practiceType !== "essay" || saved.syllabusId !== syllabusId || saved.topicId !== topicId) throw new Error("The saved assessment conflicts with this essay.");
      const progress = await repository.getByTopic(scope.studentId, syllabusId, topicId);
      assertAccess();
      return Object.freeze({...saved, progress});
    }
    const [question, result, syllabus, existingProgress] = await Promise.all([
      this.getEssayQuestionById(completion.essayQuestionId),
      this.getEssayResult({studentId: scope.studentId, questionId: completion.essayQuestionId}),
      requireSyllabusTopic(this.getSyllabusById, syllabusId, topicId),
      repository.getByTopic(scope.studentId, syllabusId, topicId),
    ]);
    assertAccess();
    if (!question) throw new Error("The completed essay's question could not be found.");
    if (!result || result.answer !== completion.essayText || !Number.isFinite(result.score) || result.score < 0 || result.score > 100) {
      throw new Error("A matching graded essay result is required before level assessment.");
    }
    const base = {...scope, syllabusId, topicId, practiceType: "essay", score: result.score,
      assessed: false, levelChanged: false, reachedLevelIds: [], previousLevelId: existingProgress?.currentLevelId ?? null,
      levelId: existingProgress?.currentLevelId ?? null, isFrameworkCompleted: existingProgress?.isFrameworkCompleted === true,
      progress: existingProgress};
    const assessmentFrameworkId = resolveTopicAssessmentFrameworkId(syllabus, {topicId, language: question.language});
    if (!assessmentFrameworkId) return Object.freeze({...base, reason: "assessment-framework-not-configured"});
    if (existingProgress?.isFrameworkCompleted) return Object.freeze({...base, assessmentFrameworkId, reason: "framework-already-completed"});
    const level = existingProgress
      ? await this.getAssessmentLevelCriteria({assessmentFrameworkId, levelId: existingProgress.currentLevelId})
      : await this.calculateAssessmentProgression({assessmentFrameworkId, currentLevelId: null, scores: []});
    assertAccess();
    if (level.frameworkType !== "essay") return Object.freeze({...base, assessmentFrameworkId, reason: "essay-assessment-framework-required"});
    const currentLevelId = existingProgress?.currentLevelId ?? level.previousLevelId;
    // Each saved essay assessment belongs to exactly one level. Arrival order and
    // equal completion timestamps cannot cause an essay to count at two levels.
    const scores = await repository.listEssayAssessmentScores({...scope, syllabusId, topicId, assessmentFrameworkId, levelId: currentLevelId});
    assertAccess();
    scores.push(result.score);
    const progression = await this.calculateAssessmentProgression({assessmentFrameworkId, currentLevelId, scores});
    assertAccess();
    const completedAt = toDate(completion.completedAt, "essay completion time");
    const historyDates = Object.values(existingProgress?.levelHistory ?? {}).map(date => toDate(date, "level entry time").getTime());
    const enteredAt = new Date(Math.max(completedAt.getTime(), ...historyDates));
    const levelHistory = {...existingProgress?.levelHistory};
    if (!existingProgress) levelHistory[currentLevelId] = enteredAt;
    if (progression.levelChanged) levelHistory[progression.levelId] = enteredAt;
    const progress = new StudentAssessmentTopicProgress({studentId: scope.studentId, syllabusId, topicId,
      initialLevel: existingProgress?.initialLevel ?? {levelId: currentLevelId, setAt: enteredAt},
      currentLevelId: progression.levelId, isFrameworkCompleted: progression.isEndLevel, levelHistory});
    const assessment = {...scope, syllabusId, topicId, assessmentFrameworkId, assessed: true, reason: null,
      practiceType: "essay", score: result.score, assessedAt: completedAt,
      previousLevelId: progression.previousLevelId, levelId: progression.levelId, levelName: progression.levelName,
      levelChanged: progression.levelChanged, reachedLevelIds: progression.reachedLevelIds,
      isFrameworkCompleted: progression.isEndLevel, eligiblePracticeCount: scores.length,
      qualifyingPracticeCount: progression.qualifyingPracticeCount,
      requiredPracticeCount: progression.criteria.requiredPracticeCount, minimumScore: progression.criteria.minimumScore};
    const outcome = await repository.saveAssessmentProgress({progress, assessment, expectedProgress: existingProgress, assertAccess,
      sourceCompletion: {essayQuestionId: completion.essayQuestionId, completedAt}});
    assertAccess();
    return Object.freeze({...outcome.assessment, progress: outcome.progress});
  }
}

module.exports = {AssessStudentEssayPractice};
