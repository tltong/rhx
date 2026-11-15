const assert = require("node:assert/strict"), fs = require("node:fs"), http = require("node:http"), path = require("node:path"), {createRequire} = require("node:module");
const fromFunctions = createRequire(path.resolve(__dirname, "../functions/package.json"));
(async () => {
  const root = path.resolve(__dirname, "../public"), calls = [], errors = [];
  const server = http.createServer((request, response) => {
    const file = path.resolve(root, "." + new URL(request.url, "http://local").pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {response.writeHead(404); return response.end();}
    response.setHeader("Content-Type", file.endsWith(".html") ? "text/html" : file.endsWith(".css") ? "text/css" : "application/javascript"); response.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); const origin = "http://127.0.0.1:" + server.address().port;
  const {default: puppeteer} = await import(fromFunctions.resolve("puppeteer")); let browser, failures = 0, holdFrench = false, releaseFrench, holdMeaning = false, releaseMeaning;
  let meaningResult = {status: "queued"};
  let result = {assignmentId: "2026-11-15_international", generationId: "discovery-1", status: "running", stage: "source", progress: {prepared: 0, total: 0}};
  const article = {storyId: "story", editionId: "edition", newsType: "international", country: null, language: "English", title: "English news", actualWordCount: 10,
    publishedAt: "2026-11-15", sources: [], pages: [{position: 1, text: "Students discover something new.", images: []}]};
  try {
    browser = await puppeteer.launch({executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"]});
    const page = await browser.newPage(); page.on("pageerror", error => errors.push(error.message));
    await page.exposeFunction("__progressCall", async (action, input) => {
      calls.push({action, input});
      if (action === "getStudentNewsOverview") return {data: {country: "Malaysia", languages: ["English", "French"], rewardSettings: {completionCoins: 2, allCorrectCoins: 2}, slots: {international: null, local: null}}};
      if (action === "getNewsVocabulary") return {data: {status: "ready", editionId: article.editionId, setId: "vocabulary", actualCount: 1,
        items: [{id: "term", term: "Students", pagePosition: 1, startOffset: 0, endOffset: 8, articleMeaning: input.articleLanguage + " definition of students"}], languages: ["English", "French"]}};
      if (["requestNewsMeaning", "getNewsMeaning"].includes(action)) {
        const saved = structuredClone(meaningResult);
        if (holdMeaning) await new Promise(resolve => {releaseMeaning = resolve;});
        return saved.error ? saved : {data: saved};
      }
      if (action === "getNewsQuestions") return {data: {status: "ready", attemptId: "attempt", answerMode: "typed", language: input.articleLanguage, attempt: null, questions: [1, 2, 3].map(i => ({id: "q" + i, prompt: "Example ____ question."}))}};
      if (failures > 0) {failures--; return {error: {code: "functions/internal", message: "internal"}};}
      if (holdFrench && input.language === "French") await new Promise(resolve => {releaseFrench = resolve;});
      return {data: result.status === "ready" ? {...result, article: {...article, language: input.language, title: input.language + " news"}} : result};
    });
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = new URL(request.url()), js = body => request.respond({status: 200, contentType: "application/javascript", body});
      if (url.origin !== origin) return request.abort();
      if (url.pathname.includes("/__/firebase/") || url.pathname === "/init_fb.js") return js("");
      if (url.pathname.endsWith("/firebase_auth.js")) return js('export const requireCurrentFirebaseAuthUser=()=>({uid:"student"});');
      if (url.pathname.endsWith("/firebase_ops.js")) return js('export const getFirebaseApp=()=>({functions:()=>({httpsCallable:()=>async({action,input})=>{const r=await window.__progressCall(action,input);if(r.error)throw Object.assign(Error(r.error.message),{code:r.error.code});return r;}})});');
      if (url.pathname.endsWith("/student/student_module.js")) return js('export const onStudentAuthStateChanged=callback=>{queueMicrotask(()=>callback({uid:"student"}));return()=>{}};');
      if (url.pathname.endsWith("/news_reader.js")) return js(fs.readFileSync(path.join(root, url.pathname), "utf8").replace("const reader = mountStudentNewsReader();", "const reader = mountStudentNewsReader({pollMs:80,retryDelayMs:300});window.reader=reader;"));
      request.continue();
    });
    const state = (selector = "#news-reader-progress") => page.$eval(selector, host => ({hidden: host.hidden, state: host.dataset.state, value: host.querySelector("progress").value, stage: host.querySelector(".news-progress-stage").textContent, detail: host.querySelector(".news-progress-detail").textContent}));
    const languageState = () => state("#news-reader-language-progress"), meaningState = () => state("#news-reader-vocabulary-meaning-progress");
    const stage = async (name, fields = {}) => {
      result = {...result, stage: name, ...fields}; await page.waitForFunction(name => document.querySelector("#news-reader-progress .news-progress-stage").textContent.includes(name), {}, {
        source: "Finding", deduplicate: "Checking for repeated", publish: "Saving", text: "Writing", word_count: "Adjusting", vocabulary: "Preparing vocabulary", images: "Preparing images", finish: "Finishing",
      }[name]);
      return state();
    };
    await page.goto(origin + "/features/student_news/pages/reader/news_reader.html?newsType=international", {waitUntil: "networkidle0"});
    assert.equal((await state()).hidden, true, "no progress is shown before the student requests an article");
    await page.select("#news-reader-language", "English"); await page.click("#news-reader-open");
    await page.waitForFunction(() => document.querySelector(".news-progress-stage").textContent.includes("Finding"));
    let previous = (await state()).value;
    for (const name of ["deduplicate", "source", "publish", "text", "word_count", "vocabulary", "images"]) {
      const current = await stage(name, name === "text" ? {generationId: "edition-2"} : name === "images" ? {progress: {prepared: 0, total: 3}} : {});
      assert.ok(current.value >= previous && current.value < 100, "a stage restart or job handoff never completes or resets the bar"); previous = current.value;
    }
    result = {...result, progress: {prepared: 2, total: 3}};
    await page.waitForFunction(() => document.querySelector(".news-progress-detail").textContent.includes("2 of 3")); previous = (await state()).value;
    const session = await page.createCDPSession(), tree = await session.send("Accessibility.getFullAXTree");
    assert.ok(tree.nodes.some(node => node.role?.value === "progressbar" && node.name?.value === "Article preparation"));
    assert.match(await page.$eval("#news-reader-progress progress", bar => bar.getAttribute("aria-valuetext")), /Estimated.*Images ready: 2 of 3/);
    await page.screenshot({path: "/tmp/rhx-news-progress-desktop.png"});
    failures = 1; await page.waitForFunction(() => document.querySelector(".news-progress-stage").textContent.includes("Reconnecting"));
    assert.equal((await state()).value, previous); assert.equal(calls.filter(call => call.action === "retryStudentNews").length, 0);
    await page.waitForFunction(() => document.querySelector("#news-reader-progress").dataset.state === "active");
    result = {...result, progress: {prepared: 0, total: 3}};
    await page.waitForFunction(() => document.querySelector(".news-progress-detail").textContent.includes("0 of 3")); assert.equal((await state()).value, previous, "image fallback preserves the estimate while displaying the new image count");
    result = {...result, status: "failed", errorMessage: "Example retryable failure"};
    await page.waitForSelector("#news-reader-retry:not([hidden])"); assert.equal((await state()).state, "paused");
    result = {...result, status: "running"}; await page.click("#news-reader-retry");
    await page.waitForFunction(() => document.querySelector("#news-reader-progress").dataset.state === "active"); assert.ok((await state()).value >= previous);
    await stage("finish", {progress: {prepared: 3, total: 3}}); assert.ok((await state()).value < 100);
    await page.setViewport({width: 390, height: 844}); await page.emulateMediaFeatures([{name: "prefers-reduced-motion", value: "reduce"}]);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.$eval("#news-reader-progress progress", bar => getComputedStyle(bar, "::-webkit-progress-value").animationName), "none");
    await page.screenshot({path: "/tmp/rhx-news-progress-mobile.png"});
    result = {...result, status: "ready", article}; await page.waitForSelector("#news-reader-article:not([hidden])");
    assert.deepEqual((({state, value}) => ({state, value}))(await state()), {state: "ready", value: 100});
    holdFrench = true; await page.select("#news-reader-language", "French"); await page.click("#news-reader-open");
    assert.equal((await state()).hidden, true, "language switching replaces the completed generation bar");
    assert.ok((await languageState()).value < 100, "a new language request gets a fresh bar while the previous article stays readable");
    assert.match((await languageState()).stage, /saved article in French/);
    assert.equal(await page.$eval("#news-reader-title", node => node.textContent), "English news");
    await page.waitForFunction(() => document.getElementById("news-reader-status").textContent.includes("Fetching"));
    result = {...result, status: "running", stage: "text"};
    assert.ok(releaseFrench); holdFrench = false; releaseFrench();
    await page.waitForFunction(() => document.querySelector("#news-reader-language-progress .news-progress-stage").textContent.includes("Preparing the French version"));
    assert.ok((await languageState()).value > 5 && (await languageState()).value < 100);
    await page.screenshot({path: "/tmp/rhx-news-language-progress-mobile.png"});
    result = {...result, status: "ready"};
    await page.waitForFunction(() => document.getElementById("news-reader-title").textContent === "French news"); assert.equal((await languageState()).value, 100);
    assert.match((await languageState()).detail, /ready in French/);
    await page.select("#news-reader-language", "English"); await page.click("#news-reader-open");
    await page.waitForFunction(() => document.getElementById("news-reader-title").textContent === "English news"); assert.equal((await languageState()).value, 100, "a cached language version finishes immediately");

    await page.waitForSelector(".news-vocabulary-term"); await page.click(".news-vocabulary-term");
    assert.equal((await meaningState()).hidden, true, "the prepared article meaning needs no lookup progress");
    assert.match(await page.$eval(".news-article-meaning", node => node.textContent), /English definition/);
    await page.select(".news-meaning-language", "French");
    await page.waitForFunction(() => document.querySelector("#news-reader-vocabulary-meaning-progress progress").value === 25);
    meaningResult = {status: "running"};
    await page.waitForFunction(() => document.querySelector("#news-reader-vocabulary-meaning-progress progress").value === 65);
    assert.match((await meaningState()).stage, /Preparing the meaning in French/);
    assert.equal(await page.$eval(".news-meaning-language", node => node.disabled), false);
    await page.screenshot({path: "/tmp/rhx-news-meaning-progress-mobile.png"});
    meaningResult = {error: {code: "unavailable", message: "Meaning connection interrupted"}};
    await page.waitForSelector(".news-meaning-retry:not([hidden])"); assert.equal((await meaningState()).state, "paused"); assert.equal((await meaningState()).value, 65);
    meaningResult = {status: "ready", meaning: "French meaning of students"};
    await page.click(".news-meaning-retry"); await page.waitForFunction(() => document.querySelector(".news-word-meaning").textContent.includes("French meaning"));
    assert.equal((await meaningState()).value, 100);
    await page.select(".news-meaning-language", ""); assert.equal((await meaningState()).hidden, true);
    holdMeaning = true; await page.select(".news-meaning-language", "French");
    await page.waitForFunction(() => document.querySelector("#news-reader-vocabulary-meaning-progress .news-progress-stage").textContent.includes("Checking for a saved meaning in French"));
    assert.equal((await meaningState()).value, 5);
    await page.click(".news-meaning-close"); assert.equal((await meaningState()).hidden, true);
    assert.ok(releaseMeaning); holdMeaning = false; releaseMeaning();
    await page.click(".news-vocabulary-term");
    await page.waitForFunction(() => !document.querySelector(".news-meaning-dialog").open || document.querySelector(".news-word-meaning").textContent === "");
    assert.equal((await meaningState()).hidden, true, "a late response cannot reopen progress for a closed lookup");
    await page.select(".news-meaning-language", "French");
    await page.waitForFunction(() => document.querySelector("#news-reader-vocabulary-meaning-progress progress").value === 100);
    await page.keyboard.press("Escape"); assert.equal((await meaningState()).hidden, true);
    assert.equal(calls.filter(call => call.action === "requestStudentNews").length, 1);
    assert.equal(calls.filter(call => call.action === "retryStudentNews").length, 1);
    await page.evaluate(() => window.reader.stop()); assert.equal((await state()).hidden, true); assert.equal((await state()).value, 0);
    assert.equal((await languageState()).hidden, true); assert.equal((await meaningState()).hidden, true);
    assert.deepEqual(errors, []); console.log("PASS: generation stages, image fallback, retry recovery, language preparation and cache hits, meaning queue/run/retry/cache progress, close/Escape cleanup, accessible progress, reduced motion, mobile layout and account cleanup.");
  } finally {if (browser) await browser.close(); await new Promise(resolve => server.close(resolve));}
})().catch(error => {console.error(error); process.exitCode = 1;});
