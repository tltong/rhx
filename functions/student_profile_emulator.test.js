const {test} = require("node:test"), assert = require("node:assert/strict");
test("student profile and credentials preserve the UID across real Auth/Firestore operations", {skip: !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST}, async t => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
  assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
  assert.match(process.env.GCLOUD_PROJECT || "", /^demo-/);
  const {getFirestoreDb, getFirebaseApp} = require("./utils/firebase/firebase_ops"), db = getFirestoreDb();
  const {getAuth} = require("firebase-admin/auth"), auth = getAuth(getFirebaseApp());
  const {createStudentProfileFeature} = require("./features/student/student_profile_module");
  const year = new Date().getUTCFullYear();
  const recent = Math.floor(Date.now() / 1000);
  const admin = {auth: {uid: "admin"}}, student = {auth: {uid: "student", token: {auth_time: recent}}}, guardian = {auth: {uid: "guardian", token: {auth_time: recent}}};
  let milliseconds = Date.now(), failFinish = false, failAuthBefore = false, failAuthAfter = false, authUpdates = 0;
  const wrappedDb = new Proxy(db, {get(target, key) {
    if (key === "runTransaction") return execute => target.runTransaction(tx => execute(new Proxy(tx, {get(transaction, method) {
      if (method === "update") return (reference, data, ...args) => {
        if (failFinish && Object.hasOwn(data, "username")) throw Object.assign(new Error("Injected Firestore outage"), {code: "test-unavailable"});
        return transaction.update(reference, data, ...args);
      };
      return typeof transaction[method] === "function" ? transaction[method].bind(transaction) : transaction[method];
    }})));
    return typeof target[key] === "function" ? target[key].bind(target) : target[key];
  }});
  const adapter = {getUser: uid => auth.getUser(uid), verifyIdToken: token => auth.verifyIdToken(token, true), getUserByEmail: email => auth.getUserByEmail(email), updateUser: async (uid, changes) => {
    assert.equal(uid, "student", "Credential changes always target the original student UID");
    if (failAuthBefore) {failAuthBefore = false; throw Object.assign(new Error("Injected Auth outage"), {code: "auth/network-request-failed"});}
    authUpdates++; const result = await auth.updateUser(uid, changes);
    if (failAuthAfter) {failAuthAfter = false; throw Object.assign(new Error("Injected lost Auth response"), {code: "auth/network-request-failed"});}
    return result;
  }};
  const api = createStudentProfileFeature({getDb: () => wrappedDb, auth: adapter, now: () => new Date(milliseconds)});
  async function seed() {
    failFinish = false; failAuthBefore = false; failAuthAfter = false; authUpdates = 0; milliseconds = Date.now();
    for (const url of [`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`,
      `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/accounts`]) assert.equal((await fetch(url, {method: "DELETE"})).status, 200);
    await auth.createUser({uid: "admin", email: "admin@example.test", emailVerified: true, password: "test-password"});
    await auth.createUser({uid: "student", email: "original@rhx.com", password: "123456"});
    await auth.createUser({uid: "guardian", email: "guardian@example.test", emailVerified: true, password: "test-password"});
    const batch = db.batch();
    const docs = {
      "siteAdmins/admin@example.test": {}, "guardians/guardian": {name: "Guardian"},
      "guardianStudentLinks/guardian__student": {guardianId: "guardian", studentId: "student", state: "active"},
      "students/student": {name: "Original Student", username: "original", email: "original@rhx.com", pin: "123456", country: "Malaysia", level: "primary",
        yearOfBirth: 2016, yearOfRegistration: year - 1, registrationDate: new Date(`${year - 1}-01-01`), standardAtYearOfRegistration: "3", extraProfileData: {preserve: true}},
      "syllabusScope/Malaysia": {country: "Malaysia", levels: {primary: {4: true, 5: true}, secondary: {1: true}}},
      "schoolStates/state": {country: "Malaysia", status: "active"}, "schoolLocalities/town": {country: "Malaysia", stateId: "state", status: "active"},
      "schools/school": {name: "New School", country: "Malaysia", level: "primary", status: "active", stateId: "state", localityId: "town", streamId: "new-stream"},
      "schools/same-stream-school": {name: "Another School", country: "Malaysia", level: "primary", status: "active", stateId: "state", localityId: "town", streamId: "new-stream"},
      "streams/old-stream": {country: "Malaysia", level: "primary", name: "Old"}, "streams/new-stream": {country: "Malaysia", level: "primary", name: "New"},
      "streams/new-stream/years/4": {year: 4, syllabuses: {"new-english": {language: "English"}, math: {language: "Malay"}}},
      "streams/new-stream/years/5": {year: 5, syllabuses: {"new-english": {language: "English"}}},
      "syllabuses/new-english": {country: "Malaysia", level: "primary", languages: ["English"]}, "syllabuses/math": {country: "Malaysia", level: "primary", languages: ["Malay"]},
      "streamSubscriptions/student": {streamId: "old-stream"}, "syllabusSubscriptions/student": {},
      "syllabusSubscriptions/student/syllabuses/old-english": {state: "active", language: "English", subscribedAt: new Date(`${year - 1}-01-01`)},
      "syllabusSubscriptions/student/syllabuses/math": {state: "active", language: "Malay", subscribedAt: new Date(`${year - 1}-01-01`)},
      "subscriptions/student": {applicationStatus: "active", subscriptionType: "paid", preserve: true},
      "studentPractices/student/assignedPractices/finished": {completed: true}, "subjectAssessmentResults/old-result": {studentId: "student", syllabusId: "old-english", score: 80},
    };
    for (const [path, value] of Object.entries(docs)) batch.set(db.doc(path), value);
    await batch.commit();
  }
  const rename = (changes = {}) => api.changeStudentUsername({studentId: "student", username: "new.name", expectedVersion: 0, requestId: "rename-1", ...changes}, admin);
  async function signIn(email, password) {
    const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,
      {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({email, password, returnSecureToken: true})});
    return {ok: response.ok, data: await response.json()};
  }
  await t.test("profile reads are redacted and unrelated or disabled actors cannot edit", async () => {
    await seed();
    for (const context of [student, guardian, admin]) assert.equal((await api.getStudentProfile({studentId: "student"}, context)).pin, undefined);
    await assert.rejects(api.getStudentProfile({studentId: "student"}, {}), {code: "unauthenticated"});
    await auth.createUser({uid: "unrelated", email: "unrelated@example.test", password: "test-password"});
    await assert.rejects(api.updateStudentProfile({studentId: "student", expectedVersion: 0, changes: {name: "Forbidden"}}, {auth: {uid: "unrelated"}}), {code: "permission-denied"});
    await auth.updateUser("admin", {emailVerified: false});
    await assert.rejects(api.resetStudentPin({studentId: "student", expectedVersion: 0, newPin: "654321"}, admin), {code: "permission-denied"});
  });
  await t.test("linked guardians edit credentials without verification while student self-service requires recent sign-in", async () => {
    for (const context of [student, guardian]) {
      await seed();
      const edited = await api.updateStudentProfile({studentId: "student", expectedVersion: 0, changes: {name: "Allowed edit"}}, context);
      assert.equal(edited.profileVersion, 1);
      const olderSession = {auth: {uid: context.auth.uid, token: {auth_time: recent - 86400}}};
      if (context === student) {
        await assert.rejects(api.resetStudentPin({studentId: "student", expectedVersion: 1, newPin: "654321"}, olderSession), {code: "failed-precondition"});
        await assert.rejects(api.changeStudentUsername({studentId: "student", expectedVersion: 1, username: "role.changed", requestId: "role-change"}, olderSession), {code: "failed-precondition"});
      }
      const editingSession = context === guardian ? olderSession : context;
      assert.equal((await api.resetStudentPin({studentId: "student", expectedVersion: 1, newPin: "654321"}, editingSession)).pinChanged, true);
      assert.equal((await api.changeStudentUsername({studentId: "student", expectedVersion: 1, username: "role.changed", requestId: "role-change"}, editingSession)).status, "completed");
      assert.equal((await signIn("role.changed@rhx.com", "654321")).data.localId, "student");
    }
    await db.doc("guardianStudentLinks/guardian__student").update({state: "inactive"});
    await assert.rejects(api.updateStudentProfile({studentId: "student", expectedVersion: 2, changes: {name: "Forbidden"}}, guardian), {code: "permission-denied"});
    await assert.rejects(api.resetStudentPin({studentId: "student", expectedVersion: 2, newPin: "111111"}, guardian), {code: "permission-denied"});
    await assert.rejects(api.changeStudentUsername({studentId: "student", expectedVersion: 2, username: "forbidden", requestId: "revoked"}, guardian), {code: "permission-denied"});
    await db.doc("guardianStudentLinks/guardian__student").update({state: "active"});
    assert.equal((await api.resetStudentPin({studentId: "student", expectedVersion: 2, newPin: "222222"}, {auth: {uid: "guardian"}})).pinChanged, true);
    await auth.updateUser("guardian", {disabled: true});
    await assert.rejects(api.resetStudentPin({studentId: "student", expectedVersion: 2, newPin: "111111"}, guardian), {code: "permission-denied"});
  });
  await t.test("profile edits patch fields, reject credential overrides, and detect concurrent edits", async () => {
    await seed();
    for (const changes of [{pin: "654321"}, {email: "forged@rhx.com"}, {username: "forged"}, {id: "different"}, {yearOfRegistration: 2026}]) {
      await assert.rejects(api.updateStudentProfile({studentId: "student", expectedVersion: 0, changes}, admin), {code: "invalid-argument"});
    }
    const outcomes = await Promise.allSettled(["First", "Second"].map(name => api.updateStudentProfile({studentId: "student", expectedVersion: 0, changes: {name, yearOfBirth: 2017}}, admin)));
    assert.equal(outcomes.filter(item => item.status === "fulfilled").length, 1);
    assert.equal(outcomes.find(item => item.status === "rejected").reason.code, "aborted");
    const saved = (await db.doc("students/student").get()).data();
    assert.equal(saved.profileVersion, 1); assert.equal(saved.yearOfRegistration, year - 1); assert.equal(saved.pin, undefined);
    assert.deepEqual(saved.extraProfileData, {preserve: true}); assert.equal((await auth.getUser("student")).uid, "student");
  });
  await t.test("school changes atomically align streams and reconcile subjects without deleting history", async () => {
    await seed();
    const saved = await api.updateStudentProfile({studentId: "student", expectedVersion: 0, changes: {schoolId: "school"}}, admin);
    assert.equal(saved.schoolId, "school"); assert.equal((await db.doc("streamSubscriptions/student").get()).data().streamId, "new-stream");
    assert.equal((await db.doc("syllabusSubscriptions/student/syllabuses/old-english").get()).data().state, "inactive");
    assert.equal((await db.doc("syllabusSubscriptions/student/syllabuses/new-english").get()).data().state, "active");
    assert.equal((await db.doc("syllabusSubscriptions/student/syllabuses/math").get()).data().subscribedAt.toDate().getUTCFullYear(), year - 1);
    for (const path of ["guardianStudentLinks/guardian__student", "subscriptions/student", "studentPractices/student/assignedPractices/finished", "subjectAssessmentResults/old-result"]) assert.equal((await db.doc(path).get()).exists, true, path);
    await db.doc("syllabusSubscriptions/student/syllabuses/manual").set({state: "active", language: "English"});
    await api.updateStudentProfile({studentId: "student", expectedVersion: 1, changes: {schoolId: "same-stream-school"}}, admin);
    assert.equal((await db.doc("syllabusSubscriptions/student/syllabuses/manual").get()).data().state, "active", "A same-stream school change does not resubscribe subjects");
  });
  await t.test("invalid schools and unconfigured streams cannot partially change the student", async () => {
    await seed();
    for (const patch of [{status: "archived"}, {country: "Singapore"}, {level: "secondary"}, {streamId: null}, {streamId: "missing"}]) {
      await db.doc("schools/school").set({name: "School", country: "Malaysia", level: "primary", status: "active", stateId: "state", localityId: "town", streamId: "new-stream", ...patch});
      await assert.rejects(api.updateStudentProfile({studentId: "student", expectedVersion: 0, changes: {schoolId: "school"}}, admin), {code: "failed-precondition"});
    }
    assert.equal((await db.doc("students/student").get()).data().profileVersion, undefined);
    assert.equal((await db.doc("streamSubscriptions/student").get()).data().streamId, "old-stream");
  });
  await t.test("grade corrections use a new academic reference and retain original registration fields", async () => {
    await seed();
    const saved = await api.updateStudentProfile({studentId: "student", expectedVersion: 0, changes: {schoolId: "school", currentGrade: 5}}, admin);
    assert.equal(saved.academicReferenceYear, year); assert.equal(saved.gradeAtReferenceYear, 5);
    assert.equal(saved.yearOfRegistration, year - 1); assert.equal(saved.standardAtYearOfRegistration, "3");
    assert.equal((await api.getStudentSummary({studentId: "student"}, guardian)).grade, 5);
  });
  await t.test("username changes update the existing Auth account and profile, including a real new login", async () => {
    await seed(); const result = await rename();
    assert.equal(result.status, "completed"); assert.equal(result.studentId, "student");
    const saved = (await db.doc("students/student").get()).data(), account = await auth.getUser("student");
    assert.equal(saved.username, "new.name"); assert.equal(saved.email, account.email); assert.equal(account.uid, "student");
    assert.equal(saved.pin, undefined); assert.equal(saved.profileVersion, 1); assert.equal(saved.credentialChangeId, undefined);
    assert.equal((await signIn("new.name@rhx.com", "123456")).data.localId, "student");
    assert.equal((await signIn("original@rhx.com", "123456")).ok, false);
    assert.equal((await db.doc("guardianStudentLinks/guardian__student").get()).exists, true);
    assert.equal((await db.doc("subjectAssessmentResults/old-result").get()).exists, true);
    assert.equal((await rename()).status, "completed"); assert.equal(authUpdates, 1, "The same request does not rename twice");
    await assert.rejects(rename({username: "different.name"}), {code: "already-exists"});
  });
  await t.test("an Auth success followed by a Firestore outage remains reserved and safely resumes", async () => {
    await seed(); failFinish = true; const pending = await rename();
    assert.equal(pending.status, "pending"); assert.equal((await auth.getUser("student")).email, "new.name@rhx.com");
    assert.equal((await api.getStudentCredentialChange({studentId: "student"}, student)).operationId, pending.operationId);
    assert.equal((await db.doc("students/student").get()).data().username, "original");
    assert.equal((await db.doc("studentUsernames/new.name").get()).data().status, "reserved");
    await assert.rejects(api.updateStudentProfile({studentId: "student", expectedVersion: 0, changes: {name: "Cannot race"}}, admin), {code: "failed-precondition"});
    failFinish = false;
    assert.equal((await api.retryStudentUsernameChange({studentId: "student", requestId: "rename-1"}, admin)).status, "completed");
    assert.equal(authUpdates, 1, "Recovery detects the already-applied Auth update");
  });
  await t.test("saving the existing username still verifies the Auth identity without replacing the account", async () => {
    await seed();
    assert.equal((await rename({username: "original"})).status, "completed");
    assert.equal(authUpdates, 0); assert.equal((await auth.getUser("student")).email, "original@rhx.com");
    assert.equal((await rename({username: "original"})).status, "completed");
    assert.equal((await db.doc("students/student").get()).data().profileVersion, 1);
  });
  await t.test("a lost Auth response is recovered without applying the email update twice", async () => {
    await seed(); failAuthAfter = true;
    assert.equal((await rename()).status, "pending");
    assert.equal((await api.retryStudentUsernameChange({studentId: "student", requestId: "rename-1"}, admin)).status, "completed");
    assert.equal(authUpdates, 1);
  });
  await t.test("scheduled recovery and expired leases finish interrupted operations", async () => {
    await seed(); failAuthBefore = true; const pending = await rename(); assert.equal(pending.status, "pending");
    await db.doc("studentCredentialChanges/" + pending.operationId).update({status: "processing", leaseToken: "crashed-worker", leaseUntil: new Date(milliseconds - 1), nextAttemptAt: new Date(milliseconds - 1)});
    assert.equal((await api.retryStudentUsernameChanges())[0].status, "completed"); assert.equal(authUpdates, 1);
  });
  await t.test("Auth username collisions fail safely and release only the new reservation", async () => {
    await seed(); await auth.createUser({uid: "other", email: "new.name@rhx.com", password: "123456"});
    const result = await rename(); assert.equal(result.status, "failed");
    assert.equal((await auth.getUser("student")).email, "original@rhx.com");
    assert.equal((await db.doc("students/student").get()).data().credentialChangeId, undefined);
    assert.equal((await db.doc("studentUsernames/new.name").get()).exists, false);
    assert.equal((await db.doc("studentUsernames/original").get()).data().studentId, "student");
  });
  await t.test("concurrent renames and out-of-band changes cannot overwrite an unrelated account", async () => {
    await seed();
    failAuthBefore = true;
    const pending = await rename();
    await assert.rejects(rename({username: "another.name", requestId: "another-request"}), {code: "failed-precondition"});
    await auth.updateUser("student", {email: "external@rhx.com"});
    assert.equal((await api.retryStudentUsernameChange({studentId: "student", requestId: "rename-1"}, admin)).status, "blocked");
    assert.equal((await auth.getUser("student")).email, "external@rhx.com");
    assert.equal((await api.getStudentCredentialChange({studentId: "student", requestId: "rename-1"}, admin)).operationId, pending.operationId);
  });
  await t.test("PIN resets change only the original Auth account and never persist the submitted PIN", async () => {
    await seed();
    await assert.rejects(api.resetStudentPin({studentId: "student", expectedVersion: 0, newPin: "123"}, admin), {code: "invalid-argument"});
    const result = await api.resetStudentPin({studentId: "student", expectedVersion: 0, newPin: "654321"}, admin);
    assert.deepEqual(result, {studentId: "student", pinChanged: true});
    assert.equal((await signIn("original@rhx.com", "654321")).data.localId, "student");
    assert.equal((await signIn("original@rhx.com", "123456")).ok, false);
    const saved = (await db.doc("students/student").get()).data();
    assert.equal(saved.pin, undefined); assert.equal(JSON.stringify(saved).includes("654321"), false);
    assert.equal((await db.collection("studentCredentialChanges").get()).size, 0);
  });
  await t.test("signup finalizes only the authenticated UID and creates no credential copies", async () => {
    await seed(); await auth.createUser({uid: "new-student", email: "signup.name@rhx.com", password: "112233"});
    const input = {studentId: "new-student", name: "New Student", username: "signup.name", country: "Malaysia", level: "primary", yearOfBirth: 2016, standardAtYearOfRegistration: "4"};
    await assert.rejects(api.createStudentProfile(input, admin), {code: "permission-denied"});
    const profile = await api.createStudentProfile(input, {auth: {uid: "new-student"}});
    assert.equal(profile.profileVersion, 1); assert.equal(profile.pin, undefined);
    assert.equal((await db.doc("studentUsernames/signup.name").get()).data().studentId, "new-student");
    assert.equal((await api.isStudentUsernameAvailable({username: "signup.name"})).available, false);
    assert.equal((await api.isStudentUsernameAvailable({username: "available.name"})).available, true);
    assert.equal((await api.createStudentProfile(input, {auth: {uid: "new-student"}})).id, "new-student");
    const first = await api.listStudentProfiles({limit: 1}, admin), second = await api.listStudentProfiles({limit: 1, cursor: first.nextCursor}, admin);
    assert.notEqual(first.items[0].id, second.items[0].id);
    assert.equal((await api.searchStudentProfiles({name: " Original Student ", yearOfBirth: 2016, level: "primary", grade: 4}, guardian))[0].id, "student");
  });
  await t.test("new guardian links require proof of the selected student's actual password login", async () => {
    await seed(); await db.doc("guardianStudentLinks/guardian__student").delete();
    await assert.rejects(api.getStudentSummary({studentId: "student"}, guardian), {code: "permission-denied"});
    const input = {guardianId: "guardian", studentId: "student", relationship: "parent"};
    await assert.rejects(api.linkStudentToGuardian(input, guardian), {code: "failed-precondition"});
    await api.searchStudentProfiles({name: "Original Student", yearOfBirth: 2016, level: "primary", grade: 4}, guardian);
    await assert.rejects(api.linkStudentToGuardian(input, guardian), {code: "failed-precondition"}, "Search details alone cannot grant edit rights");
    await assert.rejects(api.linkStudentToGuardian({...input, studentIdToken: "forged"}, guardian), {code: "permission-denied"});
    const wrongLogin = await signIn("guardian@example.test", "test-password");
    await assert.rejects(api.linkStudentToGuardian({...input, studentIdToken: wrongLogin.data.idToken}, guardian), {code: "permission-denied"});
    const login = await signIn("original@rhx.com", "123456");
    milliseconds += 6 * 60 * 1000;
    await assert.rejects(api.linkStudentToGuardian({...input, studentIdToken: login.data.idToken}, guardian), {code: "permission-denied"}, "Refreshing a token cannot replace a recent student sign-in");
    milliseconds = Date.now();
    assert.equal((await api.linkStudentToGuardian({...input, studentIdToken: login.data.idToken}, guardian)).state, "active");
    assert.equal(JSON.stringify((await db.doc("guardianStudentLinks/guardian__student").get()).data()).includes(login.data.idToken), false);
    await api.updateStudentProfile({studentId: "student", expectedVersion: 0, changes: {yearOfBirth: 2017}}, guardian);
    await api.unlinkStudentFromGuardian({guardianId: "guardian", studentId: "student"}, student);
    await assert.rejects(api.updateStudentProfile({studentId: "student", expectedVersion: 1, changes: {name: "Forbidden"}}, guardian), {code: "permission-denied"});
    await assert.rejects(api.linkStudentToGuardian({...input, guardianId: "different-guardian"}, guardian), {code: "permission-denied"});
  });
});
