// Check the actual Firestore rules using local JWTs and an isolated demo project.
const {test} = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");

test("subject assessment configuration and generated-content access rules", {skip: !process.env.FIRESTORE_EMULATOR_HOST}, async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/);
  const project = "demo-rhx-subject-config-rules";
  const base = `http://${host}`;
  const prefix = `projects/${project}/databases/(default)/documents/`;
  function token(uid, verified = true) {
    const part = value => Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    return part({alg: "none", typ: "JWT"}) + "." + part({iss: `https://securetoken.google.com/${project}`, aud: project,
      auth_time: now, user_id: uid, sub: uid, iat: now, exp: now + 3600, email: uid + "@example.test", email_verified: verified,
      firebase: {identities: {}, sign_in_provider: "custom"}}) + ".";
  }
  function value(input) {
    if (input === null) return {nullValue: null};
    if (typeof input === "string") return {stringValue: input};
    if (Number.isInteger(input)) return {integerValue: String(input)};
    if (typeof input === "number") return {doubleValue: input};
    if (Array.isArray(input)) return {arrayValue: {values: input.map(value)}};
    return {mapValue: {fields: fields(input)}};
  }
  function fields(input) {return Object.fromEntries(Object.entries(input).map(([key, item]) => [key, value(item)]));}
  async function request(method, url, data, uid = "owner", verified = true) {
    const response = await fetch(base + url, {method, headers: {"content-type": "application/json",
      ...(uid ? {authorization: "Bearer " + (uid === "owner" ? "owner" : token(uid, verified))} : {})},
    ...(data === undefined ? {} : {body: JSON.stringify(data)})});
    return {status: response.status, body: await response.json()};
  }
  const configPath = "subjectAssessmentConfigs/english/languages/english";
  const data = {syllabusId: "english", language: "English", languageKey: "english", version: 1,
    topics: [{topicId: "reading", questionType: "normal", totalCount: 3, difficultyCounts: {easy: 1, medium: 1, hard: 1}}],
    createdBy: "admin", updatedBy: "admin"};
  async function commit(uid, changes = {}, {create = false, verified = true, target = configPath, timestamps = {}} = {}) {
    const updateFields = {...fields({...data, ...changes}), ...timestamps};
    const transforms = [{fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME"}];
    if (create) transforms.push({fieldPath: "createdAt", setToServerValue: "REQUEST_TIME"});
    return request("POST", `/v1/projects/${project}/databases/(default)/documents:commit`, {writes: [{
      update: {name: prefix + target, fields: updateFields}, updateTransforms: transforms,
      currentDocument: {exists: !create},
    }]}, uid, verified);
  }
  assert.equal((await request("DELETE", `/emulator/v1/projects/${project}/databases/(default)/documents`)).status, 200);
  const uploaded = await request("PUT", `/emulator/v1/projects/${project}:securityRules`, {rules: {files: [{
    name: "firestore.rules", content: fs.readFileSync(path.join(__dirname, "../firestore.rules"), "utf8"),
  }]}});
  assert.equal(uploaded.status, 200, JSON.stringify(uploaded.body));
  assert.equal((await request("PATCH", "/v1/" + prefix + "siteAdmins/admin@example.test", {fields: {}})).status, 200);
  assert.equal((await request("PATCH", "/v1/" + prefix + "syllabuses/english", {fields: fields({languages: ["English", "Tamil"]})})).status, 200);
  for (const uid of [null, "student", "guardian"]) {
    const result = await commit(uid, {}, {create: true});
    assert.equal(result.status, 403, JSON.stringify(result.body));
  }
  assert.equal((await commit("admin", {}, {create: true, verified: false})).status, 403);
  const created = await commit("admin", {}, {create: true});
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const read = await request("GET", "/v1/" + prefix + configPath, undefined, "admin");
  assert.equal(read.status, 200);
  for (const uid of [null, "student", "guardian"]) {
    assert.equal((await request("GET", "/v1/" + prefix + configPath, undefined, uid)).status, 403);
    assert.equal((await commit(uid, {version: 2}, {timestamps: {createdAt: read.body.fields.createdAt}})).status, 403);
  }
  const timestamps = {createdAt: read.body.fields.createdAt};
  assert.equal((await commit("admin", {}, {timestamps})).status, 403, "A stale version is rejected");
  assert.equal((await commit("admin", {version: 2, createdBy: "other"}, {timestamps})).status, 403);
  assert.equal((await commit("admin", {version: 2, updatedBy: "other"}, {timestamps})).status, 403);
  assert.equal((await commit("admin", {version: 2, syllabusId: "other"}, {timestamps})).status, 403);
  assert.equal((await commit("admin", {version: 2, language: "French"}, {timestamps})).status, 403);
  assert.equal((await commit("admin", {version: 2, topics: []}, {timestamps})).status, 403);
  const updated = await commit("admin", {version: 2}, {timestamps});
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal((await request("DELETE", "/v1/" + prefix + configPath, undefined, "admin")).status, 403);
  async function commitSettings(uid, changes = {}, {create = false, verified = true, timestamps = {}, target = "subjectAssessmentSettings/config"} = {}) {
    const transforms = [{fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME"}];
    if (create) transforms.push({fieldPath: "createdAt", setToServerValue: "REQUEST_TIME"});
    return request("POST", `/v1/projects/${project}/databases/(default)/documents:commit`, {writes: [{
      update: {name: prefix + target, fields: {...fields({intervalDays: 7, version: 1, createdBy: "admin", updatedBy: "admin", ...changes}), ...timestamps}},
      updateTransforms: transforms, currentDocument: {exists: !create},
    }]}, uid, verified);
  }
  for (const uid of [null, "student", "guardian"]) assert.equal((await commitSettings(uid, {}, {create: true})).status, 403);
  assert.equal((await commitSettings("admin", {}, {create: true, verified: false})).status, 403);
  for (const intervalDays of [0, -1, 1.5, "7", Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal((await commitSettings("admin", {intervalDays}, {create: true})).status, 403, "Invalid global interval: " + intervalDays);
  }
  assert.equal((await commitSettings("admin", {}, {create: true})).status, 200);
  const settingsRead = await request("GET", "/v1/" + prefix + "subjectAssessmentSettings/config", undefined, "admin");
  assert.equal(settingsRead.status, 200);
  const settingsTimestamps = {createdAt: settingsRead.body.fields.createdAt};
  for (const uid of [null, "student", "guardian"]) {
    assert.equal((await request("GET", "/v1/" + prefix + "subjectAssessmentSettings/config", undefined, uid)).status, 403);
    assert.equal((await commitSettings(uid, {version: 2}, {timestamps: settingsTimestamps})).status, 403);
  }
  for (const changes of [{version: 1}, {version: 2, createdBy: "other"}, {version: 2, updatedBy: "other"}, {version: 2, syllabusId: "english"}, {version: 2, intervalDays: 0}]) {
    assert.equal((await commitSettings("admin", changes, {timestamps: settingsTimestamps})).status, 403);
  }
  assert.equal((await commitSettings("admin", {version: 2, intervalDays: 14}, {timestamps: settingsTimestamps})).status, 200);
  for (const changes of [{repeatMode: "none", intervalDays: 14}, {repeatMode: "never"}, {repeatMode: null}, {repeatMode: "interval", intervalDays: null}]) {
    assert.equal((await commitSettings("admin", {version: 3, ...changes}, {timestamps: settingsTimestamps})).status, 403, "Reject contradictory repeat settings");
  }
  for (const uid of [null, "student", "guardian"]) {
    assert.equal((await commitSettings(uid, {version: 3, repeatMode: "none", intervalDays: null}, {timestamps: settingsTimestamps})).status, 403);
  }
  assert.equal((await commitSettings("admin", {version: 3, repeatMode: "none", intervalDays: null}, {timestamps: settingsTimestamps})).status, 200);
  assert.equal((await commitSettings("admin", {version: 3, repeatMode: "interval", intervalDays: 7}, {timestamps: settingsTimestamps})).status, 403, "No-repeat settings retain stale-version protection");
  assert.equal((await commitSettings("admin", {version: 4, repeatMode: "interval", intervalDays: 7}, {timestamps: settingsTimestamps})).status, 200);
  assert.equal((await request("DELETE", "/v1/" + prefix + "subjectAssessmentSettings/config", undefined, "admin")).status, 403);
  for (const target of ["subjectAssessmentSettings/english", "subjectAssessmentSettings/config/overrides/student"]) {
    assert.equal((await request("PATCH", "/v1/" + prefix + target, {fields: fields({intervalDays: 1})}, "admin")).status, 403, "No per-subject or student override path");
  }
  for (const suffix of ["subjectAssessmentConfigs/english", configPath + "/unexpected/document"]) {
    assert.equal((await request("PATCH", "/v1/" + prefix + suffix, {fields: fields({test: "forged"})}, "student")).status, 403,
      "The existing fallback rule cannot open new configuration paths");
  }
  assert.equal((await request("PATCH", "/v1/" + prefix + "guardianStudentLinks/guardian__student", {fields: fields({state: "active"})})).status, 200);
  assert.equal((await request("PATCH", "/v1/" + prefix + "students/student", {fields: fields({name: "Student", schoolId: null})})).status, 200);
  const subscriptionPath = "/v1/" + prefix + "syllabusSubscriptions/student/syllabuses/english";
  for (const uid of ["student", "guardian", "admin"]) {
    assert.equal((await request("PATCH", subscriptionPath, {fields: fields({state: "active", language: "English"})}, uid)).status, 200);
    assert.equal((await request("GET", subscriptionPath, undefined, uid)).status, 200);
    assert.equal((await request("DELETE", subscriptionPath, undefined, uid)).status, 403, "Unsubscribe must use the backend cleanup operation");
    assert.equal((await request("DELETE", "/v1/" + prefix + "syllabusSubscriptions/student", undefined, uid)).status, 403);
  }
  for (const uid of [null, "stranger"]) {
    assert.equal((await request("PATCH", subscriptionPath, {fields: fields({state: "active", language: "English"})}, uid)).status, 403);
    assert.equal((await request("GET", subscriptionPath, undefined, uid)).status, 403);
  }
  const subjectStatePath = "/v1/" + prefix + "subjectAssessmentGenerations/_students/students/student/subjects/english";
  for (const status of ["pending", "running"]) {
    assert.equal((await request("PATCH", subjectStatePath, {fields: fields({cleanup: {id: "cleanup", status}})})).status, 200);
    for (const uid of ["student", "guardian", "admin"]) {
      assert.equal((await request("PATCH", subscriptionPath, {fields: fields({state: "active", language: "English"})}, uid)).status, 403, "Cleanup fences subscription recreation");
    }
  }
  assert.equal((await request("PATCH", subjectStatePath, {fields: fields({cleanup: {id: "cleanup", status: "completed"}})})).status, 200);
  assert.equal((await request("PATCH", subscriptionPath, {fields: fields({state: "inactive", language: "English"})}, "guardian")).status, 200, "Deactivation remains available after cleanup");
  const protectedPaths = {
    assessment: "subjectAssessments/paper",
    item: "subjectAssessments/paper/items/00000001",
    marking: "subjectAssessments/paper/private/00000001",
    job: "subjectAssessmentGenerations/request",
    draft: "subjectAssessmentGenerations/request/items/00000001",
    lock: "subjectAssessmentGenerations/_locks/students/student",
    subjectState: "subjectAssessmentGenerations/_students/students/student/subjects/english",
    unsubscribeReceipt: "subjectAssessmentGenerations/_students/students/student/subjects/english/unsubscriptions/request",
    cleanupManifest: "subjectAssessmentGenerations/_students/students/student/subjects/english/cleanupItems/target",
    usage: "studentSubjectAssessmentUsage/student/items/content-key",
    unpublished: "subjectAssessments/unpublished/items/00000001",
    submission: "subjectAssessmentSubmissions/paper",
    answers: "subjectAssessmentSubmissions/paper/items/00000001",
    markingJob: "subjectAssessmentSubmissions/paper/private/marking",
    markingCheckpoint: "subjectAssessmentSubmissions/paper/private/marking/items/00000001",
    result: "subjectAssessmentResults/paper",
    resultItem: "subjectAssessmentResults/paper/items/00000001",
    stagedResult: "subjectAssessmentResults/unpublished/items/00000001",
  };
  for (const [kind, itemPath] of Object.entries(protectedPaths)) {
    assert.equal((await request("PATCH", "/v1/" + prefix + itemPath, {fields: fields({studentId: "student", test: kind})})).status, 200);
    for (const uid of [null, "student", "guardian", "stranger", "admin"]) {
      const readable = ["assessment", "item", "submission", "answers", "result", "resultItem"].includes(kind);
      const expected = kind !== "stagedResult" && (uid === "admin" || readable && ["student", "guardian"].includes(uid)) ? 200 : 403;
      const response = await request("GET", "/v1/" + prefix + itemPath, undefined, uid);
      assert.equal(response.status, expected, `${kind}/${uid}: ${JSON.stringify(response.body)}`);
      assert.equal((await request("PATCH", "/v1/" + prefix + itemPath, {fields: fields({studentId: "student", test: "forged"})}, uid)).status, 403, `Client write blocked: ${kind}/${uid}`);
      assert.equal((await request("DELETE", "/v1/" + prefix + itemPath, undefined, uid)).status, 403);
    }
  }
});
