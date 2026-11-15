const assert = require("node:assert/strict"), http = require("node:http"), fs = require("node:fs"), path = require("node:path"), {createRequire} = require("node:module");
const fromFunctions = createRequire(path.resolve(__dirname, "../functions/package.json"));
const {createTestSystem} = require("../tests/news_test_support.cjs");
const {createStudentNewsHandler} = require("../functions/student_news");
const {FirestoreRewardConfigRepository} = require("../functions/features/reward/infrastructure/firestore_reward_config_repository");
(async () => {
  const s = await createTestSystem("demo-rhx-news-student-browser"); s.setTime(new Date());
  await s.student("student-reader"); await s.student("student-young", 1);
  const handler = createStudentNewsHandler({apis: s.apis}), root = path.resolve(__dirname, "../public"), errors = [], calls = [];
  const config = new FirestoreRewardConfigRepository({readDocument: async (collection, id) => (await s.db.doc(collection + "/" + id).get()).data() || null,
    writeDocument: async (collection, id, data, options) => s.db.doc(collection + "/" + id).set(data, options)});
  const server = http.createServer((request, response) => {
    const file = path.resolve(root, "." + new URL(request.url, "http://localhost").pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {response.writeHead(404); return response.end();}
    response.setHeader("Content-Type", file.endsWith(".html") ? "text/html" : file.endsWith(".css") ? "text/css" : "application/javascript"); response.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); const origin = "http://127.0.0.1:" + server.address().port;
  const {default: puppeteer} = await import(fromFunctions.resolve("puppeteer")); let browser, lostArticle = 4, lostSubmit = true, lostReady = true;
  async function pageFor(uid) {
    const page = await browser.newPage(); page.setDefaultTimeout(45000); page.on("pageerror", e => errors.push(e.message));
    await page.evaluateOnNewDocument(value => {window.__studentUid = value;}, uid);
    await page.exposeFunction("__newsCall", async (action, input, studentId) => {
      calls.push({action, input, studentId});
      try {
        const result = await handler({auth: {uid: studentId}, data: {action, input}});
        if (result.generationId) {const job = await s.repository.job(result.generationId); if (job?.status === "queued") await s.drain(job.generationId);}
        if (action === "requestStudentNews" && lostArticle > 0) {lostArticle--; return {error: {code: "unavailable", message: "Article response interrupted"}};}
        if (action === "getStudentNewsAssignment" && result.status === "ready" && lostReady) {lostReady = false; return {error: {code: "functions/internal", message: "internal"}};}
        if (action === "submitNewsQuestions" && lostSubmit) {lostSubmit = false; return {error: {code: "unavailable", message: "Submission response interrupted"}};}
        return {data: result};
      } catch (error) {return {error: {code: error.code, message: error.message}};}
    });
    await page.exposeFunction("__getRewardConfig", async () => {const value = await config.getGlobal(); return value ? {...value, updatedAt: value.updatedAt.toISOString()} : null;});
    await page.exposeFunction("__saveRewardConfig", async input => {const value = await config.saveGlobal({...input, updatedBy: "admin"}); return {...value, updatedAt: value.updatedAt.toISOString()};});
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = new URL(request.url()), js = body => request.respond({status: 200, contentType: "application/javascript", body});
      if (url.hostname === "firebasestorage.googleapis.com") return request.respond({status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4WQAAAAASUVORK5CYII=", "base64")});
      if (url.origin !== origin) return request.abort();
      if (url.pathname.includes("/__/firebase/") || url.pathname === "/init_fb.js") return js("");
      if (url.pathname.endsWith("/firebase_auth.js")) return js('export const requireCurrentFirebaseAuthUser=()=>({uid:window.__studentUid});');
      if (url.pathname.endsWith("/firebase_ops.js")) return js('export const getFirebaseApp=()=>({functions:()=>({httpsCallable:()=>async({action,input})=>{const r=await window.__newsCall(action,input,window.__studentUid);if(r.error)throw Object.assign(Error(r.error.message),{code:r.error.code});return r;}})});');
      if (url.pathname.endsWith("/student/student_module.js")) return js('export const onStudentAuthStateChanged=callback=>{window.__authChange=callback;queueMicrotask(()=>callback({uid:window.__studentUid}));return()=>{}};');
      if (url.pathname.endsWith("/student/pages/landing/landing.js")) return js('import{mountStudentNewsDashboard}from"/features/student_news/components/news_dashboard.js?v=test";window.newsDashboard=mountStudentNewsDashboard({host:document.getElementById("student-news-root"),pollMs:25});window.newsDashboard.start({studentId:window.__studentUid,country:"Malaysia"});');
      if (url.pathname.endsWith("/news_reader.js")) return js(fs.readFileSync(path.join(root, url.pathname), "utf8").replace('const reader = mountStudentNewsReader();', 'const reader = mountStudentNewsReader({pollMs:25,retryDelayMs:25});window.newsReader=reader;'));
      if (url.pathname.endsWith("/reward/reward_module.js")) return js('export{DEFAULT_REWARD_CONFIG}from"/config/firebase/reward_schema.js?v=test";export const getRewardConfig=()=>{},saveRewardConfig=()=>{},getAssessmentFrameworkRewardConfig=()=>{},saveAssessmentFrameworkRewardConfig=()=>{};');
      if (url.pathname.endsWith("/assessment_framework_module.js")) return js('export const listAssessmentFrameworks=async()=>[],getAssessmentFrameworkById=async()=>null,ASSESSMENT_FRAMEWORK_END_LEVEL_ID="endLevel";');
      if (url.pathname.endsWith("/site_admin_page_loader.js")) return js('document.documentElement.hidden=false;const f=document.getElementById("reward-form");f.id="test-reward-form";const m=await import(new URL(document.querySelector("[data-page-module]").dataset.pageModule,location.href));f.id="reward-form";const convert=v=>v?{...v,updatedAt:new Date(v.updatedAt)}:null;window.rewardAdmin=m.mountRewardAdmin({getConfig:async()=>convert(await window.__getRewardConfig()),saveConfig:async input=>convert(await window.__saveRewardConfig(input)),listFrameworks:async()=>[]});');
      request.continue();
    });
    return page;
  }
  try {
    browser = await puppeteer.launch({executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"]});
    const page = await pageFor("student-reader");
    await page.goto(origin + "/features/student/pages/landing/landing.html", {waitUntil: "networkidle0"});
    await page.waitForSelector('[data-news-type="international"] .news-action');
    assert.equal(s.calls.discover, 0, "opening the dashboard never discovers or generates articles");
    assert.equal(await page.$$(".news-daily-card").then(cards => cards.length), 2);
    assert.match(await page.$eval('[data-news-type="local"] h3', el => el.textContent), /Malaysia/);
    await Promise.all([page.waitForNavigation(), page.click('[data-news-type="international"] .news-action')]);
    await page.waitForSelector("#news-reader-language-form:not([hidden])");
    assert.equal(await page.$eval("#news-reader-language", el => el.value), ""); assert.equal(s.calls.discover, 0);
    await page.select("#news-reader-language", "English"); await page.click("#news-reader-open");
    await page.waitForFunction(() => document.getElementById("news-reader-status").textContent.includes("Article response interrupted"));
    assert.equal(await page.$eval("#news-reader-language", el => el.disabled), true);
    await page.click("#news-reader-retry"); await page.waitForSelector("#news-reader-article:not([hidden])");
    const requests = calls.filter(call => call.action === "requestStudentNews"); assert.equal(new Set(requests.map(request => request.input.clientRequestId)).size, 1, "all automatic and manual retries retain the same article request");
    assert.equal(s.calls.discover, 1); await page.waitForSelector(".news-question-input");
    await page.$$eval(".news-question-input", inputs => inputs.forEach((input, i) => {input.value = ["science exhibition", "space", "Monday"][i]; input.dispatchEvent(new Event("input", {bubbles: true}));}));
    await page.click(".news-questions-submit"); await page.waitForFunction(() => document.querySelector(".news-questions-status").textContent.includes("Submission response interrupted"));
    await page.click(".news-questions-retry"); await page.waitForFunction(() => document.getElementById("news-reader-rewards").textContent.includes("4 coins earned"));
    assert.equal((await s.db.doc("rewards/student-reader").get()).data().totalCoins, 4); assert.equal(await page.$eval(".news-question-score", el => el.textContent), "Score: 3 / 3");
    await page.select("#news-reader-language", "French"); await page.click("#news-reader-open");
    await page.waitForFunction(() => document.getElementById("news-reader-title").textContent.includes("French"));
    assert.equal(await page.$eval("#news-reader-progress", el => el.hidden), true);
    assert.equal(await page.$eval("#news-reader-language-progress progress", el => el.value), 100);
    await page.waitForFunction(() => document.querySelector(".news-question-score").textContent === "Score: 3 / 3");
    assert.equal((await s.db.doc("rewards/student-reader").get()).data().totalCoins, 4); assert.equal(s.calls.discover, 1);
    await page.waitForSelector(".news-vocabulary-term"); await page.click(".news-vocabulary-term");
    assert.match(await page.$eval(".news-article-meaning", el => el.textContent), /French definition/); await page.click(".news-meaning-close");
    await page.screenshot({path: "/tmp/rhx-news-student-reader-desktop.png", fullPage: true});
    await page.goto(origin + "/features/student/pages/landing/landing.html", {waitUntil: "networkidle0"});
    await page.waitForFunction(() => document.querySelector('[data-news-type="international"] .news-card-state')?.textContent === "Completed");
    await page.click(".news-reading-history summary"); await page.waitForSelector(".news-reading-history li a");
    assert.match(await page.$eval(".news-reading-history li", el => el.textContent), /Completed/);
    await Promise.all([page.waitForNavigation(), page.click('[data-news-type="local"] .news-action')]);
    await page.waitForSelector("#news-reader-language-form:not([hidden])"); assert.equal(await page.$eval("#news-reader-language", el => el.value), "", "each new daily article asks for language");
    const young = await pageFor("student-young"); await young.setViewport({width: 390, height: 844});
    await young.goto(origin + "/features/student_news/pages/reader/news_reader.html?newsType=international", {waitUntil: "networkidle0"});
    await young.waitForSelector("#news-reader-language-form:not([hidden])"); await young.select("#news-reader-language", "English"); await young.click("#news-reader-open");
    await young.waitForSelector("#news-reader-page img"); assert.equal(await young.$eval("#news-reader-position", el => el.textContent), "Page 1 of 3");
    await young.click("#news-reader-next"); assert.equal(await young.$eval("#news-reader-position", el => el.textContent), "Page 2 of 3");
    await young.waitForSelector(".news-question-choice");
    const qCall = calls.filter(call => call.action === "getNewsQuestions" && call.studentId === "student-young").at(-1);
    const ready = await s.service.getNewsQuestions(qCall.input, {auth: {uid: "student-young"}}), selected = await s.repository.questionLanguage(ready.setId, require("../functions/features/news_article/domain/news_questions").languageId("English"));
    for (const q of selected.questions) {await young.click('[data-question-id="' + q.id + '"]'); await young.click('[data-choice-id="' + q.answerChoiceId + '"]');}
    await young.click(".news-questions-submit"); await young.waitForFunction(() => document.getElementById("news-reader-rewards").textContent.includes("4 coins earned"));
    assert.equal(await young.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await young.screenshot({path: "/tmp/rhx-news-student-reader-mobile.png", fullPage: true});
    const reward = await pageFor("admin"); await reward.goto(origin + "/features/reward/pages/admin/reward_admin.html", {waitUntil: "networkidle0"});
    await reward.waitForFunction(() => !document.getElementById("news-article-completion-coins").disabled);
    assert.equal(await reward.$eval("#news-article-completion-coins", el => el.value), "2"); assert.equal(await reward.$eval("#news-all-correct-coins", el => el.value), "2");
    await reward.$eval("#news-article-completion-coins", el => {el.value = "0";}); await reward.$eval("#news-all-correct-coins", el => {el.value = "5";}); await reward.click("#save-global-config");
    await reward.waitForFunction(() => document.getElementById("global-status").textContent.includes("saved"));
    assert.equal((await s.db.doc("rewards/config").get()).data().newsArticleCompletionCoins, 0); assert.equal((await s.db.doc("rewards/config").get()).data().newsAllCorrectCoins, 5);
    assert.equal(lostReady, false, "a bare Firebase internal error during a ready article fetch recovered automatically");
    assert.deepEqual(errors, []); console.log("PASS: dashboard slots and history, language prompt, dedicated reader, typed and word-bank questions, automatic completion, frozen coins, lost-response retries, language reuse, vocabulary, mobile layout, and Reward Admin settings.");
  } finally {if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); await s.db.terminate();}
})().catch(error => {console.error(error); process.exitCode = 1;});
