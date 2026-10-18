function requireRecord(input, name = "Essay practice input") {
  if (!input || typeof input !== "object" || Array.isArray(input)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw new Error(name + " must be an object.");
  }
  return input;
}

function requireIdentifier(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(name + " is required.");
  const id = value.trim();
  if (id.includes("/") || id === "." || id === ".." || /^__.*__$/.test(id)
      || new TextEncoder().encode(id).length > 1500) {
    throw new Error(name + " is not a valid document identifier.");
  }
  return id;
}

function normalizeReference(input) {
  requireRecord(input);
  return {
    studentId: requireIdentifier(input.studentId, "studentId"),
    essayPracticeId: requireIdentifier(input.essayPracticeId, "essayPracticeId"),
  };
}

function normalizeAssignment(input) {
  requireRecord(input);
  const result = {
    studentId: requireIdentifier(input.studentId, "studentId"),
    essayQuestionId: requireIdentifier(input.essayQuestionId, "essayQuestionId"),
    syllabusId: requireIdentifier(input.syllabusId, "syllabusId"),
    topicId: requireIdentifier(input.topicId, "topicId"),
  };
  if (input.essayPracticeId !== undefined) {
    result.essayPracticeId = requireIdentifier(input.essayPracticeId, "essayPracticeId");
  }
  return result;
}

function normalizeCompletion(input) {
  const reference = normalizeReference(input);
  if (typeof input.essayText !== "string" || !input.essayText.trim()) {
    throw new Error("essayText must be a nonempty string.");
  }
  if (typeof input.timeTakenSeconds !== "number" || !Number.isFinite(input.timeTakenSeconds)
      || input.timeTakenSeconds < 0) {
    throw new Error("timeTakenSeconds must be a finite nonnegative number.");
  }
  // Preserve the student's paragraph breaks and surrounding whitespace.
  return {...reference, essayText: input.essayText, timeTakenSeconds: input.timeTakenSeconds};
}

function requireDate(value, name) {
  const date = typeof value?.toDate === "function" ? value.toDate() : value;
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error(name + " must be a valid timestamp.");
  }
  return new Date(date.getTime());
}

function readAssignment(data, reference) {
  const input = normalizeAssignment({...requireRecord(data, "Stored essay practice"), ...normalizeReference(reference)});
  return Object.freeze({...input, assignedAt: requireDate(data.assignedAt, "assignedAt")});
}

function readCompletion(data, reference) {
  return Object.freeze({
    ...readAssignment(data, reference),
    ...normalizeCompletion({...data, ...reference}),
    completedAt: requireDate(data.completedAt, "completedAt"),
    ...(data.scoring ? {scoring: Object.freeze({status: data.scoring.status})} : {}),
  });
}

function sameAssignment(first, second) {
  return ["essayQuestionId", "syllabusId", "topicId"].every(key => first[key] === second[key]);
}

function normalizeListInput(input) {
  requireRecord(input);
  const criteria = {studentId: requireIdentifier(input.studentId, "studentId")};
  for (const field of ["syllabusId", "topicId"]) {
    if (input[field] !== undefined) criteria[field] = requireIdentifier(input[field], field);
  }
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) {
    throw new Error("limit must be an integer from 1 to 100.");
  }
  return {...criteria, limit: input.limit, cursor: input.cursor};
}

function cursorScope(criteria, kind) {
  if (!["assigned", "completed"].includes(kind)) throw new Error("Invalid essay practice kind.");
  return {kind, studentId: criteria.studentId,
    syllabusId: criteria.syllabusId ?? null, topicId: criteria.topicId ?? null};
}

function encodeCursor(criteria, kind, afterId) {
  return encodeURIComponent(JSON.stringify({
    v: 1, scope: cursorScope(criteria, kind),
    after: requireIdentifier(afterId, "essayPracticeId"),
  }));
}

function decodeCursor(criteria, kind) {
  if (criteria.cursor === undefined || criteria.cursor === null) return null;
  let value;
  try {
    if (typeof criteria.cursor !== "string" || criteria.cursor.length > 20000) throw new Error();
    value = JSON.parse(decodeURIComponent(criteria.cursor));
    requireRecord(value, "cursor");
    if (value.v !== 1 || JSON.stringify(value.scope) !== JSON.stringify(cursorScope(criteria, kind))) throw new Error();
    return requireIdentifier(value.after, "essayPracticeId");
  } catch {
    throw new Error("cursor is invalid or does not match the essay practice search criteria.");
  }
}

export {normalizeReference, normalizeAssignment, normalizeCompletion, readAssignment, readCompletion, sameAssignment, normalizeListInput, encodeCursor, decodeCursor};

