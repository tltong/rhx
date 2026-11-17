const assert = require("node:assert/strict"), http = require("node:http"), fs = require("node:fs"), path = require("node:path"), {createRequire} = require("node:module");
const fromFunctions = createRequire(path.resolve(__dirname, "../functions/package.json"));
const {createDemoTestSystem} = require("../functions/features/demo/test_support.cjs");
const {createDemoHandler} = require("../functions/demo");

(async () => {
  const system = await createDemoTestSystem("demo-rhx-demo-browser"), handler = createDemoHandler({getFeature: () => system.service});
  const publicRoot = path.resolve(__dirname, "../public"), errors = [], calls = [], prepared = [];
  let browser, page, server, lostPractice = true, lostNews = true, holdPreparation = false, releasePreparation, preparationHeld;
  async function screenshot(name) {
    if (!process.env.DEMO_SCREENSHOTS) return;
    fs.mkdirSync(process.env.DEMO_SCREENSHOTS, {recursive: true});
    await page.screenshot({path: path.join(process.env.DEMO_SCREENSHOTS, name + ".png")});
  }
  const held = () => new Promise(resolve => {preparationHeld = resolve;});
  async function drain() {
    const roots = await system.db.collection("demoSessions").where("status", "==", "active").get();
    for (const run of roots.docs) {
      for (let i = 0; i < 25; i++) {
        const attempts = await run.ref.collection("attempts").where("status", "==", "queued").get();
        if (attempts.empty) break;
        for (const attempt of attempts.docs) await system.service.runPractice(run.id, attempt.id, attempt.data().requestSequence);
      }
    }
    await system.drainNews();
  }
  try {
    server = http.createServer((request, response) => {
      let pathname = new URL(request.url, "http://localhost").pathname;
      if (pathname === "/demo") pathname = "/features/demo/pages/demo.html";
      const file = path.resolve(publicRoot, "." + pathname);
      if (!file.startsWith(publicRoot + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {response.writeHead(404); return response.end();}
      response.setHeader("Content-Type", file.endsWith(".html") ? "text/html" : file.endsWith(".css") ? "text/css" : "application/javascript");
      response.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const origin = "http://127.0.0.1:" + server.address().port;
    const {default: puppeteer} = await import(fromFunctions.resolve("puppeteer"));
    browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"]});
    page = await browser.newPage(); page.setDefaultTimeout(45000); page.on("pageerror", error => errors.push(error.message));
    await page.exposeFunction("__demoCall", async payload => {
      calls.push(payload.action);
      try {
        const result = await handler({data: payload, rawRequest: {ip: "127.0.0.1"}});
        if (payload.action === "preparePractice") prepared.push(result.practice);
        await drain();
        if (payload.action === "submitPractice" && lostPractice) {lostPractice = false; return {error: {code: "unavailable", message: "Submission response interrupted"}};}
        if (payload.action === "submitNewsQuestions" && lostNews) {lostNews = false; return {error: {code: "unavailable", message: "News response interrupted"}};}
        if (payload.action === "preparePractice" && holdPreparation) {
          holdPreparation = false; preparationHeld();
          await new Promise(resolve => {releasePreparation = resolve;});
        }
        return {data: result};
      } catch (error) {return {error: {code: error.code || "unavailable", message: error.message}};}
    });
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = new URL(request.url()), js = body => request.respond({status: 200, contentType: "application/javascript", body});
      if (url.hostname === "firebasestorage.googleapis.com") return request.respond({status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4WQAAAAASUVORK5CYII=", "base64")});
      if (url.origin !== origin) return request.abort();
      if (url.pathname.includes("/__/firebase/")) return js('(()=>{const app={firestore:()=>({}),functions:()=>({httpsCallable:()=>async payload=>{const r=await window.__demoCall(payload);if(r.error)throw Object.assign(Error(r.error.message),{code:r.error.code});return{data:r.data};}})};window.firebase={apps:[app],app:()=>app,initializeApp:()=>app,firestore:()=>({})};})();');
      return request.continue();
    });
    const text = async id => page.$eval("#" + id, element => element.textContent);
    async function waitText(id, expected) {await page.waitForFunction((name, value) => document.getElementById(name).textContent.includes(value), {}, id, expected);}
    async function subject(name) {
      await page.waitForSelector("#pane-subjects:not([hidden])");
      await page.evaluate(value => [...document.querySelectorAll(".subject-card")].find(button => button.textContent.includes(value)).click(), name);
    }
    async function setup() {
      await page.waitForFunction(() => !document.getElementById("demo-setup-continue").disabled);
      await page.click("#demo-setup-continue"); await page.waitForSelector("#pane-subjects:not([hidden])");
    }
    await page.setViewport({width:1000,height:850}); await page.goto(origin + "/demo", {waitUntil:"networkidle0"});
    await waitText("demo-balance", "1 coin"); await setup();
    assert.equal(await page.$eval("#pane-news", element => element.hidden), true);
    assert.equal(await page.$eval("#pane-subjects", element => element.textContent.includes("Read news")), false);
    await subject("Mathematics");
    assert.equal(await text("demo-practice-type"), "MCQ");
    assert.equal(await page.$("select#demo-practice-type"), null, "practice type is displayed, not selected");
    await screenshot("practice-setup"); await page.select("#demo-difficulty", "hard");
    await page.$eval("#demo-question-count", element => {element.value = "2";});
    await page.click("#demo-start-practice"); await page.waitForSelector('#demo-answer-form:not([hidden]) input[name="demo-q-0"]');
    assert.equal(await page.$eval("#demo-fill-correct-answers", element => element.hidden), true);
    await page.click('input[name="demo-q-0"][value="b"]'); await page.click('input[name="demo-q-1"][value="a"]');
    await page.click("#demo-submit-practice"); await waitText("demo-submit-practice", "Check submission");
    await page.click("#demo-submit-practice"); await waitText("demo-practice-result", "1 / 2 correct");
    assert.equal(await text("demo-balance"), "21 coins");
    await page.evaluate(() => [...document.querySelectorAll("#demo-practice-result button")].find(button => button.textContent === "Review this question").click());
    await page.waitForSelector("#demo-tutor input"); await page.click("#demo-tutor-fill-answer");
    await page.waitForFunction(() => document.querySelector("#demo-tutor input").value === "2");
    assert.equal(await page.$eval("#demo-tutor input", element => element.disabled), false);
    assert.equal(await text("demo-balance"), "21 coins", "tutor autofill does not award more coins");
    assert.equal(await page.$$eval("#demo-tutor button", buttons => buttons.some(button => button.textContent === "Next step")), false);
    await page.$eval("#demo-tutor input", element => {element.value = "edited"; element.dispatchEvent(new Event("input", {bubbles: true}));});
    await page.click("#demo-tutor-fill-answer"); await page.waitForFunction(() => document.querySelector("#demo-tutor input").value === "2");
    await page.setViewport({width:360,height:850});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await screenshot("tutor-fill-answer-mobile"); await page.setViewport({width:1000,height:850});
    await page.click('#demo-tutor button[type="submit"]'); await waitText("demo-tutor", "Next step");
    await page.evaluate(() => [...document.querySelectorAll("#demo-tutor button")].find(button => button.textContent === "Next step").click());
    await page.click("#demo-tutor-fill-answer"); await page.waitForFunction(() => document.querySelector("#demo-tutor input").value === "3");
    await page.click('#demo-tutor button[type="submit"]'); await waitText("demo-tutor", "Finish tutor review");
    assert.equal(await text("demo-balance"), "21 coins");
    await page.$eval("#demo-question-count", element => {element.value = "0";});
    await page.click("#demo-back-subjects"); await subject("English");
    assert.deepEqual(await page.$$eval("#demo-practice-topic option", options => options.map(option => option.value).filter(Boolean).sort()), ["grammar", "writing"], "topics from different practice types appear together");
    assert.equal(await page.$eval("#demo-start-practice", element => element.disabled), true);
    await page.select("#demo-practice-topic", "grammar"); assert.equal(await text("demo-practice-type"), "Fill in the blanks");
    assert.equal(await page.$eval("#demo-practice-options", element => element.hidden), false);
    assert.equal(await page.$eval("#demo-difficulty", element => element.disabled), false);
    assert.equal(await page.$eval("#demo-question-count-field", element => element.hidden), true);
    await page.select("#demo-practice-topic", "writing"); assert.equal(await text("demo-practice-type"), "Essay");
    assert.equal(await page.$eval("#demo-practice-options", element => element.hidden), true);
    assert.equal(await page.$eval("#demo-difficulty", element => element.disabled), true);
    assert.equal(await page.$eval("#demo-question-count", element => element.disabled), true);
    assert.equal(await page.$eval("#demo-practice-setup", element => element.checkValidity()), true, "an invalid hidden MCQ count does not block an essay topic");
    await page.setViewport({width:360,height:850});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await screenshot("topic-selection-mobile"); await page.setViewport({width:1000,height:850});
    await page.click("#demo-start-practice"); await page.waitForSelector("#demo-essay-answer");
    assert.equal(await page.$eval("#demo-fill-correct-answers", element => element.hidden), true);
    await page.type("#demo-essay-answer", "I found treasure today."); await page.click("#demo-submit-practice"); await waitText("demo-practice-result", "Score: 85%");
    assert.equal(await text("demo-balance"), "41 coins");
    await page.click("#demo-back-subjects"); await subject("English"); await page.select("#demo-practice-topic", "grammar");
    await page.select("#demo-difficulty", "easy");
    await page.setViewport({width:360,height:850});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await screenshot("fill-difficulty-mobile"); await page.setViewport({width:1000,height:850});
    await page.click("#demo-start-practice"); await page.waitForSelector("#demo-blank-q1");
    assert.equal(prepared.at(-1).difficulty, "easy", "the selected fill-in-the-blanks difficulty reaches the backend");
    await page.type("#demo-blank-q1", "too many words");
    assert.equal(await page.$eval("#demo-blank-q1", element => element.checkValidity()), false);
    await page.click("#demo-fill-correct-answers");
    await waitText("demo-status", "Correct answers filled");
    assert.deepEqual(await page.$$eval('#demo-practice-questions input', inputs => inputs.map(input => input.value)), ["walks", "reading"]);
    assert.equal(await page.$eval("#demo-answer-form", element => element.checkValidity()), true);
    assert.equal(await text("demo-balance"), "41 coins", "filling answers does not complete the practice or earn coins");
    await page.$eval("#demo-blank-q1", element => {element.value = "runs"; element.dispatchEvent(new Event("input", {bubbles: true}));});
    assert.equal(await page.$eval("#demo-blank-q1", element => element.disabled), false);
    await page.click("#demo-fill-correct-answers"); await waitText("demo-status", "Correct answers filled");
    assert.equal(await page.$eval("#demo-blank-q1", element => element.value), "walks");
    await page.setViewport({width:360,height:850});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await screenshot("fill-answers-mobile");
    await page.setViewport({width:1000,height:850});
    await page.click("#demo-submit-practice"); await waitText("demo-practice-result", "2 / 2 correct");
    assert.equal(await text("demo-balance"), "61 coins");
    await page.click("#demo-continue-news"); await page.waitForSelector('#demo-news-language option[value="English"]');
    await page.select("#demo-news-language", "English"); await page.click("#demo-read-news");
    await page.waitForSelector("#demo-news-article:not([hidden]) .news-vocabulary-term");
    await page.click(".news-vocabulary-term"); await page.waitForSelector(".news-meaning-dialog[open]");
    await page.select(".news-meaning-language", "French"); await page.waitForFunction(() => document.querySelector(".news-word-meaning").textContent.includes("French meaning"));
    await page.click(".news-meaning-close");
    await page.waitForSelector(".news-question-choice");
    const answers = [["q1", "science exhibition"], ["q2", "space"], ["q3", "Monday"]];
    for (const [id, answer] of answers) {
      await page.evaluate((id, answer) => {
        document.querySelector('[data-question-id="' + id + '"]').click();
        [...document.querySelectorAll(".news-question-choice")].find(button => button.textContent === answer).click();
      }, id, answer);
    }
    await page.click(".news-questions-submit"); await page.waitForFunction(() => document.querySelector(".news-questions-retry").textContent === "Check submission" && !document.querySelector(".news-questions-retry").hidden);
    await page.click(".news-questions-retry"); await waitText("demo-news-rewards", "5 coins earned");
    assert.equal(await text("demo-balance"), "66 coins");
    await page.select("#demo-news-language", "French"); await page.click("#demo-read-news"); await waitText("demo-news-title", "French");
    await page.waitForFunction(() => document.querySelector(".news-question-score").textContent.includes("3 / 3"));
    assert.equal(await text("demo-balance"), "66 coins", "language changes do not create another award");
    await page.setViewport({width:360,height:850});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await screenshot("news-mobile");
    await page.click("#demo-news-finish"); await page.waitForSelector("#pane-summary:not([hidden])");
    assert.equal(await text("summary-practice"), "60"); assert.equal(await text("summary-news"), "5"); assert.equal(await text("summary-total"), "66");
    await screenshot("summary-mobile");
    assert.equal(await page.$eval("#demo-practice-questions", element => element.childElementCount), 0);
    assert.equal(await page.$eval("#demo-news-page", element => element.childElementCount), 0);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    await page.click("#demo-start-again"); await waitText("demo-balance", "1 coin"); await setup(); await subject("Mathematics");
    holdPreparation = true; const waiting = held(); await page.click("#demo-start-practice"); await waiting;
    await page.click("#demo-end"); await page.waitForSelector("#pane-summary:not([hidden])"); releasePreparation();
    await page.waitForFunction(() => document.getElementById("summary-total").textContent === "1");
    assert.equal(await page.$eval("#pane-practice", element => element.hidden), true);
    assert.deepEqual(errors, []);
    assert.equal((await system.db.collection("students").get()).size, 0); assert.equal((await system.db.collection("rewards").get()).size, 0);
    console.log(JSON.stringify({passed:true,flows:["setup","topic selection + read-only practice type","MCQ + lost response","tutor + fill correct answer at each step","essay","fill in the blanks + difficulty choice + fill correct answers","news + vocabulary + translated meaning","news quiz + lost response","language reward deduplication","summary","restart","late response after finish"],mobileWidth:360,runtimeErrors:errors,callCount:calls.length}));
  } catch (error) {
    if (page) console.error(JSON.stringify({status: await page.$eval("#demo-status", element => element.textContent).catch(() => ""),
      errors, recentCalls: calls.slice(-10)}));
    throw error;
  } finally {releasePreparation?.(); await browser?.close(); await new Promise(resolve => server ? server.close(resolve) : resolve()); await system.db.terminate();}
})().catch(error => {console.error(error); process.exitCode = 1;});
