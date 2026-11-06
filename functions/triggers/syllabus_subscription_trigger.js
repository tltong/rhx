const {createHash} = require("node:crypto");
const {deepseekApiKey} = require("../deepseek");
const {openaiApiKey} = require("../utils/llm/openai_util");
const {withTopicResetGuard} = require("../utils/student_topic_reset_guard");
const {getAssessmentFrameworkById} = require("../features/assessment_framework/assessment_framework_module");
const {getPracticeById} = require("../features/practice/practice_module");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {getSyllabusById, preAssessmentPracticeTypes, resolveTopicAssessmentFrameworkId} = require("../features/syllabus/syllabus_module");
const {assignPracticeToStudent} = require("../features/student_practice/student_practice_module");
const {getEssayPracticeById} = require("../features/essay_practice/essay_practice_module");
const {getEssayQuestionById} = require("../features/essay_question_generator/essay_question_generator_module");
const {assignEssayPracticeToStudent, getCompletedEssayPractice} = require("../features/student_essay_practice/student_essay_practice_module");
const {SYLLABUS_SUBSCRIPTIONS_COLLECTION, SYLLABUS_SUBSCRIPTION_SYLLABUSES_SUBCOLLECTION} = require("../schema/syllabus_subscription_schema");

const SYLLABUS_SUBSCRIPTION_DOCUMENT = [
  SYLLABUS_SUBSCRIPTIONS_COLLECTION, "{studentId}",
  SYLLABUS_SUBSCRIPTION_SYLLABUSES_SUBCOLLECTION, "{syllabusId}",
].join("/");

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) throw new Error(fieldName + " is required.");
  return value.trim();
}

// Stable per student/syllabus/topic/shared-practice, so duplicate Firestore deliveries do not create attempts.
function subscriptionEssayAttemptId(syllabusId, topicId, practiceId) {
  return "preassessment-" + createHash("sha256").update(JSON.stringify([syllabusId, topicId, practiceId])).digest("hex");
}

async function assignSubscriptionPreAssessmentPractices({
  studentId, syllabusId, language,
} = {}, {
  getSyllabus = getSyllabusById,
  getFramework = getAssessmentFrameworkById,
  assignPractice = assignPracticeToStudent,
  getEssayPractice = getEssayPracticeById,
  getEssayQuestion = getEssayQuestionById,
  assignEssayPractice = assignEssayPracticeToStudent,
  getCompletedEssay = getCompletedEssayPractice,
  getFillInTheBlanksPractice = input => require("../features/fill_in_the_blanks_practice/fill_in_the_blanks_practice_module").getFillInTheBlanksPracticeById(input),
  assignFillInTheBlanksPractice = input => require("../features/student_fill_in_the_blanks_practice_generator/student_fill_in_the_blanks_practice_generator_module").assignInitialStudentFillInTheBlanksPractice(input),
} = {}) {
  const selectedStudentId = requireNonEmptyString(studentId, "studentId");
  const selectedSyllabusId = requireNonEmptyString(syllabusId, "syllabusId");
  const selectedLanguage = requireNonEmptyString(language, "language");
  const syllabus = await getSyllabus(selectedSyllabusId);
  if (!syllabus) throw new Error("Syllabus " + selectedSyllabusId + " was not found.");
  if (!Array.isArray(syllabus.topics) || !syllabus.topics.length) {
    throw new Error("Syllabus " + selectedSyllabusId + " has no topics.");
  }
  const missingTopics = [], normalPracticeIds = new Set(), essayAttachments = [], fillAttachments = [];
  for (const topic of syllabus.topics) {
    const frameworkId = resolveTopicAssessmentFrameworkId(syllabus, {topicId: topic.id, language: selectedLanguage});
    if (!frameworkId) throw new Error("Assessment framework is not configured for " + topic.topicName + " / " + selectedLanguage + ".");
    const framework = await getFramework(frameworkId);
    if (!framework) throw new Error("Topic assessment framework could not be found: " + frameworkId + ".");
    const practice = topic.getPreAssessmentPractice(selectedLanguage);
    if (!practice) {
      missingTopics.push(topic.topicName || topic.id);
      continue;
    }
    const practiceType = practice.practiceType === undefined ? preAssessmentPracticeTypes.NORMAL : practice.practiceType;
    if (!Object.values(preAssessmentPracticeTypes).includes(practiceType)) throw new Error("practiceType must be normal, essay or fillInTheBlanks.");
    if ((framework.frameworkType || "normal") !== practiceType) throw new Error("The attached practice type does not match the framework for " + topic.topicName + ".");
    const practiceId = requireNonEmptyString(practice.practiceId, "practiceId");
    if (practiceType === preAssessmentPracticeTypes.FILL_IN_THE_BLANKS) {
      fillAttachments.push({studentId: selectedStudentId, syllabusId: selectedSyllabusId, topicId: requireNonEmptyString(topic.id, "topicId"), practiceId});
    } else if (practiceType === preAssessmentPracticeTypes.ESSAY) {
      essayAttachments.push({topicId: requireNonEmptyString(topic.id, "topicId"), practiceId});
    } else normalPracticeIds.add(practiceId);
  }
  if (missingTopics.length) {
    throw new Error("No " + selectedLanguage + " pre-assessment practice is configured for: " + missingTopics.join(", ") + ".");
  }

  // Resolve every essay attachment before assigning any practices, including the normal ones.
  const essayAssignments = await Promise.all(essayAttachments.map(async ({topicId, practiceId}) => {
    const practice = await getEssayPractice(practiceId);
    if (!practice) throw new Error("Essay practice " + practiceId + " was not found.");
    const essayQuestionId = requireNonEmptyString(practice.essayQuestionId, "essayQuestionId");
    if (!await getEssayQuestion(essayQuestionId)) throw new Error("Essay question " + essayQuestionId + " was not found.");
    return {
      studentId: selectedStudentId, syllabusId: selectedSyllabusId, topicId,
      essayQuestionId,
      essayPracticeId: subscriptionEssayAttemptId(selectedSyllabusId, topicId, practiceId),
    };
  }));

  for (const attachment of fillAttachments) {
    const definition = await getFillInTheBlanksPractice(attachment.practiceId);
    if (!definition || definition.syllabusId !== attachment.syllabusId || definition.topicId !== attachment.topicId) throw new Error("The attached fill-in-the-blanks practice does not match its topic.");
  }

  function validateCompleted(saved, assignment) {
    if (saved && (!["syllabusId", "topicId"].every(key => saved[key] === assignment[key])
        || (saved.essayQuestionId !== assignment.essayQuestionId && saved.sourceEssayQuestionId !== assignment.essayQuestionId))) {
      throw new Error("The completed essay conflicts with its syllabus attachment.");
    }
    return saved;
  }
  async function assignEssay(assignment) {
    const reference = {studentId: assignment.studentId, essayPracticeId: assignment.essayPracticeId};
    const completed = validateCompleted(await getCompletedEssay(reference), assignment);
    if (completed) return completed;
    try {
      return await assignEssayPractice(assignment);
    } catch (error) {
      // Completion can win the race between the lookup above and the assignment transaction.
      const saved = validateCompleted(await getCompletedEssay(reference), assignment);
      if (saved) return saved;
      throw error;
    }
  }
  return Promise.all([
    ...[...normalPracticeIds].map(practiceId => assignPractice({studentId: selectedStudentId, practiceId})),
    ...essayAssignments.map(assignEssay),
    ...fillAttachments.map(assignFillInTheBlanksPractice),
  ]);
}

