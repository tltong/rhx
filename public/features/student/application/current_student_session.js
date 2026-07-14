export class CurrentStudentSession {
  constructor(getStudent) {
    this.getStudent = getStudent;
    this.student = null;
  }

  async load(studentId) {
    if (this.student?.id === studentId) {
      return this.student;
    }

    this.student = await this.getStudent.execute(studentId);

    return this.student;
  }

  get() {
    return this.student;
  }

  clear() {
    this.student = null;
  }
}
