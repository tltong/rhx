const {FieldValue} = require("firebase-admin/firestore");
const {problem, inputObject, id, username, emailForUsername, expectedVersion, assertVersion, operationId, operationView} = require("../domain/student_profile");
const {recheckStudentAccess} = require("../infrastructure/student_profile_access");
const PERMANENT_AUTH_ERRORS = new Set(["auth/email-already-exists", "auth/invalid-email", "auth/user-not-found", "auth/operation-not-allowed"]);
const LEASE_MS = 10 * 60 * 1000;
function createStudentCredentialsService({getDb, authorize, auth, now = () => new Date(), uuid = () => globalThis.crypto.randomUUID()}) {
  const jobRef = operation => getDb().doc("studentCredentialChanges/" + id(operation, "operationId"));
  async function isStudentUsernameAvailable(input) {
    inputObject(input, ["username"]); const name = username(input.username), db = getDb();
    const [reservation, profiles] = await Promise.all([db.doc("studentUsernames/" + name).get(), db.collection("students").where("username", "==", name).limit(1).get()]);
    if (reservation.exists || !profiles.empty) return {available: false};
    try {await auth.getUserByEmail(emailForUsername(name)); return {available: false};}
    catch (error) {if (error.code === "auth/user-not-found") return {available: true}; throw error;}
  }
  async function begin(input, context) {
    inputObject(input, ["studentId", "username", "expectedVersion", "requestId"]);
    const studentId = id(input.studentId), name = username(input.username), requestId = id(input.requestId, "requestId"), expected = expectedVersion(input);
    const access = await authorize({studentId, write: true, credential: true}, context), operation = operationId(studentId, requestId), db = getDb();
    await db.runTransaction(async tx => {
      const studentRef = db.doc("students/" + studentId), operationRef = jobRef(operation);
      const [saved, previous] = await Promise.all([tx.get(studentRef), tx.get(operationRef)]);
      await recheckStudentAccess(tx, db, access, studentId);
      if (previous.exists) {
        if (previous.data().studentId !== studentId || previous.data().username !== name || previous.data().expectedVersion !== expected) throw problem("This request ID was used for a different username change.", "already-exists");
        return;
      }
      if (!saved.exists) throw problem("Student not found.", "not-found");
      const student = saved.data(); assertVersion(student, expected);
      const oldUsername = username(student.username), oldEmail = student.email;
      if (oldEmail !== emailForUsername(oldUsername)) throw problem("The student's login email requires administrator repair before renaming.", "failed-precondition");
      const newRef = db.doc("studentUsernames/" + name), oldRef = db.doc("studentUsernames/" + oldUsername);
      const [reserved, old, matches] = await Promise.all([tx.get(newRef), tx.get(oldRef), tx.get(db.collection("students").where("username", "==", name).limit(2))]);
      if ((reserved.exists && reserved.data().studentId !== studentId) || matches.docs.some(doc => doc.id !== studentId)) throw problem("Username is already taken or reserved.", "already-exists");
      if (old.exists && old.data().studentId !== studentId) throw problem("The existing username mapping requires repair.", "failed-precondition");
      const date = now();
      tx.create(operationRef, {studentId, requestId, username: name, email: emailForUsername(name), oldUsername, oldEmail, expectedVersion: expected,
        requestedBy: access.uid, status: "pending", createdAt: date, updatedAt: date,
        nextAttemptAt: date, attempts: 0, leaseToken: null, leaseUntil: null, errorCode: null});
      tx.set(newRef, {studentId, operationId: operation, status: "reserved", updatedAt: date});
      if (!old.exists && oldUsername !== name) tx.create(oldRef, {studentId, status: "active", updatedAt: date});
      tx.update(studentRef, {credentialChangeId: operation, pin: FieldValue.delete()});
    });
    return operation;
  }
  async function claim(operation) {
    return getDb().runTransaction(async tx => {
      const saved = await tx.get(jobRef(operation));
      if (!saved.exists) throw problem("Username change not found.", "not-found");
      const job = saved.data(), date = now();
      if (["completed", "failed", "blocked"].includes(job.status)) return null;
      if (job.leaseUntil?.toMillis() > +date) return null;
      const student = await tx.get(getDb().doc("students/" + job.studentId));
      if (!student.exists || student.data().credentialChangeId !== operation || (student.data().profileVersion || 0) !== job.expectedVersion) {
        tx.update(saved.ref, {status: "blocked", errorCode: "profile-conflict", updatedAt: date, leaseToken: null, leaseUntil: null});
        return null;
      }
      const token = uuid();
      tx.update(saved.ref, {status: "processing", attempts: (job.attempts || 0) + 1, leaseToken: token,
        leaseUntil: new Date(+date + LEASE_MS), nextAttemptAt: new Date(+date + LEASE_MS), updatedAt: date});
      return {...job, operationId: operation, leaseToken: token};
    });
  }
  async function finish(job) {
    const db = getDb();
    await db.runTransaction(async tx => {
      const operationRef = jobRef(job.operationId), studentRef = db.doc("students/" + job.studentId);
      const newRef = db.doc("studentUsernames/" + job.username), oldRef = db.doc("studentUsernames/" + job.oldUsername);
      const [saved, student, reservation, old] = await Promise.all([tx.get(operationRef), tx.get(studentRef), tx.get(newRef), tx.get(oldRef)]);
      if (saved.data()?.status === "completed") return;
      if (saved.data()?.leaseToken !== job.leaseToken) throw problem("The username worker was replaced.", "aborted");
      if (!student.exists || student.data().credentialChangeId !== job.operationId || (student.data().profileVersion || 0) !== job.expectedVersion || reservation.data()?.operationId !== job.operationId || reservation.data()?.studentId !== job.studentId) throw problem("The pending username change needs administrator repair.", "failed-precondition");
      const date = now();
      tx.update(studentRef, {username: job.username, email: job.email, profileVersion: job.expectedVersion + 1,
        updatedAt: date, updatedBy: job.requestedBy, credentialChangeId: FieldValue.delete(), pin: FieldValue.delete()});
      tx.set(newRef, {studentId: job.studentId, status: "active", updatedAt: date});
      if (old.data()?.studentId === job.studentId && job.oldUsername !== job.username) tx.delete(oldRef);
      tx.update(operationRef, {status: "completed", updatedAt: date, completedAt: date, leaseToken: null, leaseUntil: null, errorCode: null});
      tx.create(studentRef.collection("profileChanges").doc(), {changedFields: ["username", "email"], profileVersion: job.expectedVersion + 1,
        operationId: job.operationId, changedAt: date, changedBy: job.requestedBy});
    });
  }
  async function defer(job, error, {permanent = false, blocked = false} = {}) {
    const db = getDb();
    await db.runTransaction(async tx => {
      const operationRef = jobRef(job.operationId), studentRef = db.doc("students/" + job.studentId), reservationRef = db.doc("studentUsernames/" + job.username);
      const [saved, student, reservation] = await Promise.all([tx.get(operationRef), tx.get(studentRef), tx.get(reservationRef)]);
      if (saved.data()?.leaseToken !== job.leaseToken || saved.data()?.status === "completed") return;
      const date = now(), backoff = Math.min(60 * 60 * 1000, 30000 * 2 ** Math.min(saved.data().attempts || 1, 7));
      tx.update(operationRef, {status: blocked ? "blocked" : permanent ? "failed" : "pending", errorCode: String(error.code || "unavailable").slice(0, 100),
        leaseToken: null, leaseUntil: null, nextAttemptAt: new Date(+date + backoff), updatedAt: date});
      // Release only after a confirmed Auth rejection. Never release a name after an uncertain Auth result.
      if (permanent) {
        if (student.data()?.credentialChangeId === job.operationId) tx.update(studentRef, {credentialChangeId: FieldValue.delete()});
        if (reservation.data()?.operationId === job.operationId) tx.delete(reservationRef);
      }
    });
  }
  async function view(operation) {
    const saved = await jobRef(operation).get();
    if (!saved.exists) throw problem("Username change not found.", "not-found");
    return operationView(saved.data(), operation);
  }
  async function processStudentUsernameChange(operation) {
    const job = await claim(id(operation, "operationId"));
    if (!job) return view(operation);
    try {
      const account = await auth.getUser(job.studentId);
      if (account.disabled) throw problem("The student account is disabled.", "account-disabled");
      if (account.email !== job.email && account.email !== job.oldEmail) throw problem("The Auth email changed outside this request.", "auth-email-conflict");
      if (account.email !== job.email) {
        // The lease is longer than every exported worker's maximum runtime.
        const latest = (await jobRef(operation).get()).data();
        if (latest?.leaseToken !== job.leaseToken) throw problem("The username worker was replaced.", "aborted");
        await auth.updateUser(job.studentId, {email: job.email});
      }
      await finish(job);
    } catch (error) {
      if (["auth-email-conflict", "account-disabled", "failed-precondition"].includes(error.code)) await defer(job, error, {blocked: true});
      else if (PERMANENT_AUTH_ERRORS.has(error.code)) {
        // An Auth timeout or concurrent response can arrive after an email update applied.
        let account;
        try {account = await auth.getUser(job.studentId);} catch {account = null;}
        if (account?.email === job.email) {
          try {await finish(job);} catch (failure) {await defer(job, failure);}
        } else if (account?.email === job.oldEmail || error.code === "auth/user-not-found") await defer(job, error, {permanent: true});
        else await defer(job, error);
      } else await defer(job, error);
    }
    return view(operation);
  }
  async function changeStudentUsername(input, context) {
    const operation = await begin(input, context);
    return processStudentUsernameChange(operation);
  }
  async function getStudentCredentialChange(input, context) {
    inputObject(input, ["studentId", "requestId"]); const studentId = id(input.studentId);
    await authorize({studentId, write: true}, context);
    if (input.requestId === undefined) {
      const student = await getDb().doc("students/" + studentId).get();
      if (!student.exists) throw problem("Student not found.", "not-found");
      return student.data().credentialChangeId ? view(student.data().credentialChangeId) : null;
    }
    return view(operationId(studentId, input.requestId));
  }
  async function retryStudentUsernameChanges() {
    const jobs = await getDb().collection("studentCredentialChanges").where("status", "in", ["pending", "processing"])
      .where("nextAttemptAt", "<=", now()).orderBy("nextAttemptAt").limit(25).get();
    const result = [];
    for (const job of jobs.docs) result.push(await processStudentUsernameChange(job.id));
    return result;
  }
  async function retryStudentUsernameChange(input, context) {
    inputObject(input, ["studentId", "requestId"]); const studentId = id(input.studentId);
    await authorize({studentId, write: true, credential: true}, context);
    const operation = operationId(studentId, input.requestId);
    // A blocked request can be retried after an administrator repairs the external condition.
    await getDb().runTransaction(async tx => {
      const saved = await tx.get(jobRef(operation));
      if (!saved.exists) throw problem("Username change not found.", "not-found");
      if (saved.data().status === "blocked") tx.update(saved.ref, {status: "pending", nextAttemptAt: now()});
    });
    return processStudentUsernameChange(operation);
  }
  async function resetStudentPin(input, context) {
    inputObject(input, ["studentId", "newPin", "expectedVersion"]); const studentId = id(input.studentId), expected = expectedVersion(input);
    if (typeof input.newPin !== "string" || !/^\d{6}$/.test(input.newPin)) throw problem("PIN must be exactly six digits.");
    const access = await authorize({studentId, write: true, credential: true}, context), db = getDb();
    const account = await auth.getUser(studentId);
    if (account.disabled) throw problem("The student account is disabled.", "failed-precondition");
    await db.runTransaction(async tx => {
      const studentRef = db.doc("students/" + studentId), saved = await tx.get(studentRef);
      await recheckStudentAccess(tx, db, access, studentId);
      if (!saved.exists) throw problem("Student not found.", "not-found");
      assertVersion(saved.data(), expected);
      // Delete the obsolete copy first; it is never used as an authentication authority.
      tx.update(studentRef, {pin: FieldValue.delete()});
    });
    await auth.updateUser(studentId, {password: input.newPin});
    // Audit only identifiers; the submitted PIN is never persisted or logged.
    console.info("Student PIN reset", {studentId, updatedBy: access.uid});
    return {studentId, pinChanged: true};
  }
  return {isStudentUsernameAvailable, changeStudentUsername, getStudentCredentialChange, retryStudentUsernameChange,
    processStudentUsernameChange, retryStudentUsernameChanges, resetStudentPin};
}
module.exports = {createStudentCredentialsService};
