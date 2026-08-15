const {
  onDocumentCreated,
} = require("firebase-functions/v2/firestore");
const {
  getSyllabusById,
} = require("../features/syllabus/syllabus_module");
const {
  assignPracticeToStudent,
} = require("../features/student_practice/student_practice_module");
const {
  SYLLABUS_SUBSCRIPTIONS_COLLECTION,
  SYLLABUS_SUBSCRIPTION_SYLLABUSES_SUBCOLLECTION,
} = require("../schema/syllabus_subscription_schema");

const SYLLABUS_SUBSCRIPTION_DOCUMENT = [
  SYLLABUS_SUBSCRIPTIONS_COLLECTION,
  "{studentId}",
  SYLLABUS_SUBSCRIPTION_SYLLABUSES_SUBCOLLECTION,
  "{syllabusId}",
].join("/");

function requireNonEmptyString(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }

  return text;
}

async function assignSubscriptionPreAssessmentPractices({
  studentId,
  syllabusId,
  language,
} = {}, {
  getSyllabus = getSyllabusById,
  assignPractice = assignPracticeToStudent,
} = {}) {
  const normalizedStudentId = requireNonEmptyString(studentId, "studentId");
  const normalizedSyllabusId = requireNonEmptyString(
    syllabusId,
    "syllabusId",
  );
  const normalizedLanguage = requireNonEmptyString(language, "language");
  const syllabus = await getSyllabus(normalizedSyllabusId);

  if (!syllabus) {
    throw new Error(`Syllabus ${normalizedSyllabusId} was not found.`);
  }

  if (!Array.isArray(syllabus.topics) || syllabus.topics.length === 0) {
    throw new Error(`Syllabus ${normalizedSyllabusId} has no topics.`);
  }

  const missingTopics = [];
  const practiceIds = new Set();

  syllabus.topics.forEach((topic) => {
    const practice = topic.getPreAssessmentPractice(normalizedLanguage);

    if (!practice) {
      missingTopics.push(topic.topicName || topic.id);
      return;
    }

    practiceIds.add(practice.practiceId);
  });

  if (missingTopics.length > 0) {
    throw new Error(
      `No ${normalizedLanguage} pre-assessment practice is configured for: `
      + `${missingTopics.join(", ")}.`,
    );
  }

  return Promise.all(
    [...practiceIds].map((practiceId) => assignPractice({
      studentId: normalizedStudentId,
      practiceId,
    })),
  );
}

const onSyllabusSubscriptionCreated = onDocumentCreated(
  {
    document: SYLLABUS_SUBSCRIPTION_DOCUMENT,
    region: "us-central1",
  },
  async (event) => {
    const subscription = event.data.data();

    await assignSubscriptionPreAssessmentPractices({
      studentId: event.params.studentId,
      syllabusId: event.params.syllabusId,
      language: subscription.language,
    });
  },
);

module.exports = {
  assignSubscriptionPreAssessmentPractices,
  onSyllabusSubscriptionCreated,
};