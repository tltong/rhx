const {FieldValue, FieldPath} = require("firebase-admin/firestore");
const {problem, inputObject, text, id, username, emailForUsername, nameKey, integer, expectedVersion, assertVersion,
  currentGrade, profileView} = require("../domain/student_profile");
const {recheckStudentAccess} = require("../infrastructure/student_profile_access");
function createStudentProfileService({getDb, authorize, now = () => new Date()}) {
  const ref = studentId => getDb().doc("students/" + id(studentId));
  async function read(input, context, summary = false) {
    inputObject(input, ["studentId"]); const studentId = id(input.studentId);
    await authorize({studentId}, context);
    const saved = await ref(studentId).get();
    if (!saved.exists) return null;
    if (summary) {
      const data = saved.data();
      return {id: studentId, name: data.name, yearOfBirth: data.yearOfBirth, level: data.level, grade: currentGrade(data, now())};
    }
    return profileView(saved.data(), studentId);
  }
  async function validateScope(tx, country, level) {
    country = text(country, "country");
    if (!["primary", "secondary"].includes(level)) throw problem("Choose primary or secondary level.");
    const docs = await tx.get(getDb().collection("syllabusScope").where("country", "==", country).limit(1));
    const scope = docs.docs[0]?.data();
    const grades = (scope?.levels ?? scope)?.[level];
    if (!scope || !Object.values(grades || {}).some(Boolean)) throw problem("Country and level must be configured in Syllabus Scope.", "failed-precondition");
    return grades;
  }
  async function createStudentProfile(input, context) {
    inputObject(input, ["studentId", "name", "username", "country", "level", "yearOfBirth", "standardAtYearOfRegistration"]);
    const studentId = id(input.studentId), access = await authorize({studentId, write: true, create: true}, context), date = now();
    // Signup may only finalize the account authenticated by Firebase, including for administrators.
    if (access.uid !== studentId || access.user.email !== emailForUsername(input.username)) throw problem("The profile must belong to the signed-in signup account.", "permission-denied");
    const data = {name: text(input.name, "name"), nameNormalized: nameKey(input.name), username: username(input.username),
      email: emailForUsername(input.username), country: text(input.country, "country"), level: input.level,
      yearOfBirth: integer(input.yearOfBirth, "yearOfBirth", 1900, date.getUTCFullYear()),
      standardAtYearOfRegistration: String(integer(Number(input.standardAtYearOfRegistration), "standardAtYearOfRegistration", 1, 6)),
      yearOfRegistration: date.getUTCFullYear(), registrationDate: date, schoolId: null, profileVersion: 1, updatedAt: date, updatedBy: access.uid};
    return getDb().runTransaction(async tx => {
      const studentRef = ref(studentId), aliasRef = getDb().doc("studentUsernames/" + data.username);
      const [student, alias, matches] = await Promise.all([tx.get(studentRef), tx.get(aliasRef), tx.get(getDb().collection("students").where("username", "==", data.username).limit(1))]);
      const grades = await validateScope(tx, data.country, data.level);
      if (!grades[data.standardAtYearOfRegistration]) throw problem("The selected grade is not available.", "failed-precondition");
      if (student.exists) {
        if (student.data().username !== data.username) throw problem("This account already has a student profile.", "already-exists");
        return profileView(student.data(), studentId);
      }
      if (alias.exists && alias.data().studentId !== studentId) throw problem("Username is already taken or reserved.", "already-exists");
      if (matches.docs.some(doc => doc.id !== studentId)) throw problem("Username is already taken.", "already-exists");
      tx.create(studentRef, data); tx.set(aliasRef, {studentId, status: "active", updatedAt: date});
      return profileView(data, studentId);
    });
  }
  async function updateStudentProfile(input, context) {
    inputObject(input, ["studentId", "expectedVersion", "changes"]);
    const studentId = id(input.studentId), expected = expectedVersion(input);
    const patch = inputObject(input.changes, ["name", "yearOfBirth", "country", "level", "schoolId", "currentGrade"]);
    if (!Object.keys(patch).length) throw problem("Provide at least one profile change.");
    const access = await authorize({studentId, write: true}, context), date = now(), db = getDb();
    return db.runTransaction(async tx => {
      const studentRef = ref(studentId), saved = await tx.get(studentRef);
      await recheckStudentAccess(tx, db, access, studentId);
      if (!saved.exists) throw problem("Student not found.", "not-found");
      const previous = saved.data(); assertVersion(previous, expected);
      const next = {...previous};
      if (patch.name !== undefined) {next.name = text(patch.name, "name"); next.nameNormalized = nameKey(next.name);}
      if (patch.yearOfBirth !== undefined) next.yearOfBirth = integer(patch.yearOfBirth, "yearOfBirth", 1900, date.getUTCFullYear());
      if (patch.country !== undefined) next.country = text(patch.country, "country");
      if (patch.level !== undefined) next.level = patch.level;
      if (patch.currentGrade !== undefined) {
        next.academicReferenceYear = date.getUTCFullYear();
        next.gradeAtReferenceYear = integer(patch.currentGrade, "currentGrade", 1, 6);
      }
      const academic = ["country", "level", "schoolId", "currentGrade"].some(field => patch[field] !== undefined);
      let streamId, desired = new Map(), subscriptions, reconcile = false;
      if (academic) {
        const grades = await validateScope(tx, next.country, next.level), grade = currentGrade(next, date);
        if (!grades[String(grade)]) throw problem("The student's current grade is not configured for this country and level.", "failed-precondition");
        if (patch.schoolId !== undefined) next.schoolId = id(patch.schoolId, "schoolId");
        const schoolId = next.schoolId;
        if (!schoolId) throw problem("Select a school when changing academic details.", "failed-precondition");
        const school = (await tx.get(db.doc("schools/" + id(schoolId, "schoolId")))).data();
        if (!school || school.status !== "active" || school.country !== next.country || school.level !== next.level || !school.streamId) throw problem("Choose an active school with a stream matching the student's country and level.", "failed-precondition");
        const [state, locality, stream, year, current, subscribedStream] = await Promise.all([
          tx.get(db.doc("schoolStates/" + id(school.stateId, "stateId"))), tx.get(db.doc("schoolLocalities/" + id(school.localityId, "localityId"))),
          tx.get(db.doc("streams/" + id(school.streamId, "streamId"))), tx.get(db.doc(`streams/${school.streamId}/years/${grade}`)),
          tx.get(db.collection("syllabusSubscriptions").doc(studentId).collection("syllabuses").limit(201)),
          tx.get(db.doc("streamSubscriptions/" + studentId)),
        ]);
        if (state.data()?.status !== "active" || state.data().country !== next.country || locality.data()?.status !== "active" || locality.data().stateId !== school.stateId || locality.data().country !== next.country) throw problem("The school's parent locations must be active and consistent.", "failed-precondition");
        if (!stream.exists || stream.data().country !== next.country || stream.data().level !== next.level) throw problem("The school stream is unavailable or incompatible.", "failed-precondition");
        reconcile = subscribedStream.data()?.streamId !== school.streamId || next.country !== previous.country || next.level !== previous.level || patch.currentGrade !== undefined;
        if (reconcile && current.size > 200) throw problem("This student's subscriptions require a separate migration.", "failed-precondition");
        subscriptions = new Map(current.docs.map(doc => [doc.id, doc])); streamId = stream.id;
        if (reconcile && !year.exists) throw problem("Configure the school stream for the student's current grade before changing school.", "failed-precondition");
        const assignments = year.data()?.syllabuses || {};
        if (Array.isArray(assignments) || typeof assignments !== "object") throw problem("The stream's year assignments are invalid.", "failed-precondition");
        if (Object.keys(assignments).length > 100) throw problem("The stream has too many syllabus assignments.", "failed-precondition");
        for (const [syllabusId, assignment] of reconcile ? Object.entries(assignments) : []) {
          const language = text(assignment?.language, "syllabus language");
          const syllabus = (await tx.get(db.doc("syllabuses/" + id(syllabusId, "syllabusId")))).data();
          if (!syllabus || syllabus.country !== next.country || syllabus.level !== next.level || !syllabus.languages?.includes(language)) throw problem("A stream syllabus or its language is unavailable.", "failed-precondition");
          const cleanup = (await tx.get(db.doc(`subjectAssessmentGenerations/_students/students/${studentId}/subjects/${syllabusId}`))).data()?.cleanup;
          if (["pending", "running"].includes(cleanup?.status)) throw problem("A syllabus cleanup is running. Retry after it finishes.", "failed-precondition");
          desired.set(syllabusId, language);
        }
      }
      // All reference reads finish before any writes. Patch the existing document to preserve unrelated data.
      const fields = {...(next.name ? {name: next.name, nameNormalized: nameKey(next.name)} : {}), profileVersion: expected + 1,
        updatedAt: date, updatedBy: access.uid, pin: FieldValue.delete()};
      for (const key of ["yearOfBirth", "country", "level", "schoolId", "academicReferenceYear", "gradeAtReferenceYear"]) if (next[key] !== undefined) fields[key] = next[key];
      tx.update(studentRef, fields);
      if (academic) {
        tx.set(db.doc("streamSubscriptions/" + studentId), {streamId}, {merge: true});
        const parent = db.doc("syllabusSubscriptions/" + studentId);
        if (reconcile) tx.set(parent, {}, {merge: true});
        for (const [syllabusId, snapshot] of reconcile ? subscriptions : []) {
          if (!desired.has(syllabusId) && snapshot.data().state === "active") tx.update(snapshot.ref, {state: "inactive", updatedAt: date});
        }
        for (const [syllabusId, language] of desired) {
          const existing = subscriptions.get(syllabusId), data = existing?.data();
          if (!existing) tx.create(parent.collection("syllabuses").doc(syllabusId), {language, state: "active", subscribedAt: date, updatedAt: date});
          else if (data.state !== "active" || data.language !== language) tx.update(existing.ref, {language, state: "active", updatedAt: date});
        }
      }
      tx.create(studentRef.collection("profileChanges").doc(), {changedFields: Object.keys(patch), profileVersion: expected + 1, changedAt: date, changedBy: access.uid,
        ...(academic ? {previousSchoolId: previous.schoolId || null, schoolId: next.schoolId, streamId} : {})});
      return profileView({...next, ...fields}, studentId);
    });
  }
  async function listStudentProfiles(input = {}, context) {
    inputObject(input, ["limit", "cursor"]); await authorize({administratorOnly: true}, context);
    const limit = integer(input.limit ?? 50, "limit", 1, 100);
    let query = getDb().collection("students").orderBy(FieldPath.documentId());
    if (input.cursor) query = query.startAfter(id(input.cursor, "cursor"));
    const docs = (await query.limit(limit + 1).get()).docs, items = docs.slice(0, limit).map(doc => profileView(doc.data(), doc.id));
    return {items, nextCursor: docs.length > limit ? items.at(-1).id : null};
  }
  async function searchStudentProfiles(input, context) {
    inputObject(input, ["name", "yearOfBirth", "level", "grade"]); await authorize({lookup: true}, context);
    const name = nameKey(input.name), birth = integer(input.yearOfBirth, "yearOfBirth", 1900, now().getUTCFullYear()), grade = integer(input.grade, "grade", 1, 6);
    if (!["primary", "secondary"].includes(input.level)) throw problem("Choose primary or secondary level.");
    const docs = await getDb().collection("students").where("yearOfBirth", "==", birth).where("level", "==", input.level).limit(501).get();
    if (docs.size > 500) throw problem("This student lookup requires an administrator to narrow the results.", "resource-exhausted");
    const results = docs.docs.flatMap(doc => {
      const data = doc.data();
      if (!data.name || nameKey(data.name) !== name) return [];
      try {return currentGrade(data, now()) === grade ? [{id: doc.id, name: data.name, yearOfBirth: data.yearOfBirth, level: data.level, grade}] : [];}
      catch {return [];}
    });
    return results;
  }
  return {getStudentProfile: (input, context) => read(input, context), getStudentSummary: (input, context) => read(input, context, true),
    createStudentProfile, updateStudentProfile, listStudentProfiles, searchStudentProfiles};
}
module.exports = {createStudentProfileService};
