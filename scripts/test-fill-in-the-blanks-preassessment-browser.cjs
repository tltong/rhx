// The real framework configuration page; feature APIs are mocked.
const assert = require("node:assert/strict"), path = require("node:path"), {createRequire} = require("node:module");
const fromFunctions = createRequire(path.resolve(__dirname, "../functions/package.json"));
const {assessmentFrameworkPreAssessmentScoreBands: bands} = require("../functions/schema/assessment_framework_schema");
(async () => {
  const {default: puppeteer} = await import(fromFunctions.resolve("puppeteer"));
  const browser = await puppeteer.launch({executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"]});
  const page = await browser.newPage(); await page.setViewport({width: 390, height: 844});
  const errors = [], saves = []; let rejectSave = false; page.on("pageerror", error => errors.push(error.message));
  const levels = ["first", "second"].map((id, index) => ({id, levelName: id, sequenceOrder: index + 1,
    criteria: {requiredPracticeCount: 2, minimumScore: 60, questionsPerPractice: 1, difficultyLevel: index ? "Hard" : "Easy"}}));
  const frameworks = [
    {id: "fill", name: "Fill placement", frameworkType: "fillInTheBlanks", endLevelName: "Mastered", levels, preAssessment: null},
    {id: "mcq", name: "MCQ", frameworkType: "normal", endLevelName: "Mastered", levels,
      preAssessment: {numberOfQuestions: 10, difficultySplit: {easyPercentage: 40, mediumPercentage: 40, hardPercentage: 20}, scoreLevelSplit: Object.fromEntries(bands.map(({field}) => [field, "first"]))}},
    {id: "essay", name: "Essay", frameworkType: "essay", endLevelName: "Mastered", levels, preAssessment: null},
  ];
  await page.exposeFunction("__frameworkApi", async (action, id, input) => {
    if (action === "list") return frameworks;
    if (action === "get") return frameworks.find(item => item.id === id);
    if (action === "save") {if (rejectSave) throw new Error("Save unavailable"); saves.push({id, input}); frameworks.find(item => item.id === id).preAssessment = input; return input;}
    throw new Error("Unexpected framework operation " + action);
  });
  await page.setRequestInterception(true);
  page.on("request", async request => {
    const url = new URL(request.url());
    if (url.pathname.includes("/__/firebase/") || url.pathname === "/init_fb.js") return request.respond({status: 200, contentType: "application/javascript", body: ""});
    if (url.pathname.endsWith("/site_admin_page_loader.js")) return request.respond({status: 200, contentType: "application/javascript", body:
      'document.documentElement.hidden=false; const script=document.querySelector("[data-page-module]"); import(new URL(script.dataset.pageModule, location.href));'});
    if (url.pathname.endsWith("/assessment_framework_module.js")) return request.respond({status: 200, contentType: "application/javascript", body: `
      export const ASSESSMENT_FRAMEWORK_END_LEVEL_ID="endLevel";
      export const assessmentFrameworkPreAssessmentDifficultyLevels=["easy","medium","hard"];
      export const assessmentFrameworkPreAssessmentScoreBands=${JSON.stringify(bands)};
      export const listAssessmentFrameworks=()=>window.__frameworkApi("list");
      export const getAssessmentFrameworkById=id=>window.__frameworkApi("get",id);
      export const saveAssessmentFrameworkPreAssessment=(id,input)=>window.__frameworkApi("save",id,input);
      export const createAssessmentFrameworkRecord=()=>{throw new Error("Unexpected framework creation")};
      export const updateAssessmentFrameworkRecord=()=>{throw new Error("Unexpected framework update")};
      export const deleteAssessmentFrameworkRecord=()=>{throw new Error("Unexpected framework deletion")};`});
    return request.continue();
  });
  try {
    await page.goto("http://127.0.0.1:8769/features/assessment_framework/pages/admin/assessment_framework_admin.html", {waitUntil: "networkidle0"});
    await page.waitForFunction(() => document.getElementById("framework-select").value === "fill" && !document.getElementById("save-pre-assessment").disabled);
    assert.equal(await page.$eval("#pre-assessment-section", item => item.hidden), false);
    assert.equal(await page.$eval("#fill-pre-assessment-difficulty", item => item.value), "medium");
    assert.equal(await page.$eval("#mcq-pre-assessment-count", item => item.hidden), true);
    assert.equal(await page.$eval("#mcq-pre-assessment-count", item => getComputedStyle(item).display), "none");
    assert.equal(await page.$eval("#mcq-pre-assessment-difficulty", item => item.hidden), true);
    assert.match(await page.$eval("#fill-pre-assessment-options", item => item.textContent), /same score-band rules as MCQ/);
    assert.equal(await page.$$eval("[data-score-field]", items => items.length), 7);
    assert.equal(await page.$eval("#mcq-pre-assessment-adoption", item => item.hidden), false);
    const readPlacement = () => page.evaluate(() => ({difficultyLevel: document.querySelector("#fill-pre-assessment-difficulty").value,
      mapping: Object.fromEntries([...document.querySelectorAll("[data-score-field]")].map(select => [select.dataset.scoreField, select.value]))}));
    await page.select("#fill-pre-assessment-difficulty", "hard");
    const beforeApply = await readPlacement();
    await page.select("#pre-assessment-mcq-framework-select", "mcq");
    await page.click("#apply-mcq-pre-assessment");
    await page.waitForFunction(() => !document.querySelector("#save-pre-assessment").disabled);
    assert.equal(saves.length, 0);
    assert.equal((await readPlacement()).difficultyLevel, "hard");
    assert.ok(Object.values((await readPlacement()).mapping).every(value => value === "first"));
    await page.select(`[data-score-field="${bands[0].field}"]`, "second");
    await page.select("#fill-pre-assessment-difficulty", "easy");
    await page.click("#undo-mcq-pre-assessment");
    assert.deepEqual(await readPlacement(), beforeApply);
    assert.equal(saves.length, 0);
    await page.select("#fill-pre-assessment-difficulty", "medium");
    await page.click("#save-pre-assessment");
    await page.waitForFunction(() => document.getElementById("status-message").textContent.includes("Select a level"));
    assert.equal(saves.length, 0);
    for (let i = 0; i < bands.length; i++) await page.select(`[data-score-field="${bands[i].field}"]`, i === 6 ? "endLevel" : i >= 2 ? "second" : "first");
    await page.click("#save-pre-assessment");
    await page.waitForFunction(() => document.getElementById("status-message").textContent.includes("settings saved"));
    assert.equal(saves[0].input.difficultyLevel, "medium");
    assert.equal(saves[0].input.numberOfQuestions, undefined); assert.equal(saves[0].input.difficultySplit, undefined);
    await page.select("#fill-pre-assessment-difficulty", "hard"); await page.click("#save-pre-assessment");
    await page.waitForFunction(() => !document.getElementById("save-pre-assessment").disabled);
    assert.equal(saves.at(-1).input.difficultyLevel, "hard");
    const savedPlacement = await readPlacement();
    await page.select("#pre-assessment-mcq-framework-select", "mcq");
    await page.click("#apply-mcq-pre-assessment");
    await page.waitForFunction(() => !document.querySelector("#save-pre-assessment").disabled);
    rejectSave = true; await page.click("#save-pre-assessment");
    await page.waitForFunction(() => !document.querySelector("#save-pre-assessment").disabled);
    assert.match(await page.$eval("#status-message", item => item.textContent), /Save unavailable/);
    assert.equal(await page.$eval("#undo-mcq-pre-assessment", item => item.disabled), false);
    rejectSave = false; await page.click("#undo-mcq-pre-assessment");
    assert.deepEqual(await readPlacement(), savedPlacement);
    await page.select("#pre-assessment-mcq-framework-select", "mcq");
    await page.click("#apply-mcq-pre-assessment");
    await page.waitForFunction(() => !document.querySelector("#save-pre-assessment").disabled);
    await page.select(`[data-score-field="${bands[6].field}"]`, "endLevel");
    await page.click("#save-pre-assessment");
    await page.waitForFunction(() => !document.querySelector("#save-pre-assessment").disabled);
    assert.equal(saves.at(-1).input.scoreLevelSplit[bands[6].field], "endLevel");
    assert.equal(saves.at(-1).input.difficultyLevel, "hard");
    assert.equal(saves.at(-1).input.numberOfQuestions, undefined);
    assert.equal(await page.$eval("#undo-mcq-pre-assessment", item => item.disabled), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Mobile form fits viewport");
    await page.select("#framework-select", "mcq");
    await page.waitForFunction(() => document.getElementById("framework-type").value === "normal");
    assert.equal(await page.$eval("#mcq-pre-assessment-count", item => item.hidden), false);
    assert.equal(await page.$eval("#mcq-pre-assessment-adoption", item => item.hidden), true);
    assert.equal(await page.$eval("#fill-pre-assessment-options", item => item.hidden), true);
    await page.click("#save-pre-assessment");
    await page.waitForFunction(() => !document.getElementById("save-pre-assessment").disabled);
    assert.equal(saves.at(-1).input.numberOfQuestions, 10);
    assert.deepEqual(saves.at(-1).input.difficultySplit, {easyPercentage: 40, mediumPercentage: 40, hardPercentage: 20});
    await page.select("#framework-select", "essay");
    await page.waitForFunction(() => document.getElementById("framework-type").value === "essay");
    assert.equal(await page.$eval("#pre-assessment-section", item => item.hidden), true);
    assert.equal(await page.$eval("#mcq-pre-assessment-adoption", item => item.hidden), true);
    assert.equal(await page.$eval("#pre-assessment-section", item => getComputedStyle(item).display), "none");
    assert.deepEqual(errors, []);
    console.log("Passed MCQ pre-assessment adoption/undo, edited mapping save, failed-save recovery, independent difficulty and real framework page: visible pre-assessment section, Medium default, configurable difficulty, seven MCQ-style score mappings, validation and unchanged MCQ/essay controls.");
  } catch (error) {
    console.error({errors, status: await page.$eval("#status-message", item => item.textContent)});
    await page.screenshot({path: "/tmp/rhx-preassessment-framework-failure.png", fullPage: true}); throw error;
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
