import {resolveTopicAssessmentFrameworkId} from "../../syllabus/syllabus_module.js?v=20261018-topic-framework-v1";
import {
  preAssessmentStates,
  summarizeTopicProgress
} from "../domain/topic_progress_summary.js?v=20261019-essay-level-display-v1";

function requirePositiveInteger(value, fieldName) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }

  return number;
}

function resolveCurrentGrade(student, now) {
  const registrationYear = requirePositiveInteger(
    student.yearOfRegistration,
    "yearOfRegistration"
  );
  const registrationGrade = requirePositiveInteger(
    student.standardAtYearOfRegistration,
    "standardAtYearOfRegistration"
  );
  const currentDate = now();

  if (!(currentDate instanceof Date) || Number.isNaN(currentDate.getTime())) {
    throw new Error("now must return a valid date.");
  }

  const elapsedYears = currentDate.getFullYear() - registrationYear;

  if (elapsedYears < 0) {
    throw new Error("yearOfRegistration cannot be in the future.");
  }

  return registrationGrade + elapsedYears;
}

function findTopicPreAssessment(topic, language) {
  if (typeof topic.getPreAssessmentPractice === "function") {
    return topic.getPreAssessmentPractice(language);
  }

  const languageKey = String(language || "").trim().toLowerCase();

  return Object.values(topic.preAssessmentPractices || {}).find((practice) => (
    String(practice.language || "").trim().toLowerCase() === languageKey
  )) || null;
}

function createMissingSyllabusSummary(subscription) {
  return {
    syllabusId: subscription.syllabusId,
    subject: subscription.syllabusId,
    language: subscription.language,
    readinessScore: null,
    readinessUnavailable: true,
    reliabilityScore: null,
    reliabilityUnavailable: true,
    topics: [],
    error: "Syllabus details could not be loaded."
  };
}

function createTopicKey(syllabusId, topicId) {
  return `${syllabusId}/${topicId}`;
}

function compareCompletedPracticeHistory(first, second) {
  return second.dateCompleted.getTime() - first.dateCompleted.getTime()
    || first.practiceId.localeCompare(second.practiceId);
}

function createCachedPracticeLoader(getPracticeById) {
  const practicePromises = new Map();

  return (practiceId) => {
    if (!practicePromises.has(practiceId)) {
      practicePromises.set(practiceId, getPracticeById(practiceId));
    }

    return practicePromises.get(practiceId);
  };
}

async function readPracticeDifficulty(practice, {
  getQuestionDifficulty,
  preAssessmentPracticeType
}) {
  if (practice.type === preAssessmentPracticeType) {
    return null;
  }

  const firstQuestion = practice.questions?.[0];

  if (!firstQuestion) {
    return null;
  }

  try {
    return await getQuestionDifficulty(firstQuestion);
  } catch {
    return null;
  }
}

async function indexCompletedPractices({
  completions,
  getPracticeById,
  getQuestionDifficulty,
  preAssessmentPracticeType
}) {
  const entries = await Promise.all(completions.map(async (completion) => {
    const practice = await getPracticeById(completion.practiceId);

    if (!practice) {
      return null;
    }

    const topicKeys = new Set((practice.questions || []).map(
      (question) => createTopicKey(question.syllabusId, question.topicId)
    ));

    if (topicKeys.size === 0) {
      return null;
    }

    return {
      topicKeys,
      history: {
        practiceId: completion.practiceId,
        dateCompleted: completion.dateCompleted,
        practiceType: practice.type,
        difficulty: await readPracticeDifficulty(practice, {
          getQuestionDifficulty,
          preAssessmentPracticeType
        }),
        score: completion.score
      }
    };
  }));
  const completedPracticesByTopic = new Map();

  entries.filter(Boolean).forEach(({ topicKeys, history }) => {
    topicKeys.forEach((topicKey) => {
      if (!completedPracticesByTopic.has(topicKey)) {
        completedPracticesByTopic.set(topicKey, []);
      }

      completedPracticesByTopic.get(topicKey).push(history);
    });
  });
  completedPracticesByTopic.forEach((history) => {
    history.sort(compareCompletedPracticeHistory);
  });

  return completedPracticesByTopic;
}

