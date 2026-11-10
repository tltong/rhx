const {test} = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
test("student and guardian mutation rules block bypasses and enforce school/stream/subject alignment", {skip: !process.env.FIRESTORE_EMULATOR_HOST}, async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/);
  const project = "demo-rhx-student-profile-rules", base = `http://${host}`;
  const prefix = `/v1/projects/${project}/databases/(default)/documents`;
  function token(uid) {
    const part = input => Buffer.from(JSON.stringify(input)).toString("base64url"), now = Math.floor(Date.now() / 1000);
    return part({alg: "none", typ: "JWT"}) + "." + part({iss: `https://securetoken.google.com/${project}`, aud: project, auth_time: now, user_id: uid, sub: uid,
      iat: now, exp: now + 3600, email: uid + "@example.test", email_verified: true, firebase: {identities: {}, sign_in_provider: "custom"}}) + ".";
  }
  function value(input) {
    if (input === null) return {nullValue: null};
    if (typeof input === "string") return {stringValue: input};
    if (typeof input === "boolean") return {booleanValue: input};
    if (Number.isInteger(input)) return {integerValue: String(input)};
    return {mapValue: {fields: fields(input)}};
  }
  function fields(input) {return Object.fromEntries(Object.entries(input).map(([key, input]) => [key, value(input)]));}
  async function raw(method, url, data, uid = "owner") {
    const response = await fetch(base + url, {method, headers: {"content-type": "application/json", ...(uid ? {authorization: "Bearer " + (uid === "owner" ? "owner" : token(uid))} : {})},
      ...(data === undefined ? {} : {body: JSON.stringify(data)})});
    return {status: response.status, body: await response.json()};
  }
  const request = (method, target, input, uid = "owner") => raw(method, prefix + "/" + target, input === undefined ? undefined : {fields: fields(input)}, uid);
  const upload = await raw("PUT", `/emulator/v1/projects/${project}:securityRules`, {rules: {files: [{name: "firestore.rules", content: fs.readFileSync(path.resolve(__dirname, "../firestore.rules"), "utf8")} ]}});
  assert.equal(upload.status, 200, JSON.stringify(upload.body));
  await raw("DELETE", `/emulator/v1/projects/${project}/databases/(default)/documents`);
  const year = new Date().getUTCFullYear();
  for (const [target, data] of Object.entries({
    "siteAdmins/admin@example.test": {},
    "students/student": {name: "Student", username: "student", country: "Malaysia", level: "primary", schoolId: "school", yearOfRegistration: year, standardAtYearOfRegistration: "4"},
    "students/legacy": {name: "Legacy", country: "Malaysia", level: "primary", yearOfRegistration: year, standardAtYearOfRegistration: "4"},
    "guardianStudentLinks/guardian__student": {guardianId: "guardian", studentId: "student", state: "active"},
    "schools/school": {streamId: "new-stream"}, "streams/new-stream": {country: "Malaysia", level: "primary"}, "streams/old-stream": {country: "Malaysia", level: "primary"},
    "streams/new-stream/years/4": {syllabuses: {math: {language: "English"}}},
    "streams/new-stream/years/5": {syllabuses: {math: {language: "Malay"}}},
    "studentUsernames/student": {studentId: "student"}, "studentCredentialChanges/job": {studentId: "student", status: "pending"},
  })) assert.equal((await request("PATCH", target, data)).status, 200);
  for (const uid of [null, "stranger", "guardian", "student", "admin"]) {
    for (const [method, target, data] of [["PATCH", "students/student", {name: "Bypass"}], ["PATCH", "students/new", {name: "Bypass"}], ["DELETE", "students/student"],
      ["PATCH", "guardianStudentLinks/guardian__student", {state: "active"}], ["PATCH", "guardianStudentLinks/stranger__student", {guardianId: "stranger", studentId: "student", state: "active"}]]) {
      const result = await request(method, target, data, uid); assert.equal(result.status, 403, `${uid} ${method} ${target}: ${JSON.stringify(result.body)}`);
    }
    for (const target of ["studentUsernames/student", "studentCredentialChanges/job"]) {
      for (const method of ["GET", "PATCH"]) assert.equal((await request(method, target, method === "PATCH" ? {} : undefined, uid)).status, 403);
    }
  }
  for (const uid of [null, "guardian", "stranger"]) assert.equal((await request("GET", "students/student", undefined, uid)).status, 403);
  for (const uid of ["student", "admin"]) assert.equal((await request("GET", "students/student", undefined, uid)).status, 200);
  assert.equal((await request("GET", "guardianStudentLinks/guardian__student", undefined, "guardian")).status, 200);
  for (const uid of ["student", "guardian", "admin"]) {
    assert.equal((await request("PATCH", "streamSubscriptions/student", {streamId: "old-stream"}, uid)).status, 403);
    assert.equal((await request("PATCH", "streamSubscriptions/student", {streamId: "new-stream"}, uid)).status, 200);
    assert.equal((await request("DELETE", "streamSubscriptions/student", undefined, uid)).status, 403);
    const valid = await request("PATCH", "syllabusSubscriptions/student/syllabuses/math", {state: "active", language: "English"}, uid);
    assert.equal(valid.status, 200, JSON.stringify(valid.body));
    assert.equal((await request("PATCH", "syllabusSubscriptions/student/syllabuses/math", {state: "active", language: "Malay"}, uid)).status, 403);
    assert.equal((await request("PATCH", "syllabusSubscriptions/student/syllabuses/foreign", {state: "active", language: "English"}, uid)).status, 403);
  }
  assert.equal((await request("PATCH", "streamSubscriptions/legacy", {streamId: "old-stream"}, "legacy")).status, 200);
  await request("PATCH", "students/student", {country: "Malaysia", level: "primary", schoolId: "school", yearOfRegistration: year - 5, standardAtYearOfRegistration: "1", academicReferenceYear: year, gradeAtReferenceYear: 5});
  assert.equal((await request("PATCH", "syllabusSubscriptions/student/syllabuses/math", {state: "active", language: "Malay"}, "student")).status, 200);
  assert.equal((await request("PATCH", "syllabusSubscriptions/student/syllabuses/math", {state: "active", language: "English"}, "student")).status, 403);
});
