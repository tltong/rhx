// Existing guardian page + student-login proof + real callable/Auth/Firestore, with SDK transport isolated.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const fromFunctions = require("node:module").createRequire(path.resolve(__dirname, "../functions/package.json"));
assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):\d+$/);
assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):\d+$/);
assert.match(process.env.GCLOUD_PROJECT || "", /^demo-/);
(async () => {
  const {getFirestoreDb, getFirebaseApp} = fromFunctions("./utils/firebase/firebase_ops"), db = getFirestoreDb();
  const auth = fromFunctions("firebase-admin/auth").getAuth(getFirebaseApp());
  const api = fromFunctions("./features/student/student_profile_module");
  const handler = fromFunctions("./student_profile").createStudentProfileHandler();
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, {method: "DELETE"});
  await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/accounts`, {method: "DELETE"});
  await auth.createUser({uid: "guardian", email: "guardian@example.test", password: "guardian-password"});
  await auth.createUser({uid: "student", email: "student.one@rhx.com", password: "123456"});
  await db.doc("guardians/guardian").set({name: "Test Guardian", email: "guardian@example.test", authType: "email"});
  await db.doc("students/student").set({name: "Student One", username: "student.one", email: "student.one@rhx.com", country: "Malaysia", level: "primary",
    yearOfBirth: 2016, yearOfRegistration: new Date().getUTCFullYear() - 1, standardAtYearOfRegistration: "3"});
  const {default: puppeteer} = await import(fromFunctions.resolve("puppeteer"));
  const browser = await puppeteer.launch({executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"]});
  try {
    const page = await browser.newPage(), origin = "http://127.0.0.1:8791", root = path.resolve(__dirname, "../public"), errors = [];
    let logins = 0, linkedRequestKeys;
    const context = () => ({auth: {uid: "guardian", token: {auth_time: Math.floor(Date.now() / 1000)}}});
    page.on("pageerror", error => errors.push(error.message));
    await page.exposeFunction("__profileApi", async (action, input) => {
      if (action === "linkStudentToGuardian") linkedRequestKeys = Object.keys(input);
      return handler({...context(), data: {action, input}});
    });
    await page.exposeFunction("__studentLogin", async (email, password) => {
      logins++;
      const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, {
        method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({email, password, returnSecureToken: true}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error("Incorrect student login");
      return {uid: data.localId, token: data.idToken};
    });
    await page.exposeFunction("__linkedStudents", async () => {
      const links = await db.collection("guardianStudentLinks").where("guardianId", "==", "guardian").where("state", "==", "active").get();
      return Promise.all(links.docs.map(async doc => ({link: {id: doc.id, ...doc.data()}, student: await api.getStudentSummary({studentId: doc.data().studentId}, context())})));
    });
    await page.evaluateOnNewDocument(() => {
      window.testUser = {uid: "guardian"}; window.proofEvents = [];
      window.testApp = {options: {projectId: "demo-test"}, auth: () => ({emulatorConfig: null}),
        functions: () => ({httpsCallable: () => async ({action, input}) => ({data: await window.__profileApi(action, input)})})};
      window.testFirebase = {auth: {Auth: {Persistence: {NONE: "none"}}}, initializeApp: (options, name) => {
        window.proofEvents.push(["secondary", name]);
        const auth = {setPersistence: async persistence => {window.proofEvents.push(["persistence", persistence]);},
          signInWithEmailAndPassword: async (email, password) => {const saved = await window.__studentLogin(email, password); return {user: {uid: saved.uid, getIdToken: async () => saved.token}};},
          signOut: async () => {window.proofEvents.push(["signOut"]);}};
        return {auth: () => auth, delete: async () => {window.proofEvents.push(["delete"]);}};
      }};
    });
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = new URL(request.url()), js = body => request.respond({status: 200, contentType: "application/javascript", body});
      if (url.origin !== origin) return request.abort();
      if (url.pathname.startsWith("/__/firebase/") || url.pathname === "/init_fb.js") return js("");
      if (url.pathname.endsWith("/firebase_ops.js")) return js("export const getFirebaseApp=()=>window.testApp; export const getFirebaseNamespace=()=>window.testFirebase;");
      if (url.pathname.endsWith("/firebase_auth.js")) return js("export const requireCurrentFirebaseAuthUser=()=>{if(!window.testUser)throw new Error('Signed out');return window.testUser;};");
      if (url.pathname.endsWith("/guardian_module.js")) return js("export const onGuardianAuthStateChanged=callback=>{setTimeout(()=>callback(window.testUser),0);return()=>{};};export const getGuardianById=async()=>({id:'guardian',name:'Test Guardian',email:'guardian@example.test',authType:'email'});export const signOutGuardian=async()=>{};");
      if (url.pathname.endsWith("/student_module.js")) return js("export const studentLevels={PRIMARY:'primary',SECONDARY:'secondary'};export const searchStudents=input=>window.__profileApi('searchStudentProfiles',input);");
      if (url.pathname.endsWith("/site_admin_module.js")) return js("export const isCurrentUserSiteAdmin=async()=>({isAdmin:false});");
      if (url.pathname.endsWith("/syllabusscope_module.js")) return js("export const listSyllabusScopes=async()=>[];");
      if (url.pathname.endsWith("/guardian_student_link_module.js")) return js("import{createStudentProfileFeature}from'/features/student/student_profile_module.js';export{confirmStudentLogin}from'/features/guardian_student_link/infrastructure/student_login_proof.js';export const guardianStudentRelationships={PARENT:'parent',TEACHER:'teacher',GUARDIAN:'guardian'};export const linkStudentToGuardian=input=>createStudentProfileFeature().linkStudentToGuardian(input);export const listLinkedStudentsForGuardian=()=>window.__linkedStudents();");
      const file = path.resolve(root, "." + url.pathname);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return request.abort();
      return request.respond({status: 200, contentType: file.endsWith(".html") ? "text/html" : file.endsWith(".css") ? "text/css" : "application/javascript", body: fs.readFileSync(file)});
    });
    await page.setViewport({width: 390, height: 844});
    await page.goto(origin + "/features/guardian/pages/landing/landing.html", {waitUntil: "networkidle0"});
    await page.waitForSelector("#student-search-form", {visible: true});
    await page.type('[name="name"]', "Student One"); await page.type('[name="yearOfBirth"]', "2016");
    await page.select('[name="level"]', "primary"); await page.select('[name="grade"]', "4");
    await page.select("#student-link-relationship", "parent");
    const validity = await page.$eval("#student-search-form", form => ({valid: form.checkValidity(), fields: Array.from(form.elements).filter(element => element.willValidate).map(element => ({name: element.name, value: element.value, error: element.validationMessage}))}));
    assert.equal(validity.valid, true, JSON.stringify(validity));
    await page.click("#student-search-submit");
    await page.waitForFunction(() => !document.querySelector("#student-search-submit").disabled);
    assert.ok(await page.$("#student-search-result-list button"), await page.$eval("#guardian-landing-status", node => node.textContent));
    const linkButton = "#student-search-result-list button";
    await page.waitForSelector(linkButton); await page.click(linkButton);
    await page.waitForFunction(() => document.querySelector("#student-login-proof-dialog").open);
    assert.equal(await page.$eval("#proof-student-pin", input => input.type), "password");
    await page.click("#cancel-student-login-proof");
    await page.waitForFunction(() => !document.querySelector("#student-search-submit").disabled);
    assert.equal(logins, 0); assert.equal((await db.doc("guardianStudentLinks/guardian__student").get()).exists, false);
    async function enterProof(pin) {
      await page.click(linkButton);
      await page.waitForFunction(() => document.querySelector("#student-login-proof-dialog").open);
      await page.type("#proof-student-username", "student.one"); await page.type("#proof-student-pin", pin);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({path: "/tmp/rhx-guardian-student-login-proof.png", fullPage: true});
      await page.click("#confirm-student-login-proof");
      await page.waitForFunction(() => {
        const status = document.querySelector("#guardian-landing-status");
        return !document.querySelector("#student-login-proof-dialog").open && (status.textContent.includes("now linked") || status.classList.contains("is-error"));
      });
    }
    await enterProof("000000");
    assert.match(await page.$eval("#guardian-landing-status", node => node.textContent), /Could not confirm/);
    assert.equal((await db.doc("guardianStudentLinks/guardian__student").get()).exists, false);
    await enterProof("123456");
    assert.match(await page.$eval("#guardian-landing-status", node => node.textContent), /now linked/);
    assert.equal((await db.doc("guardianStudentLinks/guardian__student").get()).data().state, "active");
    assert.ok(linkedRequestKeys.includes("studentIdToken")); assert.equal(linkedRequestKeys.includes("pin"), false);
    assert.equal(await page.evaluate(() => window.testUser.uid), "guardian");
    assert.equal(await page.$eval("#proof-student-pin", input => input.value), "");
    const events = await page.evaluate(() => window.proofEvents);
    assert.equal(events.filter(event => event[0] === "signOut").length, 2); assert.equal(events.filter(event => event[0] === "delete").length, 2);
    assert.ok(events.filter(event => event[0] === "persistence").every(event => event[1] === "none"));
    assert.deepEqual(errors, []);
    console.log("PASS: real guardian page, cancel/incorrect login rejection, masked PIN, transient secondary session cleanup, verified student-token linking, and preserved guardian identity.");
  } finally {await browser.close(); await db.terminate();}
})().catch(error => {console.error(error); process.exitCode = 1;});
