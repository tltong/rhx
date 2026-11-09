const assert = require("node:assert/strict"), path = require("node:path");
const fromFunctions = require("node:module").createRequire(path.resolve(__dirname, "../functions/package.json"));
const origin = process.env.SUBJECT_ASSESSMENT_TEST_ORIGIN || "http://127.0.0.1:8769";
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);

(async () => {
  const {default: puppeteer} = await import(fromFunctions.resolve("puppeteer"));
  const browser = await puppeteer.launch({executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"]});
  try {
    const page = await browser.newPage(); await page.setViewport({width: 390, height: 844});
    const errors = [], requests = [], papers = new Map(); let loseSubmitResponse = true, saveConflict = false;
    let rejectSubmit = true, failConfirmation = false, failOverview = false, dashboardAssessmentId = "paper", releaseSubmit, unloadPrompts = 0;
    const submitGate = new Promise(resolve => {releaseSubmit = resolve;});
    const dashboardPath = "/features/student/pages/landing/landing.html";
    const malicious = '<img src=x onerror="window.__unsafe=true">';
    const questions = [{questionId: "q1", position: 1, requiredWordCount: 1}, {questionId: "q2", position: 2, requiredWordCount: 1}];
    const items = [
      {position: 1, topicId: "reading", topicName: "Reading", questionType: "normal", difficulty: "easy", contentSnapshot: {questionText: "Which number fits? " + malicious, options: {a: "One", b: "Two", c: "Three", d: "Four"}}},
      {position: 2, topicId: "writing", topicName: "Writing", questionType: "essay", difficulty: "medium", contentSnapshot: {questionText: "Write about a family outing.", wordCountRequirement: {minWords: 2}, support: {helpingWords: ["family", "park"]}}},
      {position: 3, topicId: "vocabulary", topicName: "Vocabulary", questionType: "fillInTheBlanks", difficulty: "hard", contentSnapshot: {language: "English", passageText: "We saw {{q1}} at the {{q2}}.", questions}},
      {position: 4, topicId: "vocabulary", topicName: "Vocabulary", questionType: "fillInTheBlanks", difficulty: "easy", contentSnapshot: {language: "English", passageText: "More {{q1}} sang.", questions: [questions[0]]}},
    ];
    function paper(id) {if (!papers.has(id)) papers.set(id, {assessment: {assessmentId: id, studentId: "student", syllabusId: "english", language: "English", contextSnapshot: {subject: "English"}, items}, submission: null, result: null}); return papers.get(id);}
    function completed(id) {
      const state = paper(id), answers = state.submission.items;
      const summary = (key, value, score, count) => ({[key]: value, topicName: value, score, questionCount: count});
      state.submission.markingStatus = "completed";
      state.result = {assessmentId: id, studentId: "student", language: "English", score: (100 + 80 + 100) / 3, scoringPolicy: {version: 2, aggregation: "topic"},
        topicBreakdown: [summary("topicId", "Reading", 100, 1), summary("topicId", "Writing", 80, 1), summary("topicId", "Vocabulary", 100, 3)],
        formatBreakdown: [summary("questionType", "normal", 100, 1), summary("questionType", "essay", 80, 1), summary("questionType", "fillInTheBlanks", 100, 3)],
        difficultyBreakdown: [summary("difficulty", "easy", 100, 2), summary("difficulty", "medium", 80, 1), summary("difficulty", "hard", 100, 2)],
        items: items.map(item => {
          const answer = answers.find(answer => answer.position === item.position);
          return {...item, score: item.questionType === "essay" ? 80 : 100, answer: item.questionType === "normal" ? {...answer, correctAnswer: "b", isCorrect: true, explanation: "Two is correct."}
            : item.questionType === "essay" ? {...answer, reviewComment: "Clear ideas. " + malicious, corrections: [{originalText: "park", correctedText: "garden", explanation: "A precise place."}]}
              : {answers: Object.fromEntries(item.contentSnapshot.questions.map(question => [question.questionId, {submittedAnswer: answer.answers[question.questionId], correctAnswer: answer.answers[question.questionId], isCorrect: true}]))}};
        })};
    }
    page.on("pageerror", error => errors.push(error.message));
    page.on("dialog", dialog => {if (dialog.type() === "beforeunload") unloadPrompts++; else errors.push("Unexpected dialog " + dialog.type()); dialog.accept();});
    await page.exposeFunction("__hasSubmit", id => requests.some(request => request.action === "submit" && request.input.assessmentId === id));
    await page.exposeFunction("__assessmentBackend", async ({action, input}, uid) => {
      requests.push({action, input, uid});
      if (action === "list") return {assessments: [paper("paper").assessment], nextCursor: null};
      if (action === "results") return {results: [...papers.values()].map(value => value.result).filter(Boolean), nextCursor: null};
      if (action === "overview") {
        if (failOverview) {failOverview = false; return {error: {code: "functions/unavailable", message: "Temporary status failure"}};}
        const state = paper(dashboardAssessmentId), submission = state.submission;
        return {repeatMode: "interval", intervalDays: 30, subjects: [{syllabusId: "english", language: "English", configured: true, canStart: false,
          reason: "cooldown", nextAvailableAt: new Date(Date.now() + 86400000).toISOString(), activeAssessment: null, generation: null,
          latestSubmission: submission?.status === "submitted" ? {assessmentId: dashboardAssessmentId, ...submission} : null,
          latestResult: state.result ? {assessmentId: dashboardAssessmentId, score: state.result.score} : null}]};
      }
      const state = paper(input.assessmentId);
      if (action === "session") {
        if (input.assessmentId === "unconfirmed" && failConfirmation) {failConfirmation = false; return {error: {code: "functions/unavailable", message: "Cannot confirm submission yet"}};}
        return {...state, canSubmit: uid === "student"};
      }
      if (uid !== "student") throw new Error("Read-only viewer cannot write");
      if (action === "save") {
        if (saveConflict && input.answers.length) {saveConflict = false; return {error: {code: "functions/aborted", message: "Answers changed in another session."}};}
        assert.equal(input.expectedRevision, state.submission?.revision || 0);
        const previous = state.submission?.items || [], merged = new Map(previous.map(value => [value.position, value]));
        for (const answer of input.answers) merged.set(answer.position, answer);
        state.submission = {status: "draft", revision: input.expectedRevision + 1, markingStatus: "notStarted", items: [...merged.values()]};
        return state.submission;
      }
      if (action === "submit") {
        assert.equal(input.expectedRevision, state.submission.revision);
        if (input.assessmentId === "rejected" && rejectSubmit) return {error: {code: "functions/unavailable", message: "Submission was not saved. Try again."}};
        if (input.assessmentId === "success") await submitGate;
        state.submission = {...state.submission, status: "submitted", markingStatus: "pending", markedItemCount: 0, itemCount: 4};
        dashboardAssessmentId = input.assessmentId;
        if (input.assessmentId === "unconfirmed") {failConfirmation = true; return {error: {code: "functions/unavailable", message: "Connection lost after submit."}};}
        if (loseSubmitResponse) {loseSubmitResponse = false; return {error: {code: "functions/unavailable", message: "Connection lost after submit."}};}
        return state.submission;
      }
      if (action === "retry") {state.submission.markingStatus = "pending"; return state.submission;}
      throw new Error("Unexpected assessment operation: " + action);
    });
    await page.evaluateOnNewDocument(() => {window.__user = {uid: "student"}; window.__switchUser = user => {window.__user = user; window.__authListener?.(user);};});
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = new URL(request.url()), js = body => request.respond({status: 200, contentType: "application/javascript", body});
      if (url.pathname === dashboardPath && request.isNavigationRequest()) return request.respond({status: 200, contentType: "text/html", body: `<!doctype html><html><body><h1>Learning dashboard</h1><section id="student-subject-assessments-section"><div id="dashboard-assessment"></div></section>
        <script type="module">
          import {SubjectAssessmentDashboard} from "/features/subject_assessment/components/subject_assessment_dashboard.js";
          window.__assessmentDashboard = new SubjectAssessmentDashboard({schedule: (callback, delay) => {window.__pollDelay = delay; return setTimeout(callback, delay >= 60000 ? 50 : 100);}});
          window.__assessmentDashboard.begin("student");
          window.__assessmentDashboard.add(document.getElementById("dashboard-assessment"), "english", {subject: "English", language: "English"});
          window.__assessmentDashboard.refresh();
        </script></body></html>`});
      if (url.pathname.includes("/__/firebase/")) return js("");
      if (url.pathname.endsWith("/firebase_auth.js")) return js('export const getFirebaseAuth=()=>({onAuthStateChanged(callback){window.__authListener=callback;queueMicrotask(()=>callback(window.__user));}}); export const requireCurrentFirebaseAuthUser=()=>{if(!window.__user)throw new Error("Sign in");return window.__user;};');
      if (url.pathname.endsWith("/firebase_ops.js")) return js('export const getFirebaseApp=()=>({functions:region=>({httpsCallable:(name,options)=>async data=>{if(region!=="us-central1"||name!=="subjectAssessment")throw new Error("Unexpected callable");const result=await window.__assessmentBackend(data,window.__user.uid);if(result?.error)throw Object.assign(new Error(result.error.message),{code:result.error.code});return {data:result};}})});');
      if (url.origin !== origin && !url.protocol.startsWith("blob")) return request.abort();
      request.continue();
    });
    const location = origin + "/features/subject_assessment/pages/assessment/subject_assessment.html";
    await page.goto(location, {waitUntil: "networkidle0"});
    await page.waitForSelector("#assessment-list a");
    assert.equal(requests.some(request => request.action === "save"), false, "Listing does not create submissions");
    await page.click("#assessment-list a");
    await page.waitForFunction(() => document.querySelectorAll(".assessment-card").length === 4);
    await page.waitForFunction(() => document.querySelector("#assessment-save-status").textContent.includes("saved"));
    assert.equal(await page.$$eval("[id]", elements => {const ids = elements.map(element => element.id); return ids.length === new Set(ids).size;}), true, "Passage blank IDs are unique across passages");
    await page.click('input[name="item-1"][value="b"]');
    await page.type("#essay-2", "My family visited the park. " + malicious);
    await page.type("#assessment-3-blank-q1", "two words"); await page.type("#assessment-3-blank-q2", "garden"); await page.type("#assessment-4-blank-q1", "birds");
    await page.click("#submit-assessment");
    assert.equal(requests.some(request => request.action === "submit"), false, "Invalid answer length blocks submission");
    await page.$eval("#assessment-3-blank-q1", input => {input.value = "birds"; input.dispatchEvent(new Event("input", {bubbles: true}));});
    await page.click("#save-answers");
    await page.waitForFunction(() => document.querySelector("#assessment-save-status").textContent === "Answers saved.");
    await page.reload({waitUntil: "networkidle0"});
    await page.waitForSelector("#essay-2");
    assert.equal(await page.$eval("#essay-2", input => input.value), "My family visited the park. " + malicious);
    assert.equal(await page.$eval("#assessment-4-blank-q1", input => input.value), "birds");
    const promptsBeforeSubmit = unloadPrompts;
    await Promise.all([page.waitForNavigation({waitUntil: "networkidle0"}), page.click("#submit-assessment")]);
    assert.equal(new URL(page.url()).pathname, dashboardPath);
    assert.equal(paper("paper").result, null, "The student returns before marking finishes");
    assert.equal(unloadPrompts, promptsBeforeSubmit, "A confirmed submission has no unsaved-change prompt");
    assert.equal(requests.filter(request => request.action === "submit").length, 1, "A lost submit response is reconciled without resubmitting");
    await page.waitForFunction(() => document.querySelector("#dashboard-assessment").textContent.includes("Marking your submitted assessment"));
    await page.evaluate(async () => {window.__assessmentDashboard.polls = 120; await window.__assessmentDashboard.refresh();});
    assert.equal(await page.evaluate(() => window.__pollDelay), 60000, "Long-running marking continues polling at a slower rate");
    failOverview = true;
    const temporaryFailure = await page.evaluate(async () => {await window.__assessmentDashboard.refresh(); return {delay: window.__pollDelay, text: document.querySelector("#dashboard-assessment").textContent};});
    assert.match(temporaryFailure.text, /Could not check assessment availability/); assert.equal(temporaryFailure.delay, 60000);
    paper("paper").submission.markingStatus = "failed"; paper("paper").submission.errorMessage = "Marking could not finish. Retry to resume.";
    await page.waitForFunction(() => document.querySelector("#dashboard-assessment").textContent.includes("Retry marking"));
    await page.$eval("#dashboard-assessment", root => [...root.querySelectorAll("button")].find(button => button.textContent === "Retry marking").click());
    await page.waitForFunction(() => document.querySelector("#dashboard-assessment").textContent.includes("Marking your submitted assessment"));
    completed("paper");
    await page.waitForFunction(() => document.querySelector("#dashboard-assessment").textContent.includes("93.3%"));
    await Promise.all([page.waitForNavigation({waitUntil: "networkidle0"}), page.$eval("#dashboard-assessment", root => [...root.querySelectorAll("a")].find(link => link.textContent === "View result").click())]);
    await page.waitForFunction(() => document.querySelector("#assessment-score").textContent === "93.3%");
    assert.equal(new URL(page.url()).searchParams.get("assessmentId"), "paper", "Opening a historical result stays on its feedback page");
    assert.equal(await page.$$eval("#assessment-form input,#assessment-form textarea", inputs => inputs.every(input => input.disabled)), true);
    assert.match(await page.$eval("#assessment-score-policy", element => element.textContent), /Each topic has equal weight.*regardless of its question count/);
    assert.equal(await page.$eval("#assessment-breakdowns", element => element.querySelectorAll("table").length), 3);
    assert.equal(await page.$eval("body", element => element.textContent.includes("Clear ideas. " + '<img src=x onerror="window.__unsafe=true">')), true);
    assert.equal(await page.evaluate(() => Boolean(window.__unsafe)), false);
    assert.equal(await page.$('img[src="x"]'), null);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Mobile page fits viewport");
    await page.setViewport({width: 1280, height: 900});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({path: "/tmp/rhx-subject-assessment-result-desktop.png", fullPage: true});
    const fillSubmission = text => page.evaluate(text => {
      document.querySelector('input[name="item-1"][value="b"]').checked = true;
      document.querySelector("#essay-2").value = text;
      for (const [id, value] of [["assessment-3-blank-q1", "birds"], ["assessment-3-blank-q2", "garden"], ["assessment-4-blank-q1", "birds"]]) document.getElementById(id).value = value;
      document.querySelector("#essay-2").dispatchEvent(new Event("input", {bubbles: true}));
    }, text);
    await page.goto(location + "?assessmentId=success", {waitUntil: "networkidle0"});
    await page.waitForSelector("#essay-2"); await fillSubmission("Saved before returning to the dashboard.");
    const successStart = requests.length, successPrompts = unloadPrompts;
    await page.click("#submit-assessment");
    await page.waitForFunction(() => document.querySelector("#submit-assessment").disabled);
    await page.waitForFunction(async () => await window.__hasSubmit("success"));
    assert.equal(new URL(page.url()).searchParams.get("assessmentId"), "success", "Navigation waits for server confirmation");
    assert.equal(paper("success").submission.status, "draft");
    assert.equal(paper("success").submission.items.find(item => item.position === 2).answer, "Saved before returning to the dashboard.");
    await page.$eval("#assessment-form", form => form.dispatchEvent(new Event("submit", {bubbles: true, cancelable: true})));
    await Promise.all([page.waitForNavigation({waitUntil: "networkidle0"}), Promise.resolve().then(releaseSubmit)]);
    assert.equal(new URL(page.url()).pathname, dashboardPath);
    assert.equal(requests.slice(successStart).filter(request => request.action === "submit").length, 1, "Double submission queues only one request");
    assert.equal(requests.slice(successStart).some(request => request.action === "session"), false, "Success redirects without waiting for a marking/status read");
    assert.equal(unloadPrompts, successPrompts);
    await page.goto(location + "?assessmentId=rejected", {waitUntil: "networkidle0"});
    await page.waitForSelector("#essay-2"); await fillSubmission("Keep these answers when submission fails.");
    await page.click("#submit-assessment");
    await page.waitForFunction(() => document.querySelector("#assessment-status").textContent.includes("Submission was not saved"));
    assert.equal(new URL(page.url()).searchParams.get("assessmentId"), "rejected");
    assert.equal(await page.$eval("#essay-2", input => input.value), "Keep these answers when submission fails.");
    assert.equal(await page.$eval("#assessment-3-blank-q1", input => input.value), "birds");
    assert.equal(await page.$eval("#submit-assessment", button => button.disabled), false);
    rejectSubmit = false;
    await Promise.all([page.waitForNavigation({waitUntil: "networkidle0"}), page.click("#submit-assessment")]);
    assert.equal(new URL(page.url()).pathname, dashboardPath);
    await page.goto(location + "?assessmentId=unconfirmed", {waitUntil: "networkidle0"});
    await page.waitForSelector("#essay-2"); await fillSubmission("Keep these answers until status is confirmed.");
    await page.click("#submit-assessment");
    await page.waitForFunction(() => document.querySelector("#assessment-status").textContent.includes("Submission status could not be confirmed"));
    assert.equal(new URL(page.url()).searchParams.get("assessmentId"), "unconfirmed");
    assert.equal(await page.$eval("#essay-2", input => input.value), "Keep these answers until status is confirmed.");
    assert.equal(await page.$eval("#submit-assessment", button => button.disabled), true);
    await Promise.all([page.waitForNavigation({waitUntil: "networkidle0"}), page.click("#check-assessment")]);
    assert.equal(new URL(page.url()).pathname, dashboardPath);
    assert.equal(requests.filter(request => request.action === "submit" && request.input.assessmentId === "unconfirmed").length, 1);
    await page.goto(location + "?assessmentId=conflict", {waitUntil: "networkidle0"});
    await page.waitForSelector("#essay-2"); await page.type("#essay-2", "Keep this unsaved text"); saveConflict = true;
    await page.click("#save-answers");
    await page.waitForFunction(() => document.querySelector("#assessment-status").textContent.includes("Copy any unsaved text"));
    assert.equal(await page.$eval("#essay-2", input => input.value), "Keep this unsaved text");
    assert.equal(await page.$eval("#submit-assessment", button => button.disabled), true);
    await page.click("#check-assessment"); await page.waitForFunction(() => !document.querySelector("#submit-assessment").disabled);
    await page.goto(location + "?studentId=student&assessmentId=paper", {waitUntil: "networkidle0"});
    await page.waitForSelector("#essay-2"); const beforeGuardian = requests.length;
    await page.evaluate(() => window.__switchUser({uid: "guardian"}));
    await page.waitForFunction(() => document.querySelector("#assessment-score").textContent === "93.3%");
    assert.equal(requests.slice(beforeGuardian).some(request => ["save", "submit", "retry"].includes(request.action)), false);
    assert.equal(await page.$$eval("#assessment-form input,#assessment-form textarea", inputs => inputs.every(input => input.disabled)), true);
    await page.evaluate(() => window.__switchUser(null));
    await page.waitForFunction(() => document.querySelector("#assessment-status").textContent.includes("Sign in"));
    assert.equal(await page.$eval("#assessment-items", element => element.childElementCount), 0, "Sign-out clears answer/feedback DOM");
    assert.deepEqual(errors, []);
    console.log("PASS: Confirmed submission returns to the dashboard before marking, automatic score updates and long-job/error polling, lost-response recovery, failed/unknown submission retention, save/resume, all formats, result feedback and read-only views.");
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
