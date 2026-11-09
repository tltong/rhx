const {id, problem} = require("../../subject_assessment/domain/subject_assessment");

class UnsubscribeStudentSyllabus {
  constructor({repository, authorize}) {Object.assign(this, {repository, authorize});}
  async execute(input, context) {
    if (!input || typeof input !== "object" || Array.isArray(input)
        || Object.keys(input).some(key => !["studentId", "syllabusId", "requestId"].includes(key))) {
      throw problem("Provide the student, syllabus and request ID only.");
    }
    const scope = {studentId: id(input.studentId, "Student ID"), syllabusId: id(input.syllabusId, "Syllabus ID"), requestId: id(input.requestId, "Request ID")};
    const access = await this.authorize(scope.studentId, context);
    const request = await this.repository.begin(scope, access);
    return this.repository.clean(request);
  }
}

module.exports = {UnsubscribeStudentSyllabus};
