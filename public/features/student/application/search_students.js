import { studentLevels } from "../../../config/firebase/student_schema.js";
import { toStudentSummary } from "../domain/student_summary.js";

const STUDENT_LEVEL_VALUES = new Set(Object.values(studentLevels));

function normalizeName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function requireInteger(value, name, minimum, maximum) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }

  return number;
}

export class SearchStudents {
  constructor(studentRepository, now = () => new Date()) {
    this.studentRepository = studentRepository;
    this.now = now;
  }

  async execute({ name, yearOfBirth, level, grade }) {
    const normalizedName = normalizeName(name);

    if (!normalizedName) {
      throw new Error("name is required.");
    }

    const currentDate = this.now();

    if (!(currentDate instanceof Date) || Number.isNaN(currentDate.getTime())) {
      throw new Error("now must return a valid date.");
    }

    const normalizedYearOfBirth = requireInteger(
      yearOfBirth,
      "yearOfBirth",
      1900,
      currentDate.getFullYear()
    );
    const normalizedLevel = String(level ?? "").trim().toLowerCase();
    const normalizedGrade = requireInteger(grade, "grade", 1, 6);

    if (!STUDENT_LEVEL_VALUES.has(normalizedLevel)) {
      throw new Error(`level must be one of: ${[...STUDENT_LEVEL_VALUES].join(", ")}.`);
    }

    const students = await this.studentRepository.list();

    return students.reduce((matches, student) => {
      if (
        normalizeName(student.name) !== normalizedName
        || Number(student.yearOfBirth) !== normalizedYearOfBirth
        || String(student.level).toLowerCase() !== normalizedLevel
      ) {
        return matches;
      }

      try {
        const summary = toStudentSummary(student, () => currentDate);

        if (summary.grade === normalizedGrade) {
          matches.push(summary);
        }
      } catch (error) {
        console.warn(`Skipping invalid student ${student.id} during search.`, error);
      }

      return matches;
    }, []);
  }
}
