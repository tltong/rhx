import {
  resolveStudentCurrentGrade
} from "../domain/student_summary.js";

function requireText(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }

  return text;
}

export class GetStudentAcademicScope {
  constructor(studentRepository, now = () => new Date()) {
    this.studentRepository = studentRepository;
    this.now = now;
  }

  async execute(studentId) {
    const student = await this.studentRepository.getById(studentId);

    if (!student) {
      return null;
    }

    return {
      studentId: requireText(student.id, "studentId"),
      country: requireText(student.country, "student country"),
      level: requireText(student.level, "student level").toLowerCase(),
      year: resolveStudentCurrentGrade(student, this.now)
    };
  }
}
