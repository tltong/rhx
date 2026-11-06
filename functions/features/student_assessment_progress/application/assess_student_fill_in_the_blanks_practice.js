const {resolveTopicAssessmentFrameworkId} = require("../../syllabus/syllabus_module");
const {StudentAssessmentTopicProgress} = require("../domain/student_assessment_topic_progress");
const {requirePracticeAssessmentScope} = require("../domain/practice_assessment");
const {requireSyllabusTopic, toDate} = require("./assessment_helpers");
const {PRE_ASSESSMENT, ASSESSMENT, placementSnapshot} = require("../../fill_in_the_blanks_practice/domain/pre_assessment");

class AssessStudentFillInTheBlanksPractice {
  constructor(dependencies) {Object.assign(this, dependencies);}

  async execute(input, context = {}) {
    const scope = requirePracticeAssessmentScope({studentId: input?.studentId, practiceId: input?.practiceId});
    for (let attempt = 0; ; attempt++) {
      try {return await this.assess(scope, context);}
      catch (error) {if (error.code !== "aborted" || attempt >= 9) throw error;}
    }
  }

  async assess(scope, {assertAccess = () => {}}) {
    assertAccess();
    const completion = await this.getCompletedFillInTheBlanksPractice({studentId: scope.studentId, practiceId: scope.practiceId});
    assertAccess();
    if (!completion) throw new Error("The completed fill-in-the-blanks practice could not be found.");
    const {syllabusId, topicId} = completion;
    const repository = this.studentAssessmentProgressRepository;
    const saved = await repository.getPracticeAssessment(scope);
    assertAccess();
    if (saved) {
      if (saved.practiceType !== "fillInTheBlanks" || saved.syllabusId !== syllabusId || saved.topicId !== topicId) throw new Error("The saved assessment conflicts with this fill-in-the-blanks.");
      const progress = await repository.getByTopic(scope.studentId, syllabusId, topicId);
      assertAccess();
      return Object.freeze({...saved, progress});
    }
    const [question, result, syllabus, existingProgress, practice] = await Promise.all([
      this.getFillInTheBlanksQuestionById(completion.passageId),
      this.getFillInTheBlanksResult(scope),
      requireSyllabusTopic(this.getSyllabusById, syllabusId, topicId),
      repository.getByTopic(scope.studentId, syllabusId, topicId),
      this.getFillInTheBlanksPracticeById(scope.practiceId),
    ]);
    assertAccess();
    if (!question) throw new Error("The completed fill-in-the-blanks's question could not be found.");
    if (!practice || practice.passageId !== completion.passageId || (completion.type && completion.type !== practice.type)) throw new Error("The completed practice definition does not match its assignment.");
    if (!result || result.score !== completion.score || !Number.isFinite(result.score) || result.score < 0 || result.score > 100) {
      throw new Error("A matching graded fill-in-the-blanks result is required before level assessment.");
    }
    const base = {...scope, syllabusId, topicId, practiceType: "fillInTheBlanks", score: result.score,
      assessed: false, levelChanged: false, reachedLevelIds: [], previousLevelId: existingProgress?.currentLevelId ?? null,
      levelId: existingProgress?.currentLevelId ?? null, isFrameworkCompleted: existingProgress?.isFrameworkCompleted === true,
      progress: existingProgress};
    if (practice.type === PRE_ASSESSMENT) {
      const assessmentFrameworkId = practice.assessmentFrameworkId;
      if (existingProgress) return Object.freeze({...base, assessmentFrameworkId, reason: "pre-assessment-already-applied"});
      const snapshot = placementSnapshot(practice.preAssessmentConfig, assessmentFrameworkId);
      if (snapshot.preAssessment.difficultyLevel !== question.difficulty) throw new Error("The pre-assessment passage has a different difficulty from its placement settings.");
      const placement = await this.calculatePreAssessmentLevel({assessmentFrameworkId, score: result.score, frameworkSnapshot: snapshot});
      assertAccess();
      const completedAt = toDate(completion.completedAt, "pre-assessment completion time");
      const progress = new StudentAssessmentTopicProgress({studentId: scope.studentId, syllabusId, topicId,
        initialLevel: {levelId: placement.levelId, setAt: completedAt}, currentLevelId: placement.levelId,
        isFrameworkCompleted: placement.isEndLevel, levelHistory: {[placement.levelId]: completedAt}});
      const assessment = {...scope, syllabusId, topicId, assessmentFrameworkId, assessed: true, reason: null,
        practiceType: "fillInTheBlanks", assessmentType: PRE_ASSESSMENT, score: result.score, assessedAt: completedAt,
        previousLevelId: null, levelId: placement.levelId, levelName: placement.levelName, levelChanged: true,
        reachedLevelIds: placement.reachedLevelIds, isFrameworkCompleted: placement.isEndLevel};
      const outcome = await repository.saveAssessmentProgress({progress, assessment, expectedProgress: null, assertAccess,
        sourceCompletion: {practiceType: "fillInTheBlanks", passageId: completion.passageId, completedAt}});
      return Object.freeze({...outcome.assessment, progress: outcome.progress});
    }
    const assessmentFrameworkId = resolveTopicAssessmentFrameworkId(syllabus, {topicId, language: question.language});
    if (!assessmentFrameworkId) return Object.freeze({...base, reason: "assessment-framework-not-configured"});
    if (existingProgress?.isFrameworkCompleted) return Object.freeze({...base, assessmentFrameworkId, reason: "framework-already-completed"});
    const level = existingProgress
      ? await this.getAssessmentLevelCriteria({assessmentFrameworkId, levelId: existingProgress.currentLevelId})
      : await this.calculateAssessmentProgression({assessmentFrameworkId, currentLevelId: null, scores: []});
    assertAccess();
    if (level.frameworkType !== "fillInTheBlanks") return Object.freeze({...base, assessmentFrameworkId, reason: "fill-in-the-blanks-assessment-framework-required"});
    if (String(level.criteria?.difficultyLevel).toLowerCase() !== question.difficulty) return Object.freeze({...base, assessmentFrameworkId, reason: "practice-difficulty-mismatch"});
    const currentLevelId = existingProgress?.currentLevelId ?? level.previousLevelId;
    // Each saved fill-in-the-blanks assessment belongs to exactly one level. Arrival order and
    // equal completion timestamps cannot cause an fill-in-the-blanks to count at two levels.
    const scores = await repository.listAssessmentScores({...scope, syllabusId, topicId, assessmentFrameworkId, levelId: currentLevelId, practiceType: "fillInTheBlanks"});
    assertAccess();
    scores.push(result.score);
    const progression = await this.calculateAssessmentProgression({assessmentFrameworkId, currentLevelId, scores});
    assertAccess();
    const completedAt = toDate(completion.completedAt, "fill-in-the-blanks completion time");
    const historyDates = Object.values(existingProgress?.levelHistory ?? {}).map(date => toDate(date, "level entry time").getTime());
    const enteredAt = new Date(Math.max(completedAt.getTime(), ...historyDates));
    const levelHistory = {...existingProgress?.levelHistory};
    if (!existingProgress) levelHistory[currentLevelId] = enteredAt;
    if (progression.levelChanged) levelHistory[progression.levelId] = enteredAt;
    const progress = new StudentAssessmentTopicProgress({studentId: scope.studentId, syllabusId, topicId,
      initialLevel: existingProgress?.initialLevel ?? {levelId: currentLevelId, setAt: enteredAt},
      currentLevelId: progression.levelId, isFrameworkCompleted: progression.isEndLevel, levelHistory});
    const assessment = {...scope, syllabusId, topicId, assessmentFrameworkId, assessed: true, reason: null,
      practiceType: "fillInTheBlanks", assessmentType: ASSESSMENT, score: result.score, assessedAt: completedAt,
      previousLevelId: progression.previousLevelId, levelId: progression.levelId, levelName: progression.levelName,
      levelChanged: progression.levelChanged, reachedLevelIds: progression.reachedLevelIds,
      isFrameworkCompleted: progression.isEndLevel, eligiblePracticeCount: scores.length,
      qualifyingPracticeCount: progression.qualifyingPracticeCount,
      requiredPracticeCount: progression.criteria.requiredPracticeCount, minimumScore: progression.criteria.minimumScore};
    const outcome = await repository.saveAssessmentProgress({progress, assessment, expectedProgress: existingProgress, assertAccess,
      sourceCompletion: {practiceType: "fillInTheBlanks", passageId: completion.passageId, completedAt}});
    assertAccess();
    return Object.freeze({...outcome.assessment, progress: outcome.progress});
  }
}

module.exports = {AssessStudentFillInTheBlanksPractice};
