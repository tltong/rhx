const {test} = require("node:test"), assert = require("node:assert/strict");
test("school directory rules require backend access, including for administrators", {skip: !process.env.FIRESTORE_EMULATOR_HOST}, async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/);
  const project = "demo-rhx-school-rules", root = `http://${host}/v1/projects/${project}/databases/(default)/documents`;
  function token(uid) {
    const part = value => Buffer.from(JSON.stringify(value)).toString("base64url"), now = Math.floor(Date.now() / 1000);
    return part({alg: "none", typ: "JWT"}) + "." + part({iss: `https://securetoken.google.com/${project}`, aud: project,
      auth_time: now, user_id: uid, sub: uid, iat: now, exp: now + 3600, email: `${uid}@example.test`, email_verified: true,
      firebase: {identities: {}, sign_in_provider: "custom"}}) + ".";
  }
  async function request(method, path, uid, data) {
    return fetch(root + path, {method, headers: {"content-type": "application/json", ...(uid ? {authorization: "Bearer " + (uid === "owner" ? "owner" : token(uid))} : {})},
      ...(data ? {body: JSON.stringify(data)} : {})});
  }
  await request("PATCH", "/siteAdmins/admin@example.test", "owner", {fields: {}});
  for (const collection of ["schoolStates", "schoolLocalities", "schools"]) {
    assert.equal((await request("PATCH", `/${collection}/saved`, "owner", {fields: {status: {stringValue: "active"}}})).status, 200);
    for (const uid of [null, "student", "admin"]) {
      for (const [method, path, body] of [["GET", `/${collection}/saved`], ["GET", `/${collection}`],
        ["PATCH", `/${collection}/new`, {fields: {}}], ["PATCH", `/${collection}/saved`, {fields: {}}], ["DELETE", `/${collection}/saved`]]) {
        const response = await request(method, path, uid, body);
        assert.equal(response.status, 403, `${uid || "anonymous"} ${method} ${path}: ${await response.text()}`);
      }
    }
  }
});
