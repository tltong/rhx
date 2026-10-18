import {resolveTopicAssessmentFrameworkId} from "../../syllabus/syllabus_module.js?v=20261018-topic-framework-v1";
import {
  StudentAssessmentTopicProgress
} from "../domain/student_assessment_topic_progress.js?v=20261018-essay-progression-v1";
import {
  getPracticeScope,
  requireFunction,
  requireIdentifier,
  requireSyllabusTopic
} from "./assessment_helpers.js?v=20260822-assessment-progression";

export class AssessPreAssessmentPractice {
  constructor({
    studentAssessmentProgressRepository,
    getStudentSyllabusSubscriptionLanguage = async () => null,
    getSyllabusById,
    calculatePreAssessmentLevel
  } = {}) {
    if (!studentAssessmentProgressRepository) {
      throw new Error("studentAssessmentProgressRepository is required.");
    }

    this.getStudentSyllabusSubscriptionLanguage = getStudentSyllabusSubscriptionLanguage;
    this.studentAssessmentProgressRepository =
      studentAssessmentProgressRepository;
    this.getSyllabusById = requireFunction(
      getSyllabusById,
      "getSyllabusById"
    );
    this.calculatePreAssessmentLevel = requireFunction(
      calculatePreAssessmentLevel,
      "calculatePreAssessmentLevel"
    );
  }

  async execute({ studentId, practice, practiceResult } = {}) {
    const normalizedStudentId = requireIdentifier(studentId, "studentId");
    const { syllabusId, topicId } = getPracticeScope(practice);
    const savedAssessment = await this.studentAssessmentProgressRepository.getPracticeAssessment({
      studentId: normalizedStudentId, practiceId: practiceResult.practiceId,
    });
    if (savedAssessment !== null) {
      if (savedAssessment.syllabusId !== syllabusId || savedAssessment.topicId !== topicId) throw new Error("The saved assessment has a conflicting topic.");
      return Object.freeze({...savedAssessment, progress: await this.studentAssessmentProgressRepository.getByTopic(normalizedStudentId, syllabusId, topicId)});
    }
    const syllabus = await requireSyllabusTopic(
      this.getSyllabusById,
      syllabusId,
      topicId
    );
    const existingProgress =
      await this.studentAssessmentProgressRepository.getByTopic(
        normalizedStudentId,
        syllabusId,
        topicId
      );

    if (existingProgress) {
      return Object.freeze({
        assessed: true,
        reason: "pre-assessment-already-applied",
        studentId: normalizedStudentId,
        practiceId: practiceResult.practiceId,
        practiceType: practice.type,
        score: practiceResult.score,
        syllabusId,
        topicId,
        previousLevelId: existingProgress.currentLevelId,
        levelId: existingProgress.currentLevelId,
        levelName: null,
        levelChanged: false,
        isFrameworkCompleted: existingProgress.isFrameworkCompleted,
        progress: existingProgress
      });
    }

    const questionLanguages = [...new Set(practice.questions.map(question => question.language).filter(Boolean))];
    if (questionLanguages.length > 1) throw new Error("An assessed practice must use one language.");
    const hasOverrides = Object.keys(syllabus.topics.find(topic => topic.id === topicId).assessmentFrameworkIds || {}).length > 0;
    const language = questionLanguages[0] || (hasOverrides ? await this.getStudentSyllabusSubscriptionLanguage(normalizedStudentId, syllabusId) : null);
    const assessmentFrameworkId = requireIdentifier(resolveTopicAssessmentFrameworkId(syllabus, {topicId, language}), "Topic assessment framework ID");
    const levelCalculation = await this.calculatePreAssessmentLevel({
      assessmentFrameworkId,
      score: practiceResult.score
    });
    const progress = new StudentAssessmentTopicProgress({
      studentId: normalizedStudentId,
      syllabusId,
      topicId,
      initialLevel: {
        levelId: levelCalculation.levelId,
        setAt: practiceResult.submittedAt
      },
      currentLevelId: levelCalculation.levelId,
      isFrameworkCompleted: levelCalculation.isEndLevel,
      levelHistory: {
        [levelCalculation.levelId]: practiceResult.submittedAt
      }
    });
    const assessment = {
      assessed: true,
      reason: null,
      studentId: normalizedStudentId,
      practiceId: practiceResult.practiceId,
      practiceType: practice.type,
      score: practiceResult.score,
      syllabusId,
      topicId,
      assessmentFrameworkId,
      previousLevelId: null,
      levelId: levelCalculation.levelId,
      levelName: levelCalculation.levelName,
      levelChanged: true,
      isFrameworkCompleted: levelCalculation.isEndLevel,
    };
    const saved = await this.studentAssessmentProgressRepository.saveAssessmentProgress({
      progress, expectedProgress: existingProgress,
      assessment: {...assessment, assessedAt: practiceResult.submittedAt,
        reachedLevelIds: levelCalculation.reachedLevelIds},
    });
    return Object.freeze({...saved.assessment, progress: saved.progress});
  }
}
