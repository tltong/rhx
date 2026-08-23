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

export class GetStudentDashboard {
  constructor({
    getStudentById,
    getStudentStreamSubscription,
    getStreamById,
    listActiveStudentSyllabusSubscriptions,
    getSyllabusById,
    listCompletedPracticeIds,
    listAssignedPractices,
    getPracticeById,
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
    this.listCompletedPracticeIds = listCompletedPracticeIds;
    this.listAssignedPractices = listAssignedPractices;
    this.getPracticeById = getPracticeById;
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
      completedPracticeIds,
      assignedPractices
    ] = await Promise.all([
      this.getStudentStreamSubscription(studentId),
      this.listActiveStudentSyllabusSubscriptions(studentId),
      this.listCompletedPracticeIds({ studentId }),
      this.listAssignedPractices({ studentId })
    ]);
    const stream = streamSubscription
      ? await this.getStreamById(streamSubscription.streamId)
      : null;
    const completedPracticeIdSet = new Set(completedPracticeIds);
    const nextAssignedPracticeByTopic = await indexNextAssignedPractices({
      assignments: assignedPractices,
      getPracticeById: this.getPracticeById
    });
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

            return {
              topicId: topic.id,
              topicName: topic.topicName,
              preAssessmentPracticeId: preAssessment?.practiceId || null,
              nextAssignedPractice: nextAssignedPracticeByTopic.get(
                createTopicKey(syllabus.id, topic.id)
              ) || null,
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
