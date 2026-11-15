// Real news admin UI and Firestore persistence; Firebase auth/callable transports are local doubles.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const fromFunctions = require("node:module").createRequire(path.resolve(__dirname, "../functions/package.json"));
const {Firestore} = fromFunctions("firebase-admin/firestore");
const {createStudentNewsFeature} = require("../functions/features/student_news/student_news_module");
const {FirestoreNewsConfigRepository} = require("../functions/features/student_news/infrastructure/firestore_news_config_repository");
const {createStudentNewsHandler} = require("../functions/student_news");
const {ListSyllabusScopeLanguages} = require("../functions/features/syllabusscope/application/list_syllabusscope_languages");
const {FirestoreSyllabusScopeRepository} = require("../functions/features/syllabusscope/infrastructure/firestore_syllabusscope_repository");
assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):\d+$/);

(async () => {
  const projectId = "demo-rhx-news-browser", db = new Firestore({projectId}), root = path.resolve(__dirname, "../public");
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {method: "DELETE"});
  await db.doc("syllabusScope/Malaysia").set({country: "Malaysia", languages: ["English", "Malay", "english"], levels: {}});
  await db.doc("syllabusScope/Singapore").set({country: "Singapore", languages: ["Chinese", "English"], levels: {}});
  const languages = new ListSyllabusScopeLanguages(new FirestoreSyllabusScopeRepository({readCollection: async collection => (await db.collection(collection).get()).docs.map(doc => ({...doc.data(), id: doc.id}))}));
  const feature = createStudentNewsFeature({repository: new FirestoreNewsConfigRepository({getDb: () => db}), listLanguages: () => languages.execute(), requireAdministrator: async context => {assert.equal(context.auth.uid, "admin"); return "admin";}});
  const handler = createStudentNewsHandler({apis: feature}), calls = [];
  let failLoad = true, failSave = true;
  const server = http.createServer((request, response) => {
    const file = path.resolve(root, "." + new URL(request.url, "http://localhost").pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {response.writeHead(404); return response.end();}
    response.setHeader("Content-Type", file.endsWith(".html") ? "text/html" : file.endsWith(".css") ? "text/css" : "application/javascript");
    response.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const {default: puppeteer} = await import(fromFunctions.resolve("puppeteer"));
  let browser;
  try {
    browser = await puppeteer.launch({executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"]});
    const page = await browser.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.exposeFunction("__newsCall", async (action, input) => {
      calls.push({action, input});
      if (action === "getNewsPreviewOptions") return {data: {countries: ["Malaysia"], languages: await languages.execute()}};
      if (action === "listNewsStories") return {data: {stories: []}};
      if (action === "getNewsConfiguration" && failLoad) {failLoad = false; return {error: {message: "Temporary load failure", code: "functions/unavailable"}};}
      if (action === "saveNewsConfiguration" && failSave) {failSave = false; return {error: {message: "Temporary save failure", code: "functions/unavailable"}};}
      try {return {data: await handler({auth: {uid: "admin"}, data: {action, input}})};}
      catch (error) {return {error: {message: error.message, code: "functions/" + error.code}};}
    });
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = new URL(request.url()), js = body => request.respond({status: 200, contentType: "application/javascript", body});
      if (url.origin !== origin) return request.abort();
      if (url.pathname.includes("/__/firebase/") || url.pathname === "/init_fb.js") return js("");
      if (url.pathname.endsWith("/site_admin_page_loader.js")) return js('document.documentElement.hidden=false; await import(new URL(document.querySelector("[data-page-module]").dataset.pageModule,location.href));');
      if (url.pathname.endsWith("/utils/firebase/firebase_auth.js")) return js('export const requireCurrentFirebaseAuthUser=()=>({uid:"admin",email:"admin@example.test",emailVerified:true});');
      if (url.pathname.endsWith("/utils/firebase/firebase_ops.js")) return js('export const getFirebaseApp=()=>({functions:()=>({httpsCallable:name=>async({action,input})=>{if(name!=="studentNews")throw Error("Wrong endpoint");const result=await window.__newsCall(action,input);if(result.error)throw Object.assign(new Error(result.error.message),{code:result.error.code});return result;}})});');
      request.continue();
    });
    const status = text => page.waitForFunction(text => document.querySelector("#news-status").textContent.includes(text), {}, text);
    const edit = (selector, value) => page.$eval(selector, (field, value) => {field.value = String(value); field.dispatchEvent(new Event("input", {bubbles: true}));}, value);
    const open = async () => {await page.goto(origin + "/features/student_news/pages/admin/news_admin.html", {waitUntil: "networkidle0"});};
    await page.setViewport({width: 1366, height: 950});
    await open(); await status("Temporary load failure");
    assert.equal(await page.$eval("#news-config-fields", field => field.disabled), true);
    await page.click("#news-reload"); await status("Default settings loaded");
    assert.equal((await db.collection("newsConfig").get()).size, 0, "loading defaults must not persist configuration");
    assert.equal(await page.$$eval(".grade-card", cards => cards.length), 12);
    assert.equal(await page.$eval("#news-default-words-standardArticle", input => input.value), "400");
    assert.equal(await page.$eval("#news-primary_1-vocabulary", input => input.value), "3");
    assert.equal(await page.$eval("#news-secondary_6-vocabulary", input => input.value), "10");
    assert.equal(await page.$eval("#news-primary_1-question-mode", input => input.value), "word_bank");
    assert.equal(await page.$eval("#news-primary_6-question-mode", input => input.value), "typed");
    assert.equal(await page.$eval("#news-languages", node => node.textContent), "Chinese, English, Malay");
    assert.equal(await page.$("input#news-languages"), null, "languages are not separately editable");
    await page.$$eval(".grade-card", cards => cards.forEach(card => card.open = true));
    await edit("#news-photo-count-pictureStory", 6);
    await page.select("#news-photo-type-pictureStory", "web");
    await edit("#news-default-words-pictureStory", 60);
    await edit("#news-primary_1-words", 0);
    await edit("#news-primary_3-words", 180); await edit("#news-primary_3-pages", 3);
    await edit("#news-primary_3-vocabulary", 7);
    await page.select("#news-primary_3-question-mode", "typed");
    await edit("#news-common-instructions", 'Plain text <img src=x onerror="window.unexpected=true">');
    assert.match(await page.$eval("#news-primary_1-summary", node => node.textContent), /0 words · 6 pages/);
    assert.match(await page.$eval("#news-primary_2-summary", node => node.textContent), /60 words · 6 pages/);
    assert.equal(await page.$eval("#news-primary_1-pages", input => input.disabled), true);
    await page.click("#news-save"); await status("Temporary save failure");
    assert.equal(await page.$eval("#news-primary_1-words", input => input.value), "0", "failed save retains edits");
    await page.click("#news-save"); await status("Settings saved");
    let saved = await feature.loadNewsConfiguration();
    assert.equal(saved.version, 1); assert.equal(saved.gradeSettings.primary[1].targetWordCount, 0);
    assert.equal(saved.gradeSettings.primary[3].pageCount, 3); assert.equal(saved.articleTypes.pictureStory.photoType, "web");
    assert.equal(saved.gradeSettings.primary[3].vocabularyCount, 7);
    assert.equal(saved.gradeSettings.primary[3].questionAnswerMode, "typed");
    assert.equal((await db.collection("newsConfig").get()).size, 16);
    assert.equal(Object.hasOwn((await db.doc("newsConfig/settings").get()).data(), "supportedLanguages"), false);
    await open(); await status("Settings loaded");
    assert.equal(await page.$eval("#news-primary_1-words", input => input.value), "0");
    assert.deepEqual(await page.$$("img"), [], "instructions render as text");
    await page.$eval("#news-primary_3-format", field => {field.closest("details").open = true;});
    await page.select("#news-primary_3-format", "pictureStory");
    assert.equal(await page.$eval("#news-primary_3-pages", input => input.value), "");
    assert.equal(await page.$eval("#news-primary_3-pages", input => input.disabled), true);
    await feature.saveNewsConfiguration({...saved, additionalLlmInstructions: "Concurrent administrator", expectedVersion: 1}, {auth: {uid: "admin"}});
    await db.doc("syllabusScope/Singapore").update({languages: ["English", "Tamil"]});
    await page.click("#news-refresh-languages"); await status("Languages refreshed");
    assert.equal(await page.$eval("#news-languages", node => node.textContent), "English, Malay, Tamil");
    assert.equal(await page.$eval("#news-primary_3-format", input => input.value), "pictureStory", "language refresh preserves edits");
    await page.click("#news-save"); await status("configuration changed");
    assert.equal(await page.$eval("#news-primary_3-format", input => input.value), "pictureStory", "conflict retains local edits");
    assert.equal((await feature.loadNewsConfiguration()).additionalLlmInstructions, "Concurrent administrator");
    await page.click("#news-reload"); await status("Settings loaded");
    assert.equal(await page.$eval("#news-primary_3-format", input => input.value), "multiPageArticle");
    await db.doc("syllabusScope/Malaysia").delete(); await db.doc("syllabusScope/Singapore").delete();
    await page.click("#news-refresh-languages"); await status("Languages refreshed");
    assert.match(await page.$eval("#news-languages", node => node.textContent), /No languages configured/);
    await edit("#news-photo-count-pictureStory", 0);
    const savesBeforeInvalid = calls.filter(call => call.action === "saveNewsConfiguration").length;
    await page.$eval("#news-config-form", form => form.dispatchEvent(new Event("submit", {bubbles: true, cancelable: true})));
    await status("photo count must be");
    assert.equal(calls.filter(call => call.action === "saveNewsConfiguration").length, savesBeforeInvalid);
    await edit("#news-photo-count-pictureStory", 6);
    await page.screenshot({path: "/tmp/rhx-news-config-desktop.png", fullPage: true});
    await page.setViewport({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "mobile has no horizontal overflow");
    await page.screenshot({path: "/tmp/rhx-news-config-mobile.png", fullPage: true});
    assert.deepEqual(errors, []);
    console.log("PASS: news admin persistence, scope-derived languages and refresh, no copied language list, preserved drafts/stale-save protection, inherited defaults, validation, and desktop/mobile layout.");
  } finally {await browser?.close(); await new Promise(resolve => server.close(resolve)); await db.terminate();}
})().catch(error => {console.error(error); process.exitCode = 1;});
