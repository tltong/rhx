/** Standalone assessment reads, answer sessions, backend marking and dedicated results. */
const {FirestoreSubjectAssessmentRepository} = require("./infrastructure/firestore_subject_assessment_repository");
const {FirestoreSubjectAssessmentSubmissionRepository} = require("./infrastructure/firestore_subject_assessment_submission_repository");
const {authorizeAssessment} = require("./infrastructure/access");
const {MarkSubjectAssessment} = require("./application/mark_subject_assessment");
const {id, problem, clean} = require("./domain/subject_assessment");
const {SCORING_POLICY, normalizeAnswers} = require("./domain/subject_assessment_submission");
const essay = require("../essay_scoring/essay_scoring_module");
const {markPassage} = require("../fill_in_the_blanks_scoring/application/mark_passage");
const {getFillInTheBlanksScoringConfig} = require("../fill_in_the_blanks_scoring/fill_in_the_blanks_scoring_module");
const {generateLlmText} = require("../../utils/llm/llm_ops");
const {StudentSubjectAssessmentService} = require("./application/student_subject_assessment_service");
const {tutorInput, eligibleTutorItem, tutorQuestionId, tutorQuestion} = require("./domain/subject_assessment_tutor");

function createSubjectAssessmentFeature({repository = new FirestoreSubjectAssessmentRepository(),
  submissions = new FirestoreSubjectAssessmentSubmissionRepository(), authorize = authorizeAssessment,
  loadSettings = async () => clean({policy: SCORING_POLICY, essay: await essay.getEssayScoringConfig() || essay.createDefaultConfiguration(),
    fill: await getFillInTheBlanksScoringConfig()}), scoreEssay = essay.scoreEssaySnapshot, generateText = generateLlmText,
  passageMarker = markPassage, maxRunMs, studentService = new StudentSubjectAssessmentService({authorize}),
  isTopicTutorEnabled = require("../syllabus/syllabus_module").isTopicTutorEnabled} = {}) {
  async function scope(input, context, write = false) {
    const assessmentId = id(typeof input === "string" ? input : input?.assessmentId, "Assessment ID");
    const header = await repository.header(assessmentId);
    if (!header) throw problem("The assessment could not be found.", "not-found");
    const access = await authorize({studentId: header.studentId, write}, context);
    return {assessmentId, access, assessment: await repository.get(assessmentId)};
  }
  const marker = new MarkSubjectAssessment({repository: submissions, assessments: repository, loadSettings, scoreEssay, generateText,
    markPassage: passageMarker, maxRunMs});
  return {
    getStudentSubjectAssessmentOverview: (_input, context) => studentService.overview(context),
    startStudentSubjectAssessment: (input, context) => studentService.start(input, context),
    prepareSubscribedSubjectAssessment: input => studentService.prepareSubscription(input),
    generateStudentSubjectAssessment: (generationId, requestNumber) => studentService.generate(generationId, requestNumber),
    async getSubjectAssessment(input, context) {return (await scope(input, context)).assessment;},
    async listStudentSubjectAssessments(input = {}, context) {
      const studentId = id(input.studentId || context?.auth?.uid, "Student ID");
      await authorize({studentId}, context);
      return repository.list(studentId, {limit: input.limit, after: input.cursor, syllabusId: input.syllabusId});
    },
    async getSubjectAssessmentSession(input, context) {
      const {assessmentId, assessment, access} = await scope(input, context);
      const submission = await submissions.getSubmission(assessmentId);
      if (submission?.status === "submitted") submission.items = normalizeAnswers(assessment, submission.items, {final: true});
      const result = await repository.getResult(assessmentId);
      if (result) {
        const marked = new Map((result.items || []).map(item => [item.position, item])), topics = new Map();
        assessment.items = await Promise.all(assessment.items.map(async item => {
          const visible = {...item, tutorEnabled: false};
          if (!eligibleTutorItem(item, marked.get(item.position))) return visible;
          if (!topics.has(item.topicId)) topics.set(item.topicId, Promise.resolve().then(() => isTopicTutorEnabled(assessment.syllabusId, item.topicId)).then(enabled => enabled === true, () => false));
          visible.tutorEnabled = await topics.get(item.topicId);
          if (visible.tutorEnabled) visible.tutorQuestionId = await tutorQuestionId(assessmentId, item.position);
          return visible;
        }));
      }
      return {assessment, submission, result, canSubmit: access.canSubmit};
    },
    async getSubjectAssessmentTutorQuestion(input, context) {
      const selected = tutorInput(input), header = await repository.header(selected.assessmentId);
      if (!header) throw problem("The assessment could not be found.", "not-found");
      const access = await authorize({studentId: header.studentId}, context);
      const saved = await repository.getTutorItem(selected.assessmentId, selected.position);
      if (!saved || saved.assessment.studentId !== header.studentId || saved.assessment.syllabusId !== header.syllabusId) throw problem("The assessment item could not be found.", "not-found");
      if (!saved.result) throw problem("Wait until the assessment is marked before opening Tutor.", "failed-precondition");
      if (saved.item.position !== selected.position || saved.marked?.position !== selected.position
          || saved.result.studentId !== saved.assessment.studentId || saved.result.syllabusId !== saved.assessment.syllabusId) {
        throw problem("The marked assessment item is inconsistent.", "failed-precondition");
      }
      if (!eligibleTutorItem(saved.item, saved.marked)) throw problem("Tutor review is available only for incorrect or unanswered MCQs.", "failed-precondition");
      const enabled = await isTopicTutorEnabled(saved.assessment.syllabusId, saved.item.topicId);
      access.assertAccess?.();
      return tutorQuestion(saved.assessment, saved.item, saved.marked, enabled);
    },
    async saveSubjectAssessmentAnswers(input, context) {
      const {assessment, access} = await scope(input, context, true);
      return submissions.save(assessment, input, access);
    },
    async submitSubjectAssessment(input, context) {
      const {assessment, access} = await scope(input, context, true);
      return submissions.save(assessment, input, access, {submit: true, settings: await loadSettings()});
    },
    async retrySubjectAssessmentMarking(input, context) {
      const {assessmentId, access} = await scope(input, context, true);
      return submissions.retry(assessmentId, access);
    },
    async getSubjectAssessmentResult(input, context) {
      const {assessmentId} = await scope(input, context);
      return repository.getResult(assessmentId);
    },
    async listStudentSubjectAssessmentResults(input = {}, context) {
      const studentId = id(input.studentId || context?.auth?.uid, "Student ID");
      await authorize({studentId}, context);
      return repository.listResults(studentId, {limit: input.limit, after: input.cursor, syllabusId: input.syllabusId});
    },
    markSubjectAssessmentSubmission: (assessmentId, options) => marker.execute(id(assessmentId, "Assessment ID"), options),
  };
}
module.exports = {...createSubjectAssessmentFeature(), createSubjectAssessmentFeature};
