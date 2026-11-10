const {createHash} = require("node:crypto");
function problem(message, code = "invalid-argument") {return Object.assign(new Error(message), {code});}
function inputObject(input, fields) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw problem("Provide an input object.");
  for (const key of Object.keys(input)) if (!fields.includes(key)) throw problem(`Unexpected field: ${key}.`);
  return input;
}
function text(value, field, max = 200) {
  if (typeof value !== "string") throw problem(`${field} must be text.`);
  const result = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!result || result.length > max) throw problem(`${field} must contain 1–${max} characters.`);
  return result;
}
function id(value, field = "studentId") {
  const result = text(value, field, 128);
  if (result.includes("/") || [".", ".."].includes(result)) throw problem(`${field} is invalid.`);
  return result;
}
function username(value) {
  const result = text(value, "username", 40).toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(result)) throw problem("Username must be 3–40 letters, numbers, dots, underscores or hyphens.");
  return result;
}
function emailForUsername(value) {return username(value) + "@rhx.com";}
function nameKey(value) {return text(value, "name").toLowerCase();}
function integer(value, field, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw problem(`${field} must be an integer between ${min} and ${max}.`);
  return value;
}
function expectedVersion(input) {return integer(input.expectedVersion, "expectedVersion", 0, Number.MAX_SAFE_INTEGER);}
function assertVersion(student, expected) {
  if ((student.profileVersion || 0) !== expected) throw problem("The student changed in another session. Reload before saving.", "aborted");
  if (student.credentialChangeId) throw problem("Finish the pending username change before editing this profile.", "failed-precondition");
}
function currentGrade(student, now) {
  const baseYear = Number(student.academicReferenceYear ?? student.yearOfRegistration);
  const grade = Number(student.gradeAtReferenceYear ?? student.standardAtYearOfRegistration);
  if (!Number.isInteger(baseYear) || !Number.isInteger(grade) || grade < 1 || baseYear > now.getUTCFullYear()) throw problem("Correct the student's academic reference before changing school.", "failed-precondition");
  return integer(grade + now.getUTCFullYear() - baseYear, "currentGrade", 1, 6);
}
function profileView(student, studentId) {
  if (!student) return null;
  const result = {id: studentId, studentId, schoolId: student.schoolId || null, profileVersion: student.profileVersion || 0,
    credentialChangePending: !!student.credentialChangeId};
  for (const field of ["name", "username", "email", "country", "level", "yearOfBirth", "yearOfRegistration", "registrationDate",
    "standardAtYearOfRegistration", "academicReferenceYear", "gradeAtReferenceYear", "updatedAt", "updatedBy"]) {
    if (student[field] !== undefined) result[field] = student[field]?.toDate ? student[field].toDate() : student[field];
  }
  return result;
}
function operationId(studentId, requestId) {return createHash("sha256").update(JSON.stringify([id(studentId), id(requestId, "requestId")])).digest("hex");}
function operationView(job, operationId) {
  return {operationId, studentId: job.studentId, requestId: job.requestId, username: job.username, status: job.status,
    errorCode: job.errorCode || null, updatedAt: job.updatedAt?.toDate?.() || job.updatedAt || null};
}
module.exports = {problem, inputObject, text, id, username, emailForUsername, nameKey, integer, expectedVersion, assertVersion,
  currentGrade, profileView, operationId, operationView};