export class GetStudentDashboard {
  constructor({
    getStudentById,
    getStudentStreamSubscription,
    getStreamById,
    listActiveStudentSyllabusSubscriptions,
    getSyllabusById,
    listCompletedPractices,
    listCompletedEssayPractices = async () => ({practices: [], nextCursor: null}),
    getEssayPracticeById = async () => null,
    getEssayResult = async () => null,
    getPracticeById,
    getQuestionDifficulty,
    preAssessmentPracticeType,
    getStudentTopicLevel,
    getReadinessScore,
    getSubjectReadinessScore,
    getTopicReliabilityScore,
    getSubjectReliabilityScore,
    getAssessmentFrameworkById,
    endLevelId,
    now = () => new Date()
  }) {
    this.getStudentById = getStudentById;
    this.getStudentStreamSubscription = getStudentStreamSubscription;
    this.getStreamById = getStreamById;
    this.listActiveStudentSyllabusSubscriptions =
      listActiveStudentSyllabusSubscriptions;
    this.getSyllabusById = getSyllabusById;
    this.listCompletedPractices = listCompletedPractices;
    Object.assign(this, {listCompletedEssayPractices, getEssayPracticeById, getEssayResult});
    this.getPracticeById = getPracticeById;
    this.getQuestionDifficulty = getQuestionDifficulty;
    this.preAssessmentPracticeType = preAssessmentPracticeType;
    this.getStudentTopicLevel = getStudentTopicLevel;
    this.getReadinessScore = getReadinessScore;
    this.getSubjectReadinessScore = getSubjectReadinessScore;
    this.getTopicReliabilityScore = getTopicReliabilityScore;
    this.getSubjectReliabilityScore = getSubjectReliabilityScore;
    this.getAssessmentFrameworkById = getAssessmentFrameworkById;
    this.endLevelId = endLevelId;
    this.now = now;
  }

  async getTopicReadiness(scope) {
    try {
      const readiness = await this.getReadinessScore(scope);
      return {
        readinessScore: readiness?.score ?? null,
        readinessUnavailable: false
      };
    } catch {
      // A readiness read failure must not hide the student's other progress.
      return {readinessScore: null, readinessUnavailable: true};
    }
  }

  async getSubjectReadiness(scope) {
    try {
      const readiness = await this.getSubjectReadinessScore(scope);
      return {
        readinessScore: readiness?.score ?? null,
        readinessUnavailable: false
      };
    } catch {
      return {readinessScore: null, readinessUnavailable: true};
    }
  }

  async getTopicReliability(scope) {
    try {
      const reliability = await this.getTopicReliabilityScore(scope);
      return {
        reliabilityScore: reliability?.score ?? null,
        reliabilityUnavailable: false
      };
    } catch {
      return {reliabilityScore: null, reliabilityUnavailable: true};
    }
  }

  async getSubjectReliability(scope) {
    try {
      const reliability = await this.getSubjectReliabilityScore(scope);
      return {
        reliabilityScore: reliability?.score ?? null,
        reliabilityUnavailable: false
      };
    } catch {
      // Score read failures must leave the student's other progress available.
      return {reliabilityScore: null, reliabilityUnavailable: true};
    }
  }