const onSyllabusSubscriptionCreated = onDocumentCreated({
  document: SYLLABUS_SUBSCRIPTION_DOCUMENT, region: "us-central1",
  // A newly assigned essay may need content matching the administrator's settings.
  // Keep the existing event delivery policy; no automatic retries are introduced.
  memory: "1GiB", timeoutSeconds: 540, secrets: [deepseekApiKey, openaiApiKey],
}, async event => {
  const subscription = event.data.data();
  await assignSubscriptionPreAssessmentPractices({
    studentId: event.params.studentId, syllabusId: event.params.syllabusId, language: subscription.language,
  }, {
    assignPractice: async input => {
      const practice = await getPracticeById(input.practiceId);
      try {
        return await withTopicResetGuard({studentId: input.studentId, createdAt: event.data.createTime,
          scopes: (practice?.questions ?? []).map(question => ({syllabusId: question.syllabusId, topicId: question.topicId}))},
        () => assignPracticeToStudent(input));
      } catch (error) {if (error.code !== "topic-practice-reset") throw error; return null;}
    },
    assignFillInTheBlanksPractice: async input => {
      try {
        return await withTopicResetGuard({studentId: input.studentId, createdAt: event.data.createTime,
          scopes: [{syllabusId: input.syllabusId, topicId: input.topicId}]}, () =>
          require("../features/student_fill_in_the_blanks_practice_generator/student_fill_in_the_blanks_practice_generator_module").assignInitialStudentFillInTheBlanksPractice(input));
      } catch (error) {if (error.code !== "topic-practice-reset") throw error; return null;}
    },
    assignEssayPractice: async input => {
      try {
        return await withTopicResetGuard({studentId: input.studentId, createdAt: event.data.createTime,
          scopes: [{syllabusId: input.syllabusId, topicId: input.topicId}]}, () => assignEssayPracticeToStudent(input));
      } catch (error) {if (error.code !== "topic-practice-reset") throw error; return null;}
    },
  });
});

module.exports = {assignSubscriptionPreAssessmentPractices, onSyllabusSubscriptionCreated, subscriptionEssayAttemptId};
