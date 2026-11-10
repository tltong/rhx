// Real guardian page, callable handlers and Auth/Firestore emulators; only SDK transport is isolated.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const fromFunctions = require("node:module").createRequire(path.resolve(__dirname, "../functions/package.json"));
assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):\d+$/);
assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):\d+$/);
assert.match(process.env.GCLOUD_PROJECT || "", /^demo-/);
(async () => {
  const {getFirestoreDb, getFirebaseApp} = fromFunctions("./utils/firebase/firebase_ops"), db = getFirestoreDb();
  const auth = fromFunctions("firebase-admin/auth").getAuth(getFirebaseApp());
  const year = new Date().getUTCFullYear(), oldLogin = Math.floor(Date.now() / 1000) - 86400;
  const {schoolSearchPrefixes} = fromFunctions("./features/school/domain/school_search");
  let failRename = false, loseRenameResponse = false, failLocalities = false;
  const {createStudentProfileFeature} = fromFunctions("./features/student/student_profile_module");
  const api = createStudentProfileFeature({getDb: () => db, auth: {
    getUser: uid => auth.getUser(uid), getUserByEmail: email => auth.getUserByEmail(email),
    updateUser: async (uid, changes) => {
      if (failRename && changes.email) throw Object.assign(new Error("Injected transient Auth outage"), {code: "auth/network-request-failed"});
      return auth.updateUser(uid, changes);
    },
  }});
  const handler = fromFunctions("./student_profile").createStudentProfileHandler({apis: api});
  const schoolHandler = fromFunctions("./school_catalog").createSchoolCatalogHandler();
  const context = {auth: {uid: "guardian", token: {auth_time: oldLogin}}};
  for (const url of [`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`,
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/accounts`]) {
    assert.equal((await fetch(url, {method: "DELETE"})).status, 200);
  }
  await auth.createUser({uid: "guardian", email: "guardian@example.test", password: "guardian-password"});
  await auth.createUser({uid: "student", email: "original@rhx.com", password: "123456"});
  const batch = db.batch(), docs = {
    "guardians/guardian": {name: "Test Guardian", email: "guardian@example.test", authType: "email"},
    "guardianStudentLinks/guardian__student": {guardianId: "guardian", studentId: "student", state: "active", relationship: "parent"},
    "students/student": {name: "Original Student", username: "original", email: "original@rhx.com", pin: "123456", country: "Malaysia", level: "primary", schoolId: "school-old",
      yearOfBirth: 2016, yearOfRegistration: year - 1, standardAtYearOfRegistration: "3"},
    "syllabusScope/Malaysia": {country: "Malaysia", levels: {primary: {4: true, 5: true}, secondary: {1: true}}},
    "schoolStates/state": {name: "Selangor", nameNormalized: "selangor", country: "Malaysia", status: "active"},
    "schoolLocalities/town": {name: "Petaling Jaya", nameNormalized: "petaling jaya", country: "Malaysia", stateId: "state", status: "active"},
    "schoolStates/other-state": {name: "Johor", nameNormalized: "johor", country: "Malaysia", status: "active"},
    "schoolLocalities/other-town": {name: "Johor Bahru", nameNormalized: "johor bahru", country: "Malaysia", stateId: "other-state", status: "active"},
    "streams/old": {name: "SK", country: "Malaysia", level: "primary"}, "streams/new": {name: "SJKC", country: "Malaysia", level: "primary"},
    "streams/new/years/5": {year: 5, syllabuses: {english: {language: "English"}, math: {language: "Malay"}}},
    "syllabuses/english": {country: "Malaysia", level: "primary", languages: ["English"]}, "syllabuses/math": {country: "Malaysia", level: "primary", languages: ["Malay"]},
    "streamSubscriptions/student": {streamId: "old"}, "syllabusSubscriptions/student": {},
    "syllabusSubscriptions/student/syllabuses/old-english": {state: "active", language: "English"},
    "syllabusSubscriptions/student/syllabuses/math": {state: "active", language: "Malay", subscribedAt: new Date(`${year - 1}-01-01`)},
    "subjectAssessmentResults/history": {studentId: "student", syllabusId: "old-english", score: 80},
    "subscriptions/student": {applicationStatus: "active", preserve: true},
  };
  const school = name => ({name, nameNormalized: name.toLowerCase(), searchPrefixes: schoolSearchPrefixes(name), country: "Malaysia", level: "primary", stateId: "state", localityId: "town", streamId: "new", status: "active"});
  docs["schools/school-old"] = {...school("SK Original"), streamId: "old"};
  docs["schools/school-new"] = school("SK Target School");
  docs["schools/school-duplicate"] = {...school("SK Target School"), stateId: "other-state", localityId: "other-town"};
  for (let i = 0; i < 60; i++) docs[`schools/school-${i}`] = school("SK School " + String(i).padStart(3, "0"));
  for (const [key, value] of Object.entries(docs)) batch.set(db.doc(key), value);
  await batch.commit();
  async function login(username, pin) {
    const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, {
      method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({email: username + "@rhx.com", password: pin, returnSecureToken: true}),
    });
    return {ok: response.ok, data: await response.json()};
  }
  const {default: puppeteer} = await import(fromFunctions.resolve("puppeteer"));
  const browser = await puppeteer.launch({executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"]});
  try {
    const page = await browser.newPage(), origin = "http://127.0.0.1:8792", root = path.resolve(__dirname, "../public"), errors = [], requests = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.exposeFunction("__callable", async (name, action, input) => {
      requests.push({name, action, keys: Object.keys(input), limit: input.limit, cursor: input.cursor, search: input.search, stateId: input.stateId, localityId: input.localityId});
      try {
        if (failLocalities && action === "listLocalities") {failLocalities = false; throw new Error("Temporary city/town lookup failure");}
        const result = await (name === "schoolCatalog" ? schoolHandler : handler)({...context, data: {action, input}});
        if (loseRenameResponse && action === "changeStudentUsername") {loseRenameResponse = false; throw new Error("Injected lost callable response");}
        return result;
      } catch (error) {return {__testError: {message: error.message, code: error.code || "unavailable"}};}
    });
    await page.exposeFunction("__scopes", async () => [{id: "Malaysia", ...(await db.doc("syllabusScope/Malaysia").get()).data()}]);
    await page.exposeFunction("__linkedStudents", async () => {
      const links = await db.collection("guardianStudentLinks").where("guardianId", "==", "guardian").where("state", "==", "active").get();
      return Promise.all(links.docs.map(async doc => ({link: {id: doc.id, ...doc.data()}, student: await api.getStudentSummary({studentId: doc.data().studentId}, context)})));
    });
    await page.evaluateOnNewDocument(() => {
      window.testUser = {uid: "guardian"};
      window.testApp = {functions: () => ({httpsCallable: name => async ({action, input}) => {
        const data = await window.__callable(name, action, input);
        if (data.__testError) throw Object.assign(new Error(data.__testError.message), {code: "functions/" + data.__testError.code});
        return {data};
      }})};
      window.testFirebase = {initializeApp: () => {throw new Error("Student verification must not run when editing an active link");}};
    });
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = new URL(request.url()), js = body => request.respond({status: 200, contentType: "application/javascript", body});
      if (url.origin !== origin) return request.abort();
      if (url.pathname.startsWith("/__/firebase/") || url.pathname === "/init_fb.js") return js("");
      if (url.pathname.endsWith("/firebase_ops.js")) return js("export const getFirebaseApp=()=>window.testApp;export const getFirebaseNamespace=()=>window.testFirebase;");
      if (url.pathname.endsWith("/firebase_auth.js")) return js("export const requireCurrentFirebaseAuthUser=()=>{if(!window.testUser)throw new Error('Signed out');return window.testUser;};");
      if (url.pathname.endsWith("/guardian_module.js")) return js("export const onGuardianAuthStateChanged=callback=>{setTimeout(()=>callback(window.testUser),0);return()=>{};};export const getGuardianById=async()=>({id:'guardian',name:'Test Guardian',email:'guardian@example.test',authType:'email'});export const signOutGuardian=async()=>{};");
      if (url.pathname.endsWith("/student_module.js")) return js("export const studentLevels={PRIMARY:'primary',SECONDARY:'secondary'};export const searchStudents=input=>window.__callable('studentProfile','searchStudentProfiles',input);");
      if (url.pathname.endsWith("/site_admin_module.js")) return js("export const isCurrentUserSiteAdmin=async()=>({isAdmin:false});");
      if (url.pathname.endsWith("/syllabusscope_module.js")) return js("export const listSyllabusScopes=()=>window.__scopes();");
      if (url.pathname.endsWith("/guardian_student_link_module.js")) return js("export const guardianStudentRelationships={PARENT:'parent'};export const listLinkedStudentsForGuardian=()=>window.__linkedStudents();export const confirmStudentLogin=()=>{throw new Error('Unexpected verification');};export const linkStudentToGuardian=()=>{throw new Error('Unexpected new link');};");
      const file = path.resolve(root, "." + url.pathname);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return request.abort();
      return request.respond({status: 200, contentType: file.endsWith(".html") ? "text/html" : file.endsWith(".css") ? "text/css" : "application/javascript", body: fs.readFileSync(file)});
    });
    await page.setViewport({width: 390, height: 844});
    await page.goto(origin + "/features/guardian/pages/landing/landing.html", {waitUntil: "networkidle0"});
    const waitReady = () => page.waitForFunction(() => !document.querySelector("#save-student-details").disabled);
    const editValue = (selector, value) => page.$eval(selector, (input, next) => {input.value = next;}, value);
    const waitStatus = text => page.waitForFunction(expected => document.querySelector("#student-edit-status").textContent.includes(expected), {}, text);
    const open = async () => {await page.click(".edit-student-button"); await waitReady();};
    await page.waitForSelector(".edit-student-button"); await open();
    assert.equal(await page.$eval("#edit-student-name", input => input.value), "Original Student");
    await editValue("#edit-student-name", "Cancelled name"); await page.click("#close-student-edit"); await open();
    assert.equal(await page.$eval("#edit-student-name", input => input.value), "Original Student");
    await editValue("#edit-student-name", "Updated Student"); await editValue("#edit-student-birth-year", "2017");
    await page.click("#save-student-details"); await waitStatus("Student details saved"); await waitReady();
    assert.match(await page.$eval("#linked-student-list", node => node.textContent), /Updated Student/);
    assert.equal((await db.doc("students/student").get()).data().yearOfBirth, 2017);

    await db.doc("students/student").update({name: "External edit", profileVersion: 2});
    await editValue("#edit-student-name", "Stale edit"); await page.click("#save-student-details");
    await waitStatus("Reload the latest details"); await waitReady();
    assert.equal((await db.doc("students/student").get()).data().name, "External edit");
    await page.click("#reload-student-edit"); await waitStatus("Latest student details loaded"); await waitReady();
    assert.equal(await page.$eval("#edit-student-name", input => input.value), "External edit");
    await page.click("#edit-show-academic"); await waitReady();
    assert.equal(await page.$eval("#edit-academic-fields", node => node.hidden), false);
    const search = "#edit-school-picker input", options = "#edit-school-picker [role=option]";
    const waitSearch = () => page.waitForFunction(() => document.querySelector("#edit-school-picker [role=listbox]").getAttribute("aria-busy") === "false");
    await page.click(search); await waitSearch();
    await page.click("#edit-school-picker .searchable-list-clear"); await waitSearch();
    assert.equal((await page.$$(options)).length, 10);
    await page.click("#edit-school-picker .searchable-list-more"); await waitSearch();
    assert.equal((await page.$$(options)).length, 20);
    assert.ok(requests.some(item => item.action === "listSchools" && item.limit === 10 && item.cursor));
    await page.select("#edit-school-state", ""); await waitReady();
    assert.equal(await page.$eval("#edit-school-locality", node => node.value), "");
    assert.equal(await page.$eval("#edit-school-locality", node => node.disabled), true);
    await page.click(search); await page.type(search, "s");
    await page.waitForFunction(() => document.querySelector("#edit-school-picker .searchable-list-status").textContent.includes("10 suggestions"));
    assert.ok(requests.some(item => item.action === "listSchools" && item.search === "s" && !item.stateId));
    await page.$eval(search, input => {input.value = "Target S"; input.dispatchEvent(new Event("input", {bubbles: true}));});
    await page.waitForFunction(() => document.querySelectorAll("#edit-school-picker [role=option]").length === 2);
    assert.match(await page.$eval("#edit-school-picker", node => node.textContent), /Petaling Jaya · Selangor/);
    assert.match(await page.$eval("#edit-school-picker", node => node.textContent), /Johor Bahru · Johor/);
    assert.equal(await page.$("#edit-find-schools"), null);
    await page.$eval("#edit-school-picker", node => node.scrollIntoView({block: "center"}));
    await page.screenshot({path: "/tmp/rhx-school-autocomplete-mobile.png"});
    await page.setViewport({width: 1366, height: 950});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({path: "/tmp/rhx-school-autocomplete-desktop.png"});
    await page.setViewport({width: 390, height: 844});
    failLocalities = true;
    await page.select("#edit-school-state", "other-state"); await waitReady();
    assert.match(await page.$eval("#edit-school-status", node => node.textContent), /Temporary city\/town lookup failure/);
    assert.equal(await page.$eval("#edit-school-locality", node => node.value), "");
    await page.click(search);
    await page.waitForFunction(() => document.querySelectorAll("#edit-school-picker [role=option]").length === 1);
    assert.equal(await page.$eval("#edit-school-picker [role=option]", node => node.dataset.itemId), "school-duplicate", "Failed city loading cannot leave an old state filter active");
    await page.select("#edit-school-state", "state"); await waitReady();
    await page.select("#edit-school-locality", "town"); await page.click(search);
    await page.waitForFunction(() => document.querySelectorAll("#edit-school-picker [role=option]").length === 1);
    await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
    assert.equal((await db.doc("students/student").get()).data().schoolId, "school-old", "Selecting a suggestion does not save student details");
    assert.match(await page.$eval("#edit-school-selection", node => node.textContent), /SK Target School/);
    assert.ok(requests.some(item => item.action === "listSchools" && item.stateId === "state" && item.localityId === "town"));
    await page.select("#edit-student-grade", "5");
    assert.equal(await page.$eval("#student-login-proof-dialog", dialog => dialog.open), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.$eval("#student-edit-dialog", node => {node.scrollTop = 0;});
    await page.screenshot({path: "/tmp/rhx-guardian-student-editor.png"});
    await page.click("#save-student-details"); await waitStatus("Student details saved"); await waitReady();
    assert.equal((await db.doc("students/student").get()).data().schoolId, "school-new");
    assert.equal((await db.doc("students/student").get()).data().gradeAtReferenceYear, 5);
    assert.equal((await db.doc("streamSubscriptions/student").get()).data().streamId, "new");
    assert.equal((await db.doc("syllabusSubscriptions/student/syllabuses/old-english").get()).data().state, "inactive");
    assert.equal((await db.doc("subjectAssessmentResults/history").get()).exists, true);
    assert.equal((await db.doc("subscriptions/student").get()).data().preserve, true);
    assert.equal((await db.doc("syllabusSubscriptions/student/syllabuses/math").get()).data().subscribedAt.toDate().getUTCFullYear(), year - 1);
    assert.match(await page.$eval("#linked-student-list", node => node.textContent), /Year 5/);

    failRename = true;
    await editValue("#edit-student-username", "guardian.changed"); await page.click("#save-student-username");
    await waitStatus("still finishing");
    assert.equal(await page.$eval("#save-student-pin", button => button.disabled), true);
    await page.click("#close-student-edit"); await page.click(".edit-student-button"); await waitStatus("still finishing");
    failRename = false;
    const jobId = (await db.doc("students/student").get()).data().credentialChangeId;
    await api.processStudentUsernameChange(jobId);
    await page.click("#check-student-username"); await waitStatus("Username changed"); await waitReady();
    assert.equal((await login("guardian.changed", "123456")).data.localId, "student");
    loseRenameResponse = true;
    await editValue("#edit-student-username", "recovered.name"); await page.click("#save-student-username"); await waitReady();
    assert.equal(await page.$eval("#edit-student-username", input => input.value), "recovered.name");
    assert.equal((await auth.getUser("student")).email, "recovered.name@rhx.com");
    assert.ok(requests.some(item => item.action === "getStudentCredentialChange"));

    assert.equal(await page.$eval("#edit-student-pin", input => input.type), "password");
    await editValue("#edit-student-pin", "654321"); await editValue("#edit-student-pin-confirm", "111111");
    await page.click("#save-student-pin"); await waitStatus("do not match");
    assert.equal(requests.filter(item => item.action === "resetStudentPin").length, 0);
    await editValue("#edit-student-pin-confirm", "654321"); await page.click("#save-student-pin"); await waitStatus("Student PIN changed"); await waitReady();
    assert.equal(await page.$eval("#edit-student-pin", input => input.value), "");
    assert.equal((await login("recovered.name", "654321")).data.localId, "student");
    assert.equal((await login("recovered.name", "123456")).ok, false);
    assert.equal((await db.doc("students/student").get()).data().pin, undefined);
    assert.equal(await page.evaluate(() => window.testUser.uid), "guardian");
    assert.ok(requests.every(item => !item.keys.includes("studentIdToken")));
    assert.equal(await page.$eval("#student-login-proof-dialog", dialog => dialog.open), false);

    await db.doc("guardianStudentLinks/guardian__student").update({state: "inactive"});
    await editValue("#edit-student-name", "Forbidden edit"); await page.click("#save-student-details"); await waitStatus("cannot access");
    assert.equal((await db.doc("students/student").get()).data().name, "External edit");
    assert.deepEqual(errors, []);
    console.log("PASS: linked-student editor with an existing guardian session, cancel, profile/card updates, stale-version reload, paginated school search, stream/history alignment, pending/lost-response username recovery, real new username/PIN login, and revoked-link denial without additional verification.");
  } finally {await browser.close(); await db.terminate();}
})().catch(error => {console.error(error); process.exitCode = 1;});
