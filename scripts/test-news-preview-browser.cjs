const assert = require("node:assert/strict"), http = require("node:http"), fs = require("node:fs"), path = require("node:path");
const {createRequire} = require("node:module"), fromFunctions = createRequire(path.resolve(__dirname, "../functions/package.json"));
const {createTestSystem} = require("../tests/news_test_support.cjs");
const {createStudentNewsHandler} = require("../functions/student_news");
(async () => {
  const system = await createTestSystem("demo-rhx-news-preview-browser"), handler = createStudentNewsHandler({apis: system.apis}), root = path.resolve(__dirname, "../public");
  system.state.wordCounts = [334, 320];
  const server = http.createServer((request, response) => {
    const file = path.resolve(root, "." + new URL(request.url, "http://localhost").pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {response.writeHead(404); return response.end();}
    response.setHeader("Content-Type", file.endsWith(".html") ? "text/html" : file.endsWith(".css") ? "text/css" : "application/javascript"); response.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`, {default: puppeteer} = await import(fromFunctions.resolve("puppeteer"));
  let browser, failOptions = true, failStart = true, failAdd = true, failLanguage = true, failMeaningStart = true, delayTamilMeaning = true, failQuestionSubmit = true;
  const calls = [], errors = [];
  try {
    browser = await puppeteer.launch({executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"]});
    const page = await browser.newPage(); page.on("pageerror", error => errors.push(error.message));
    await page.exposeFunction("__newsCall", async (action, input) => {
      calls.push({action, input});
      if (action === "requestNewsMeaning" && input.meaningLanguage === "Tamil" && delayTamilMeaning) {delayTamilMeaning = false; await new Promise(resolve => setTimeout(resolve, 150));}
      if (action === "getNewsPreviewOptions" && failOptions) {failOptions = false; return {error: {code: "unavailable", message: "Options temporarily unavailable"}};}
      if (action === "addNewsPreviewToPool" && failAdd) {failAdd = false; return {error: {code: "unavailable", message: "Temporary pool save failure"}};}
      if (action === "getNewsPreview") {const job = await system.repository.job(input.generationId); if (job?.status === "queued") await system.generator.run(job.generationId, job.requestSequence);}
      try {
        const result = await handler({auth: {uid: "admin"}, data: {action, input}});
        if (["getNewsVocabulary", "getNewsMeaning", "getNewsQuestions"].includes(action) && result.generationId) {
          const job = await system.repository.job(result.generationId); if (job?.status === "queued") await system.generator.run(job.generationId, job.requestSequence);
        }
        if (action === "generateNewsPreview" && failStart) {failStart = false; return {error: {code: "unavailable", message: "Preview response was interrupted"}};}
        if (action === "requestNewsPreviewLanguage" && failLanguage) {failLanguage = false; return {error: {code: "unavailable", message: "Language response was interrupted"}};}
        if (action === "requestNewsMeaning" && failMeaningStart) {failMeaningStart = false; return {error: {code: "unavailable", message: "Meaning response was interrupted"}};}
        if (action === "submitNewsQuestions" && failQuestionSubmit) {failQuestionSubmit = false; return {error: {code: "unavailable", message: "Question submission response was interrupted"}};}
        return {data: result};
      } catch (error) {return {error: {code: error.code, message: error.message}};}
    });
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = new URL(request.url()), js = body => request.respond({status: 200, contentType: "application/javascript", body});
      if (url.hostname === "firebasestorage.googleapis.com") return request.respond({status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4WQAAAAASUVORK5CYII=", "base64")});
      if (url.origin !== origin) return request.abort();
      if (url.pathname.includes("/__/firebase/") || url.pathname === "/init_fb.js") return js("");
      if (url.pathname.endsWith("/site_admin_page_loader.js")) return js('document.documentElement.hidden=false;const host=document.getElementById("news-admin");host.id="test-news-admin";const m=await import(new URL(document.querySelector("[data-page-module]").dataset.pageModule,location.href));host.id="news-admin";window.newsAdmin=m.mountNewsAdmin({previewOptions:{pollMs:25}});');
      if (url.pathname.endsWith("/utils/firebase/firebase_auth.js")) return js('export const requireCurrentFirebaseAuthUser=()=>({uid:"admin",email:"admin@example.test",emailVerified:true});');
      if (url.pathname.endsWith("/utils/firebase/firebase_ops.js")) return js('export const getFirebaseApp=()=>({functions:()=>({httpsCallable:()=>async({action,input})=>{const r=await window.__newsCall(action,input);if(r.error)throw Object.assign(Error(r.error.message),{code:r.error.code});return r;}})});');
      request.continue();
    });
    const status = text => page.waitForFunction(text => document.getElementById("news-preview-status").textContent.includes(text), {timeout: 30000}, text);
    await page.setViewport({width: 1366, height: 950});
    await page.goto(origin + "/features/student_news/pages/admin/news_admin.html", {waitUntil: "networkidle0"});
    await status("Options temporarily unavailable"); await page.click("#news-preview-options"); await status("Choose a grade");
    assert.equal(await page.$eval("#news-preview-progress", node => node.hidden), true);
    await page.click("#news-preview-generate"); await status("Preview response was interrupted");
    assert.equal(await page.$eval("#news-preview-progress", node => node.dataset.state), "paused");
    assert.equal(await page.$eval("#news-preview-grade", node => node.disabled), true, "an uncertain request keeps its original options for a safe retry");
    await page.click("#news-preview-generate"); await status("Preview ready");
    assert.equal(await page.$eval("#news-preview-progress progress", node => node.value), 100, "admin generation completion reaches 100 before answering questions");
    assert.equal((await system.db.collection("newsGenerations").where("kind", "==", "edition").get()).size, 1, "retrying a lost response uses the same job");
    assert.equal(calls.filter(call => call.action === "generateNewsPreview")[0].input.clientRequestId, calls.filter(call => call.action === "generateNewsPreview")[1].input.clientRequestId);
    assert.equal((await system.db.collection("newsStories").get()).size, 0, "preview does not publish automatically");
    assert.match(await page.$eval("#news-preview-title", node => node.textContent), /English/);
    assert.equal(await page.$$eval("#news-preview-sources a", nodes => nodes.length), 1);
    assert.match(await page.$eval("#news-preview-meta", node => node.textContent), /334 words · Target: 400/);
    assert.equal(system.calls.adapt, 2, "only one correction is attempted even when both drafts miss the target");
    await page.waitForSelector("#news-preview-questions .news-question-input");
    assert.equal(await page.$$eval(".news-question-input", nodes => nodes.length), 3);
    assert.equal(await page.$eval(".news-questions-submit", button => button.disabled), true);
    await page.$$eval(".news-question-input", inputs => inputs.forEach((input, i) => {input.value = [" SCIENCE   EXHIBITION ", "SPACE", "Tuesday"][i]; input.dispatchEvent(new Event("input", {bubbles: true}));}));
    await page.click(".news-questions-submit");
    await page.waitForFunction(() => document.querySelector(".news-questions-status").textContent.includes("response was interrupted"));
    assert.equal(await page.$eval("#news-preview-article-language", select => select.disabled), true, "an uncertain submission retains the original answers");
    await page.click(".news-questions-retry");
    await page.waitForFunction(() => document.querySelector(".news-question-score").textContent === "Score: 2 / 3");
    assert.equal(await page.$$eval(".news-question-input", inputs => inputs.length), 0, "submitted answers are review-only");
    assert.match(await page.$eval(".news-question-list", node => node.textContent), /Correct answer: Monday/);
    assert.equal(system.calls.questions, 1);
    await page.select("#news-preview-article-language", "French"); await status("Language response was interrupted");
    assert.equal(await page.$eval("#news-preview-progress", node => node.hidden), true);
    assert.equal(await page.$eval("#news-preview-language-progress", node => node.dataset.state), "paused");
    assert.ok(await page.$eval("#news-preview-language-progress progress", node => node.value < 100));
    assert.match(await page.$eval("#news-preview-title", node => node.textContent), /English/, "the previous article stays readable when a language request is interrupted");
    assert.equal(await page.$eval("#news-preview-add", node => node.disabled), true);
    await page.click("#news-preview-retry"); await status("Preview ready");
    assert.match(await page.$eval("#news-preview-title", node => node.textContent), /French/);
    assert.equal(await page.$eval("#news-preview-language-progress progress", node => node.value), 100);
    await page.waitForFunction(() => document.querySelector(".news-question-list").textContent.includes("Correct answer: French Monday"));
    assert.equal(await page.$eval(".news-question-score", node => node.textContent), "Score: 2 / 3", "language changes preserve the completed attempt");
    assert.equal(await page.$eval(".news-questions-submit", node => node.hidden), true);
    assert.equal((await system.db.collection("newsGenerations").where("kind", "==", "edition").get()).size, 2, "retrying a language switch does not create duplicate jobs");
    assert.equal((await system.db.collection("newsStories").get()).size, 0, "switching preview language does not publish it");
    const adaptations = system.calls.adapt;
    await page.select("#news-preview-article-language", "English"); await status("Preview ready");
    await page.waitForFunction(() => document.getElementById("news-preview-title").textContent.includes("English"));
    assert.equal(system.calls.adapt, adaptations, "returning to the original language is cached");
    await page.waitForSelector("#news-preview-page .news-vocabulary-term");
    assert.equal(await page.$$("#news-preview-page .news-vocabulary-term").then(nodes => nodes.length), 2);
    const meaningRequestsBefore = calls.filter(call => ["requestNewsMeaning", "getNewsMeaning"].includes(call.action)).length;
    await page.click("#news-preview-page .news-vocabulary-term");
    assert.match(await page.$eval(".news-article-meaning", node => node.textContent), /English definition/);
    assert.equal(calls.filter(call => ["requestNewsMeaning", "getNewsMeaning"].includes(call.action)).length, meaningRequestsBefore, "first click immediately shows the prepared article-language meaning without an API or LLM request");
    assert.equal(system.calls.meaning, 0);
    assert.equal(await page.$eval(".news-meaning-progress", node => node.hidden), true);
    await page.select(".news-meaning-language", "French");
    await page.waitForFunction(() => document.querySelector(".news-word-meaning").textContent.includes("Meaning response was interrupted"));
    assert.equal(await page.$eval(".news-meaning-language", node => node.disabled), false);
    assert.equal(await page.$eval(".news-meaning-progress", node => node.dataset.state), "paused");
    await page.click(".news-meaning-retry");
    await page.waitForFunction(() => document.querySelector(".news-word-meaning").textContent.includes("French meaning"));
    assert.equal(system.calls.meaning, 1, "retry of a lost meaning response uses the same shared job");
    assert.equal(await page.$eval(".news-meaning-progress progress", node => node.value), 100);
    await page.click(".news-meaning-close"); await page.click("#news-preview-page .news-vocabulary-term");
    assert.deepEqual(await page.$$eval(".news-meaning-language option", nodes => nodes.filter(node => node.value).map(node => node.value)), ["French", "Tamil"], "last choice is first while every other language remains available");
    assert.equal(await page.$eval(".news-meaning-language", node => node.value), "", "the remembered language does not force a selection");
    assert.equal(await page.$eval(".news-meaning-progress", node => node.hidden), true);
    await page.select(".news-meaning-language", "French");
    await page.waitForFunction(() => document.querySelector(".news-word-meaning").textContent.includes("French meaning"));
    assert.equal(system.calls.meaning, 1, "cached meanings do not invoke the LLM again");
    await page.select(".news-meaning-language", "Tamil");
    await page.select(".news-meaning-language", "French");
    await page.waitForFunction(() => document.querySelector(".news-word-meaning").textContent.includes("French meaning"));
    assert.equal((await system.db.doc("studentNews/admin").get()).data().lastMeaningLanguage, "French", "rapid choices remember the newest language rather than a slow earlier request");
    await page.select(".news-meaning-language", "Tamil");
    await page.waitForFunction(() => document.querySelector(".news-word-meaning").textContent.includes("Tamil meaning"));
    assert.match(await page.$eval(".news-article-meaning", node => node.textContent), /English definition/, "article-language meaning stays visible beneath other language requests");
    const originalAboveOther = await page.evaluate(() => document.querySelector(".news-article-meaning").getBoundingClientRect().bottom <= document.querySelector(".news-other-languages").getBoundingClientRect().top);
    assert.equal(originalAboveOther, true, "article meaning appears above the other-language selector");
    await page.screenshot({path: "/tmp/rhx-news-meaning-desktop.png"});
    await page.setViewport({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.querySelector(".news-meaning-dialog").scrollWidth <= document.querySelector(".news-meaning-dialog").clientWidth), true);
    await page.screenshot({path: "/tmp/rhx-news-meaning-mobile.png"});
    await page.setViewport({width: 1366, height: 950});
    await page.click(".news-meaning-close");
    await page.click("#news-preview-add"); await status("Temporary pool save failure"); await page.click("#news-preview-add"); await status("Article added");
    assert.equal((await system.db.collection("newsStories").get()).size, 1);
    const storyId = (await system.db.collection("newsStories").get()).docs[0].id;
    await page.select("#news-preview-story", storyId); await page.select("#news-preview-grade", "1"); await page.select("#news-preview-language", "French");
    await page.click("#news-preview-generate"); await status("Preview ready");
    assert.equal(await page.$eval("#news-preview-progress progress", node => node.value), 100, "admin generation completion reaches 100 before answering questions");
    assert.equal(system.calls.discover, 1, "grade adaptation reuses the selected pool story");
    assert.equal(system.calls.ai, 3); assert.match(await page.$eval("#news-preview-position", node => node.textContent), /1 of 3/);
    assert.match(await page.$eval("#news-preview-page figcaption", node => node.textContent), /AI-generated illustration/);
    await page.waitForSelector(".news-question-choice");
    assert.equal(await page.$$eval(".news-question-choice", nodes => nodes.length), 5);
    assert.equal(await page.$$eval(".news-question-blank", nodes => nodes.length), 3);
    await page.$eval("#news-preview-questions", node => node.scrollIntoView());
    await page.screenshot({path: "/tmp/rhx-news-questions-bank-desktop.png"});
    await page.setViewport({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.$eval("#news-preview-questions", node => node.scrollIntoView({block: "start"}));
    await page.screenshot({path: "/tmp/rhx-news-questions-bank-mobile.png"});
    await page.setViewport({width: 1366, height: 950});
    const pictureQuestionRef = calls.filter(call => call.action === "getNewsQuestions").at(-1).input;
    const pictureQuestions = await system.service.getNewsQuestions(pictureQuestionRef, {auth: {uid: "admin"}});
    const pictureKey = await system.repository.questionLanguage(pictureQuestions.setId, require("../functions/features/news_article/domain/news_questions").languageId("French"));
    for (const question of pictureKey.questions) {await page.click('.news-question-blank[data-question-id="' + question.id + '"]'); await page.click('.news-question-choice[data-choice-id="' + question.answerChoiceId + '"]');}
    await page.click(".news-questions-submit");
    await page.waitForFunction(() => document.querySelector(".news-question-score").textContent === "Score: 3 / 3");
    await page.waitForSelector("#news-preview-page .news-vocabulary-term");
    const beforeFrenchClick = calls.filter(call => ["requestNewsMeaning", "getNewsMeaning"].includes(call.action)).length;
    await page.click("#news-preview-page .news-vocabulary-term");
    assert.match(await page.$eval(".news-article-meaning", node => node.textContent), /French definition/, "the immediate meaning follows the displayed article language");
    assert.equal(calls.filter(call => ["requestNewsMeaning", "getNewsMeaning"].includes(call.action)).length, beforeFrenchClick);
    assert.ok(!(await page.$$eval(".news-meaning-language option", nodes => nodes.map(node => node.value))).includes("French"));
    await page.click(".news-meaning-close");
    await page.click("#news-preview-next"); assert.match(await page.$eval("#news-preview-position", node => node.textContent), /2 of 3/);
    assert.equal(await page.$$eval("#news-preview-page .news-vocabulary-term", nodes => nodes.length), 0, "only the first occurrence across the article is highlighted");
    const imageUrls = await page.$$eval("#news-preview-page img", nodes => nodes.map(node => node.src));
    await page.select("#news-preview-article-language", "English");
    await page.waitForFunction(() => document.getElementById("news-preview-title").textContent.includes("English")); await status("Preview ready");
    assert.equal(system.calls.ai, 3, "an unpublished picture preview reuses its images in another language");
    assert.equal(system.calls.discover, 1);
    assert.deepEqual(await page.$$eval("#news-preview-page img", nodes => nodes.map(node => node.src)), imageUrls);
    await page.waitForFunction(() => document.querySelector(".news-question-score").textContent === "Score: 3 / 3");
    assert.equal(await page.$$eval(".news-question-blank", nodes => nodes.length), 0, "word-bank submissions stay final after switching language");
    assert.match(await page.$eval("#news-preview-position", node => node.textContent), /2 of 3/, "language switching retains the current page");
    const cachedAdaptations = system.calls.adapt;
    await page.select("#news-preview-article-language", "French");
    await page.waitForFunction(() => document.getElementById("news-preview-title").textContent.includes("French")); await status("Preview ready");
    assert.equal(system.calls.adapt, cachedAdaptations);
    await page.click("#news-preview-add"); await status("Article added");
    assert.equal(await page.$eval("#news-preview-story", node => node.value), storyId, "pool publication preserves the selected story");
    await page.select("#news-preview-language", "English"); await page.click("#news-preview-generate"); await status("Preview ready");
    assert.equal(await page.$eval("#news-preview-progress progress", node => node.value), 100, "admin generation completion reaches 100 before answering questions");
    assert.equal(system.calls.ai, 3, "new language reuses the image set");
    assert.equal((await system.db.collection("newsStories").get()).size, 1);
    await page.select("#news-preview-grade", "3"); await page.click("#news-preview-generate"); await status("Preview ready");
    assert.equal(await page.$eval("#news-preview-progress progress", node => node.value), 100, "admin generation completion reaches 100 before answering questions");
    assert.match(await page.$eval("#news-preview-page figcaption", node => node.textContent), /Representative photo/);
    assert.equal(await page.$$eval("#news-preview-page figcaption a", nodes => nodes.length), 2, "web photos show licence and source links");
    assert.equal(system.calls.ai, 3, "web photos do not invoke AI illustration generation");
    await page.$eval("#news-common-instructions", node => {node.value += " More concise."; node.dispatchEvent(new Event("input", {bubbles: true}));});
    assert.equal(await page.$eval("#news-preview-generate", button => button.disabled), true, "unsaved settings block a misleading preview");
    await page.click("#news-save"); await page.waitForFunction(() => document.getElementById("news-status").textContent === "Settings saved.");
    assert.equal(await page.$eval("#news-preview-generate", button => button.disabled), false);
    await page.screenshot({path: "/tmp/rhx-news-preview-desktop.png", fullPage: true});
    await page.setViewport({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({path: "/tmp/rhx-news-preview-mobile.png", fullPage: true});
    assert.deepEqual(errors, []);
    console.log("PASS: preview generation, private drafts, publication, vocabulary, typed/word-bank comprehension, one submission with lost-response recovery, translated review, image reuse, and desktop/mobile layout.");
  } finally {await browser?.close(); await new Promise(resolve => server.close(resolve)); await system.db.terminate();}
})().catch(error => {console.error(error); process.exitCode = 1;});
