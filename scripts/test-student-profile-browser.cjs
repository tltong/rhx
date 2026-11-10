// Browser facade + real callable handler + local Auth/Firestore, with isolated SDK transport.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const fromFunctions = require("node:module").createRequire(path.resolve(__dirname, "../functions/package.json"));
assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):\d+$/);
assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):\d+$/);
assert.match(process.env.GCLOUD_PROJECT || "", /^demo-/);
(async () => {
  const {getFirestoreDb, getFirebaseApp} = fromFunctions("./utils/firebase/firebase_ops"), db = getFirestoreDb();
  const auth = fromFunctions("firebase-admin/auth").getAuth(getFirebaseApp());
  const handler = fromFunctions("./student_profile").createStudentProfileHandler();
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, {method: "DELETE"});
  await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/accounts`, {method: "DELETE"});
  await auth.createUser({uid: "student", email: "original@rhx.com", password: "123456"});
  await db.doc("students/student").set({name: "Student", username: "original", email: "original@rhx.com", pin: "123456", country: "Malaysia", level: "primary",
    yearOfBirth: 2016, yearOfRegistration: new Date().getUTCFullYear() - 1, standardAtYearOfRegistration: "3"});
  const {default: puppeteer} = await import(fromFunctions.resolve("puppeteer"));
  const browser = await puppeteer.launch({executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"]});
  try {
    const page = await browser.newPage(), errors = [], root = path.resolve(__dirname, "../public"), origin = "http://127.0.0.1:8790";
    let sdkLoads = 0, failSdk = true, delayResponse = false, requests = 0;
    page.on("pageerror", error => errors.push(error.message));
    await page.exposeFunction("__profileApi", async (action, input, uid) => {
      requests++;
      const response = await handler({auth: uid ? {uid, token: {auth_time: Math.floor(Date.now() / 1000)}} : null, data: {action, input}});
      if (delayResponse) {delayResponse = false; await new Promise(resolve => setTimeout(resolve, 200));}
      return response;
    });
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = new URL(request.url());
      const js = body => request.respond({status: 200, contentType: "application/javascript", body});
      if (url.origin !== origin) return request.abort();
      if (url.pathname === "/__student_profile_test") return request.respond({status: 200, contentType: "text/html", body: "<!doctype html><title>Student profile API test</title>"});
      if (url.pathname.endsWith("firebase-functions-compat.js")) {
        sdkLoads++;
        if (failSdk) {failSdk = false; return request.abort();}
        return js("window.testApp.functions=()=>({httpsCallable:name=>{if(name!=='studentProfile')throw new Error('Wrong callable');return async({action,input})=>({data:await window.__profileApi(action,input,window.testUser?.uid)});}});");
      }
      if (url.pathname.endsWith("/firebase_ops.js")) return js("export const getFirebaseApp=()=>window.testApp;");
      if (url.pathname.endsWith("/firebase_auth.js")) return js("export const requireCurrentFirebaseAuthUser=()=>{if(!window.testUser)throw new Error('No authenticated user');return window.testUser;};");
      const file = path.resolve(root, "." + url.pathname);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !file.endsWith(".js")) return request.abort();
      return js(fs.readFileSync(file, "utf8"));
    });
    await page.goto(origin + "/__student_profile_test");
    await page.evaluate(async () => {
      window.testApp = {}; window.testUser = {uid: "student"};
      window.profileApi = await import("/features/student/student_profile_module.js");
    });
    await assert.rejects(page.evaluate(() => window.profileApi.getStudentProfile({studentId: "student"})), /Could not load/);
    const profile = await page.evaluate(() => window.profileApi.getStudentProfile({studentId: "student"}));
    assert.equal(profile.pin, undefined); assert.equal(profile.id, "student"); assert.equal(sdkLoads, 2, "Failed lazy SDK initialization can be retried");
    const saved = await page.evaluate(() => window.profileApi.updateStudentProfile({studentId: "student", expectedVersion: 0, changes: {name: "Changed in browser"}}));
    assert.equal(saved.profileVersion, 1); assert.equal(saved.name, "Changed in browser");
    const renamed = await page.evaluate(() => window.profileApi.changeStudentUsername({studentId: "student", expectedVersion: 1, username: "browser.changed", requestId: "browser-rename"}));
    assert.equal(renamed.status, "completed");
    assert.equal((await page.evaluate(() => window.profileApi.resetStudentPin({studentId: "student", expectedVersion: 2, newPin: "654321"}))).pinChanged, true);
    const login = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, {
      method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({email: "browser.changed@rhx.com", password: "654321", returnSecureToken: true}),
    });
    assert.equal(login.status, 200); assert.equal((await login.json()).localId, "student");
    const before = requests;
    await page.evaluate(() => {window.testUser = null;});
    await assert.rejects(page.evaluate(() => window.profileApi.getStudentProfile({studentId: "student"})), /No authenticated user/);
    assert.equal(requests, before, "Signed-out profile calls never reach the backend");
    await page.evaluate(() => {window.testUser = {uid: "student"};});
    delayResponse = true;
    const switching = page.evaluate(() => window.profileApi.getStudentProfile({studentId: "student"}));
    await page.waitForFunction(() => true);
    await new Promise(resolve => setTimeout(resolve, 50));
    await page.evaluate(() => {window.testUser = {uid: "different-account"};});
    await assert.rejects(switching, /signed-in account changed/);
    assert.deepEqual(errors, []);
    console.log("PASS: browser API transport, lazy SDK retry, redacted reads, self profile edits, UID-preserving username/PIN changes, real new login, and account-switch protection.");
  } finally {await browser.close(); await db.terminate();}
})().catch(error => {console.error(error); process.exitCode = 1;});
