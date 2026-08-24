function requireInteger(value, name) {
  const number = Number(value);

  if (!Number.isInteger(number)) {
    throw new Error(`${name} must be an integer.`);
  }

  return number;
}

export function resolveStudentCurrentGrade(student, now = () => new Date()) {
  const registrationYear = requireInteger(
    student.yearOfRegistration,
    "yearOfRegistration"
  );
  const registrationGrade = requireInteger(
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

export function toStudentSummary(student, now = () => new Date()) {
  return {
    id: student.id,
    name: student.name,
    yearOfBirth: Number(student.yearOfBirth),
    level: student.level,
    grade: resolveStudentCurrentGrade(student, now)
  };
}
