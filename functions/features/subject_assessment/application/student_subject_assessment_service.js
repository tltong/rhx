const {id, problem, sourceKey} = require("../domain/subject_assessment");
const {normalizeStart} = require("../domain/student_subject_assessment");
const {FirestoreStudentSubjectAssessmentRepository} = require("../infrastructure/firestore_student_subject_assessment_repository");
const {authorizeAssessment} = require("../infrastructure/access");
const {listAvailableSyllabusesForStudent} = require("../../syllabus_subscription/syllabus_subscription_module");

class StudentSubjectAssessmentService {
  constructor({repository = new FirestoreStudentSubjectAssessmentRepository(), authorize = authorizeAssessment,
    listSubjects = listAvailableSyllabusesForStudent, createGenerator,
    getHistory, maxRunMs = 60000} = {}) {Object.assign(this, {repository, authorize, listSubjects, createGenerator, getHistory, maxRunMs});}
  async student(context) {
    if (!context?.auth?.uid) throw problem("Sign in with your student account.", "unauthenticated");
    const studentId = id(context.auth.uid, "Student ID"), access = await this.authorize({studentId, write: true}, context);
    return {studentId, access, subjects: await this.repository.subscribedSubjects(studentId, await this.listSubjects(studentId))};
  }
  async overview(context) {
    const {studentId, access, subjects} = await this.student(context), result = await this.repository.overview(studentId, subjects);
    access.assertAccess?.(); return result;
  }
  async start(input, context) {
    const selected = normalizeStart(input), {studentId, access, subjects} = await this.student(context);
    const scope = subjects.find(subject => subject.syllabusId === selected.syllabusId);
    if (!scope) throw problem("This subject is not in your current subscription.", "permission-denied");
    return this.repository.start(studentId, scope, selected.requestId, access);
  }
  async prepareSubscription(input) {
    const studentId = id(input.studentId, "Student ID"), syllabusId = id(input.syllabusId, "Syllabus ID");
    const key = id(input.subscriptionKey, "Subscription version");
    let student;
    try {student = await this.student({auth: {uid: studentId}});}
    catch (error) {
      if (["permission-denied", "auth/user-not-found", "auth/user-disabled"].includes(error.code)) return {status: "skipped", reason: "studentUnavailable"};
      throw error;
    }
    const scope = student.subjects.find(subject => subject.syllabusId === syllabusId);
    if (!scope) return {status: "skipped", reason: "subscriptionUnavailable"};
    const requestId = "subscription-" + await sourceKey(JSON.stringify([studentId, syllabusId, key]));
    return this.repository.start(studentId, scope, requestId, student.access, {automatic: true, subscriptionKey: key});
  }
  async generate(generationId, generationRequest) {
    const job = await this.repository.getJob(id(generationId));
    if (!job || job.entryPoint !== "student" || job.generationRequest !== generationRequest || job.status === "completed" || !await this.repository.isActive(job)) return null;
    const validate = async () => {
      const {subjects, access} = await this.student({auth: {uid: job.studentId}});
      if (!subjects.some(subject => subject.syllabusId === job.syllabusId)) throw problem("The subject subscription is no longer active.", "permission-denied");
      await this.repository.validateSubscription(job);
      if (!await this.repository.isActive(job)) throw problem("This preparation request was replaced.", "generation-request-superseded");
      return access;
    };
    try {
      const getDb = this.repository.getDb;
      const history = this.getHistory ? this.getHistory() : new (require("../../subject_assessment_generator/infrastructure/firestore_student_content_history").FirestoreStudentContentHistory)({getDb});
      const create = this.createGenerator || require("../../subject_assessment_generator/subject_assessment_generator_module").createSubjectAssessmentGenerator;
      const generator = create({getDb, authorize: validate, history: {load: async run => {await validate(); return history.load(run);}}, maxRunMs: this.maxRunMs});
      return await generator.generateSubjectAssessment({studentId: job.studentId, syllabusId: job.syllabusId, language: job.language,
        requestId: generationId, generationRequest});
    } catch (error) {
      if (!["generation-in-progress", "generation-lease-lost", "generation-request-superseded"].includes(error.code)) await this.repository.reject(generationId, generationRequest, error);
      throw error;
    }
  }
}
module.exports = {StudentSubjectAssessmentService};