  async execute(studentId) {
    const student = await this.getStudentById(studentId);

    if (!student) {
      return null;
    }

    const [
      streamSubscription,
      syllabusSubscriptions,
      completedPractices
    ] = await Promise.all([
      this.getStudentStreamSubscription(studentId),
      this.listActiveStudentSyllabusSubscriptions(studentId),
      this.listCompletedPractices({ studentId })
    ]);
    const getPractice = createCachedPracticeLoader(this.getPracticeById);
    const [
      stream,
      completedPracticesByTopic
    ] = await Promise.all([
      streamSubscription
        ? this.getStreamById(streamSubscription.streamId)
        : null,
      indexCompletedPractices({
        completions: completedPractices,
        getPracticeById: getPractice,
        getQuestionDifficulty: this.getQuestionDifficulty,
        preAssessmentPracticeType: this.preAssessmentPracticeType
      })
    ]);
    const essayCompletions = [];
    let essayCursor = null;
    do {
      const page = await this.listCompletedEssayPractices({studentId, limit: 100, cursor: essayCursor});
      essayCompletions.push(...page.practices);
      essayCursor = page.nextCursor;
    } while (essayCursor);
    const resultPromises = new Map();
    const essayPracticePromises = new Map();
    const getEssayResult = questionId => {
      if (!resultPromises.has(questionId)) resultPromises.set(questionId, this.getEssayResult({studentId, questionId}).catch(() => null));
      return resultPromises.get(questionId);
    };
    const getEssayPractice = practiceId => {
      if (!essayPracticePromises.has(practiceId)) essayPracticePromises.set(practiceId, this.getEssayPracticeById(practiceId));
      return essayPracticePromises.get(practiceId);
    };
    await Promise.all(essayCompletions.map(async completion => {
      const key = createTopicKey(completion.syllabusId, completion.topicId);
      const result = await getEssayResult(completion.essayQuestionId);
      const history = completedPracticesByTopic.get(key) || [];
      history.push({practiceId: completion.essayPracticeId, essayQuestionId: completion.essayQuestionId,
        dateCompleted: completion.completedAt, practiceType: "essay", difficulty: null,
        score: result?.answer === completion.essayText ? result.score : null});
      history.sort(compareCompletedPracticeHistory);
      completedPracticesByTopic.set(key, history);
    }));
    const completedPracticeIdSet = new Set(
      completedPractices.map((completion) => completion.practiceId)
    );
    const frameworkPromises = new Map();

    const getFramework = (assessmentFrameworkId) => {
      if (!assessmentFrameworkId) {
        return Promise.resolve(null);
      }

      if (!frameworkPromises.has(assessmentFrameworkId)) {
        frameworkPromises.set(
          assessmentFrameworkId,
          this.getAssessmentFrameworkById(assessmentFrameworkId)
        );
      }

      return frameworkPromises.get(assessmentFrameworkId);
    };

    const syllabuses = await Promise.all(
      syllabusSubscriptions.map(async (subscription) => {
        const syllabus = await this.getSyllabusById(subscription.syllabusId);

        if (!syllabus) {
          return createMissingSyllabusSummary(subscription);
        }

        const [framework, subjectReadiness, subjectReliability] = await Promise.all([
          getFramework(syllabus.assessmentFrameworkId),
          this.getSubjectReadiness({studentId, syllabusId: syllabus.id}),
          this.getSubjectReliability({studentId, syllabusId: syllabus.id})
        ]);
        const topics = await Promise.all((syllabus.topics || []).map(
          async (topic) => {
            const preAssessment = findTopicPreAssessment(
              topic,
              subscription.language
            );
            const topicFrameworkId = resolveTopicAssessmentFrameworkId(syllabus, {topicId: topic.id, language: subscription.language});
            const topicFramework = await getFramework(topicFrameworkId);
            const hasEssayFramework = topicFramework?.frameworkType === "essay";
            const isEssay = hasEssayFramework || preAssessment?.practiceType === "essay";
            const attachedEssay = isEssay && preAssessment?.practiceId ? await getEssayPractice(preAssessment.practiceId) : null;
            const essayCompleted = isEssay && attachedEssay && essayCompletions.some(completion =>
              completion.syllabusId === syllabus.id && completion.topicId === topic.id && completion.essayQuestionId === attachedEssay.essayQuestionId);
            const preAssessmentCompleted = isEssay ? Boolean(essayCompleted) : Boolean(
              preAssessment?.practiceId
              && completedPracticeIdSet.has(preAssessment.practiceId)
            );
            const scope = {studentId, syllabusId: syllabus.id, topicId: topic.id};
            const [currentLevelId, readiness, reliability] = await Promise.all([
              hasEssayFramework || (preAssessmentCompleted && !isEssay) ? this.getStudentTopicLevel(scope) : null,
              this.getTopicReadiness(scope),
              this.getTopicReliability(scope)
            ]);
            const progress = summarizeTopicProgress({
              hasPreAssessment: Boolean(preAssessment?.practiceId),
              preAssessmentCompleted,
              requiresPreAssessment: !hasEssayFramework,
              currentLevelId,
              framework: topicFramework,
              endLevelId: this.endLevelId
            });
            const topicKey = createTopicKey(syllabus.id, topic.id);

            return {
              topicId: topic.id,
              topicName: topic.topicName,
              assessmentFrameworkId: topicFrameworkId,
              frameworkName: topicFramework?.name || null,
              preAssessmentPracticeId: preAssessment?.practiceId || null,
              completedPractices:
                completedPracticesByTopic.get(topicKey) || [],
              ...readiness,
              ...reliability,
              ...progress,
              ...(isEssay && !hasEssayFramework ? {currentLevelName: "Not applicable", nextLevelName: "Not applicable", finalLevelName: "Not applicable", progressPercentage: null} : {})
            };
          }
        ));

        return {
          syllabusId: syllabus.id,
          subject: syllabus.subject,
          language: subscription.language,
          assessmentFrameworkId: syllabus.assessmentFrameworkId,
          frameworkName: framework?.name || null,
          ...subjectReadiness,
          ...subjectReliability,
          topics: topics.sort((first, second) => (
            first.topicName.localeCompare(second.topicName)
          )),
          error: topics.every(topic => topic.assessmentFrameworkId || topic.currentLevelName === "Not applicable") ? null : "Assessment framework is not configured."
        };
      })
    );

    return {
      student: {
        id: student.id,
        name: student.name,
        country: student.country,
        level: student.level,
        currentGrade: resolveCurrentGrade(student, this.now)
      },
      stream: stream
        ? { id: stream.id, name: stream.name }
        : null,
      syllabuses: syllabuses.sort((first, second) => (
        first.subject.localeCompare(second.subject)
      )),
      preAssessmentStates
    };
  }
}

export { resolveCurrentGrade };
