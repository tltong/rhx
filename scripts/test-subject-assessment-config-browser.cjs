// Real responsive admin page; local feature API mocks keep this test away from production.
const assert = require("node:assert/strict"), path = require("node:path");
const fromFunctions = require("node:module").createRequire(path.resolve(__dirname, "../functions/package.json"));
const ORIGIN = process.env.SUBJECT_ASSESSMENT_TEST_ORIGIN || "http://127.0.0.1:8769";
assert.match(ORIGIN, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);

(async () => {
  const {default: puppeteer} = await import(fromFunctions.resolve("puppeteer"));
  const browser = await puppeteer.launch({executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]});
  try {
    const page = await browser.newPage();
    await page.setViewport({width: 390, height: 844});
    const errors = [], saves = [], stored = new Map();
    let failSave = false, failLoad = false, missingTopic = false;
    let globalSettings = null, failGlobalSave = false, failGlobalLoad = false;
    const globalSaves = [];
    const syllabus = {id: "english", country: "Malaysia", level: "primary", year: 3, subject: "English", active: true,
      languages: ["English", "Tamil"]};
    page.on("pageerror", error => errors.push(error.message));
    await page.exposeFunction("__subjectConfigApi", async (action, input) => {
      if (action === "globalGet") {
        if (failGlobalLoad) {failGlobalLoad = false; throw new Error("Temporary interval load failure.");}
        return globalSettings;
      }
      if (action === "globalSave") {
        globalSaves.push(input);
        assert.deepEqual(Object.keys(input).sort(), ["expectedVersion", "intervalDays", "repeatMode"]);
        if (failGlobalSave) {failGlobalSave = false; throw new Error("Temporary interval save failure.");}
        if (input.expectedVersion !== (globalSettings?.version || 0)) throw new Error("Global settings changed in another session. Reload before saving.");
        globalSettings = {repeatMode: input.repeatMode, intervalDays: input.intervalDays, version: input.expectedVersion + 1, updatedAt: new Date().toISOString()};
        return globalSettings;
      }
      if (action === "list") return [syllabus];
      if (action === "options") {
        if (failLoad) {failLoad = false; throw new Error("Temporary load failure. Reload Saved to retry.");}
        return {...input, languageKey: input.language.toLowerCase(), configuration: stored.get(input.language) || null,
          topics: [
            {topicId: "reading", topicName: "Reading <img src=x onerror=alert(1)>", questionType: "normal", error: null},
            {topicId: "writing", topicName: "Writing", questionType: "essay", error: null},
            ...(!missingTopic ? [{topicId: "vocabulary", topicName: "Vocabulary", questionType: "fillInTheBlanks", error: null}] : []),
            {topicId: "unconfigured", topicName: "Unconfigured", questionType: null, error: "Set this topic's format in Syllabus Admin before including it."},
          ]};
      }
      if (action === "save") {
        saves.push(input);
        if (failSave) {failSave = false; throw new Error("Temporary save failure. Your edits are retained.");}
        const previous = stored.get(input.language);
        assert.equal(input.expectedVersion, previous?.version || 0);
        const result = {...input, version: input.expectedVersion + 1, updatedAt: new Date().toISOString()};
        stored.set(input.language, result);
        return result;
      }
      throw new Error("Unexpected operation " + action);
    });
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = new URL(request.url());
      const js = body => request.respond({status: 200, contentType: "application/javascript", body});
      if (url.pathname.includes("/__/firebase/") || url.pathname === "/init_fb.js") return js("");
      if (url.pathname.endsWith("/site_admin_page_loader.js")) return js('document.documentElement.hidden=false; const script=document.querySelector("[data-page-module]"); if(script?.dataset.pageModule) import(new URL(script.dataset.pageModule, location.href).href);');
      if (url.pathname.endsWith("/syllabus_module.js")) return js("export const listSyllabuses=()=>window.__subjectConfigApi('list');");
      if (url.pathname.endsWith("/student_module.js")) return js("export const listStudents=async()=>[];");
      if (url.pathname.endsWith("/subject_assessment_config_module.js")) return js("export const getSubjectAssessmentConfigOptions=input=>window.__subjectConfigApi('options',input); export const saveSubjectAssessmentConfig=input=>window.__subjectConfigApi('save',input); export const getSubjectAssessmentSettings=()=>window.__subjectConfigApi('globalGet'); export const saveSubjectAssessmentSettings=input=>window.__subjectConfigApi('globalSave',input);");
      if (url.origin !== ORIGIN) return request.abort();
      return request.continue();
    });
    const adminPath = "/features/subject_assessment_config/pages/admin/subject_assessment_config_admin.html";
    const waitStatus = text => page.waitForFunction(text => document.querySelector("#config-status").textContent.includes(text), {}, text);
    const row = id => `[data-topic-id="${id}"]`;
    const setCounts = async (id, counts) => {
      await page.$eval(row(id), (card, values) => {
        for (const [key, value] of Object.entries(values)) {
          const input = card.querySelector(`[data-count="${key}"]`);
          input.value = String(value);
          input.dispatchEvent(new Event("input", {bubbles: true}));
        }
      }, counts);
    };
    await page.goto(ORIGIN + adminPath, {waitUntil: "networkidle0"});
    const globalStatus = text => page.waitForFunction(text => document.querySelector("#global-settings-status").textContent.includes(text), {}, text);
    const setIntervalDays = value => page.$eval("#assessment-interval-days", (input, value) => {input.value = String(value); input.dispatchEvent(new Event("input", {bubbles: true}));}, value);
    await globalStatus("Choose a repeat policy");
    assert.equal(await page.$eval("#assessment-repeat-mode", input => input.value), "", "No invented default policy");
    await page.click("#save-global-settings"); await globalStatus("Choose a repeat interval or no repeat");
    assert.equal(globalSaves.length, 0);
    await page.select("#assessment-repeat-mode", "interval");
    assert.equal(await page.$eval("#assessment-interval-days", input => input.value), "", "No invented default interval");
    assert.equal(await page.$eval("#syllabus-select", input => input.value), "");
    for (const value of ["", 0, -1, 1.5]) {await setIntervalDays(value); await page.click("#save-global-settings"); await globalStatus("positive whole number");}
    assert.equal(globalSaves.length, 0);
    await setIntervalDays(7); failGlobalSave = true;
    await page.click("#save-global-settings"); await globalStatus("Temporary interval save failure");
    assert.equal(await page.$eval("#assessment-interval-days", input => input.value), "7", "Failed global save retains input");
    await page.click("#save-global-settings"); await globalStatus("policy saved");
    assert.equal(globalSettings.intervalDays, 7); assert.equal(stored.size, 0, "Global interval saves without selecting any subject");
    await setIntervalDays(14);
    globalSettings = {...globalSettings, version: 2, intervalDays: 21};
    await page.click("#save-global-settings"); await globalStatus("another session");
    assert.equal(await page.$eval("#assessment-interval-days", input => input.value), "14");
    delete globalSettings.repeatMode;
    await page.click("#reload-global-settings"); await globalStatus("policy loaded");
    assert.equal(await page.$eval("#assessment-repeat-mode", input => input.value), "interval", "Legacy interval-only settings load correctly");
    assert.equal(await page.$eval("#assessment-interval-days", input => input.value), "21");
    failGlobalLoad = true; await page.click("#reload-global-settings"); await globalStatus("Temporary interval load failure");
    assert.equal(await page.$eval("#save-global-settings", button => button.disabled), true);
    await page.click("#reload-global-settings"); await globalStatus("policy loaded");
    await page.select("#assessment-repeat-mode", "none");
    assert.equal(await page.$eval("#assessment-interval-field", field => field.hidden), true);
    assert.equal(await page.$eval("#assessment-interval-days", input => input.disabled && !input.required), true);
    failGlobalSave = true; await page.click("#save-global-settings"); await globalStatus("Temporary interval save failure");
    assert.equal(await page.$eval("#assessment-repeat-mode", input => input.value), "none", "Failed saves retain no-repeat selection");
    await page.click("#save-global-settings"); await globalStatus("policy saved");
    assert.equal(globalSettings.repeatMode, "none"); assert.equal(globalSettings.intervalDays, null);
    await page.select("#assessment-repeat-mode", "interval"); await setIntervalDays(14);
    await page.click("#reload-global-settings"); await globalStatus("policy loaded");
    assert.equal(await page.$eval("#assessment-repeat-mode", input => input.value), "none");
    assert.equal(await page.$eval("#assessment-interval-days", input => input.value), "");
    globalSettings = {...globalSettings, repeatMode: "interval", intervalDays: 28, version: globalSettings.version + 1};
    await page.click("#save-global-settings"); await globalStatus("another session");
    assert.equal(await page.$eval("#assessment-repeat-mode", input => input.value), "none", "A stale save preserves the unsaved policy");
    await page.click("#reload-global-settings"); await globalStatus("policy loaded");
    assert.equal(await page.$eval("#assessment-repeat-mode", input => input.value), "interval");
    await setIntervalDays(21); await page.click("#save-global-settings"); await globalStatus("policy saved");
    await page.waitForFunction(() => !document.querySelector("#syllabus-select").disabled);
    await page.select("#syllabus-select", "english");
    await page.select("#language-select", "English");
    assert.equal(await page.$eval("#assessment-interval-days", input => input.value), "21", "Subject selection does not change the global interval");
    await waitStatus("No configuration saved");
    assert.equal(await page.$$eval(".format-label", nodes => nodes.map(node => node.textContent).join("|")), "MCQ|Essay|Fill in the blanks|Format unavailable");
    assert.equal(await page.$(".topic-card img"), null, "Topic names render as text");
    assert.equal(await page.$eval("#save-config", button => button.disabled), false);
    await page.click("#save-config");
    await waitStatus("Select at least one topic");
    assert.equal(saves.length, 0);

    for (const id of ["reading", "writing", "vocabulary"]) await page.click(row(id) + ' input[type="checkbox"]');
    await setCounts("reading", {totalCount: 6, easy: 2, medium: 3, hard: 0});
    await setCounts("writing", {totalCount: 3, easy: 1, medium: 1, hard: 1});
    await setCounts("vocabulary", {totalCount: 2, easy: 0, medium: 1, hard: 1});
    assert.match(await page.$eval(row("vocabulary") + " label[for]", label => label.textContent), /Total passages/);
    await page.click("#save-config");
    await waitStatus("Correct the highlighted");
    assert.equal(saves.length, 0);
    await setCounts("reading", {hard: 1.5});
    await page.click("#save-config");
    assert.equal(saves.length, 0, "Fractional counts are rejected");
    await setCounts("reading", {hard: -1});
    await page.click("#save-config");
    assert.equal(saves.length, 0, "Negative counts are rejected");
    await setCounts("reading", {hard: 1});
    assert.equal(await page.$eval("#allocation-summary", element => element.textContent), "3 topics selected · 9 questions · 2 passages");
    failSave = true;
    await page.click("#save-config");
    await waitStatus("Temporary save failure");
    assert.equal(await page.$eval(row("reading") + ' [data-count="hard"]', input => input.value), "1");
    await page.click("#save-config");
    await waitStatus("configuration saved.");
    assert.equal(stored.size, 1);
    assert.deepEqual(saves[1].topics.map(topic => topic.questionType), ["normal", "essay", "fillInTheBlanks"]);
    assert.equal(saves[1].topics[2].totalCount, 2);
    assert.equal(await page.$("select[data-question-type]"), null, "There is no format override control");
    assert.equal(await page.$('input[name="name"]'), null, "There are no named alternate configurations");

    await page.reload({waitUntil: "networkidle0"});
    await page.select("#syllabus-select", "english");
    await page.select("#language-select", "English");
    await waitStatus("configuration loaded.");
    assert.equal(await page.$eval(row("reading") + ' [data-count="totalCount"]', input => input.value), "6");
    assert.equal(await page.$$eval('.topic-card input[type="checkbox"]:checked', nodes => nodes.length), 3);
    await setCounts("reading", {totalCount: 7, medium: 4});
    await page.select("#language-select", "Tamil");
    await waitStatus("No configuration saved");
    assert.equal(await page.$$eval('.topic-card input[type="checkbox"]:checked', nodes => nodes.length), 0);
    await page.select("#language-select", "English");
    await waitStatus("unsaved changes");
    assert.equal(await page.$eval(row("reading") + ' [data-count="totalCount"]', input => input.value), "7", "Switching languages retains the unsaved draft");
    await page.click("#reload-config");
    await waitStatus("configuration loaded.");
    assert.equal(await page.$eval(row("reading") + ' [data-count="totalCount"]', input => input.value), "6");

    failLoad = true;
    await page.click("#reload-config");
    await waitStatus("Temporary load failure");
    assert.equal(await page.$eval("#save-config", button => button.disabled), true);
    await page.click("#reload-config");
    await waitStatus("configuration loaded.");
    missingTopic = true;
    await page.click("#reload-config");
    await waitStatus("configuration loaded.");
    assert.match(await page.$eval(row("vocabulary") + ".topic-card .topic-error", element => element.textContent), /no longer belongs/);
    await page.click("#save-config");
    await waitStatus("Correct the highlighted");
    await page.click(row("vocabulary") + ' input[type="checkbox"]');
    await page.click("#save-config");
    await waitStatus("configuration saved.");
    assert.equal(stored.get("English").version, 2);
    assert.equal(stored.get("English").topics.length, 2);
    assert.equal(stored.size, 1, "Editing replaces the same configuration");
    assert.equal(await page.$(row("vocabulary")), null, "Removed topics disappear after saving the corrected configuration");

    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "No mobile horizontal overflow");
    await page.screenshot({path: "/tmp/subject-assessment-config-mobile.png", fullPage: true});
    await page.setViewport({width: 1280, height: 900});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.goto(ORIGIN + "/features/site_admin/pages/site_admin/site_admin.html", {waitUntil: "networkidle0"});
    assert.ok(await page.$(`a[href="${adminPath}"]`), "Site Admin links to the configuration page");
    assert.deepEqual(errors, []);
    console.log("PASS: Global interval/no-repeat choices, legacy settings, no default, save/reload, validation, stale saves and failure recovery; mobile/desktop topic configuration, language drafts and removed topics.");
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
