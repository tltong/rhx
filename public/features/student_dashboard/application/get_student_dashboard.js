import {
  preAssessmentStates,
  summarizeTopicProgress
} from "../domain/topic_progress_summary.js?v=20260823-student-dashboard-v1";

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
    topics: [],
    error: "Syllabus details could not be loaded."
  };
}

function createTopicKey(syllabusId, topicId) {
  return `${syllabusId}/${topicId}`;
}

function compareAssignedPractices(first, second) {
  const firstTime = first.practice?.dateGenerated?.getTime?.() || 0;
  const secondTime = second.practice?.dateGenerated?.getTime?.() || 0;

  return firstTime - secondTime
    || first.practiceId.localeCompare(second.practiceId);
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

async function indexNextAssignedPractices({
  assignments,
  getPracticeById
}) {
  const entries = await Promise.all(assignments.map(async (assignment) => ({
    practiceId: assignment.practiceId,
    practice: await getPracticeById(assignment.practiceId)
  })));
  const nextPracticeByTopic = new Map();

  entries.sort(compareAssignedPractices).forEach((entry) => {
    const topicKeys = new Set((entry.practice?.questions || []).map(
      (question) => createTopicKey(question.syllabusId, question.topicId)
    ));

    topicKeys.forEach((topicKey) => {
      if (!nextPracticeByTopic.has(topicKey)) {
        nextPracticeByTopic.set(topicKey, {
          practiceId: entry.practiceId,
          type: entry.practice.type,
          dateGenerated: entry.practice.dateGenerated
        });
      }
    });
  });

  return nextPracticeByTopic;
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
    listAssignedPractices,
    getPracticeById,
    getQuestionDifficulty,
    preAssessmentPracticeType,
    getStudentTopicLevel,
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
    this.listAssignedPractices = listAssignedPractices;
    this.getPracticeById = getPracticeById;
    this.getQuestionDifficulty = getQuestionDifficulty;
    this.preAssessmentPracticeType = preAssessmentPracticeType;
    this.getStudentTopicLevel = getStudentTopicLevel;
    this.getAssessmentFrameworkById = getAssessmentFrameworkById;
    this.endLevelId = endLevelId;
    this.now = now;
  }

  async execute(studentId) {
    const student = await this.getStudentById(studentId);

    if (!student) {
      return null;
    }

    const [
      streamSubscription,
      syllabusSubscriptions,
      completedPractices,
      assignedPractices
    ] = await Promise.all([
      this.getStudentStreamSubscription(studentId),
      this.listActiveStudentSyllabusSubscriptions(studentId),
      this.listCompletedPractices({ studentId }),
      this.listAssignedPractices({ studentId })
    ]);
    const getPractice = createCachedPracticeLoader(this.getPracticeById);
    const [
      stream,
      nextAssignedPracticeByTopic,
      completedPracticesByTopic
    ] = await Promise.all([
      streamSubscription
        ? this.getStreamById(streamSubscription.streamId)
        : null,
      indexNextAssignedPractices({
        assignments: assignedPractices,
        getPracticeById: getPractice
      }),
      indexCompletedPractices({
        completions: completedPractices,
        getPracticeById: getPractice,
        getQuestionDifficulty: this.getQuestionDifficulty,
        preAssessmentPracticeType: this.preAssessmentPracticeType
      })
    ]);
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

        const framework = await getFramework(syllabus.assessmentFrameworkId);
        const topics = await Promise.all((syllabus.topics || []).map(
          async (topic) => {
            const preAssessment = findTopicPreAssessment(
              topic,
              subscription.language
            );
            const preAssessmentCompleted = Boolean(
              preAssessment?.practiceId
              && completedPracticeIdSet.has(preAssessment.practiceId)
            );
            const currentLevelId = preAssessmentCompleted
              ? await this.getStudentTopicLevel({
                studentId,
                syllabusId: syllabus.id,
                topicId: topic.id
              })
              : null;
            const progress = summarizeTopicProgress({
              hasPreAssessment: Boolean(preAssessment?.practiceId),
              preAssessmentCompleted,
              currentLevelId,
              framework,
              endLevelId: this.endLevelId
            });
            const topicKey = createTopicKey(syllabus.id, topic.id);

            return {
              topicId: topic.id,
              topicName: topic.topicName,
              preAssessmentPracticeId: preAssessment?.practiceId || null,
              nextAssignedPractice:
                nextAssignedPracticeByTopic.get(topicKey) || null,
              completedPractices:
                completedPracticesByTopic.get(topicKey) || [],
              ...progress
            };
          }
        ));

        return {
          syllabusId: syllabus.id,
          subject: syllabus.subject,
          language: subscription.language,
          assessmentFrameworkId: syllabus.assessmentFrameworkId,
          frameworkName: framework?.name || null,
          topics: topics.sort((first, second) => (
            first.topicName.localeCompare(second.topicName)
          )),
          error: framework ? null : "Assessment framework is not configured."
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
