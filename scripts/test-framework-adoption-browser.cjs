// Actual mobile admin form. All API mutations are intercepted locally.
const assert = require('node:assert/strict'), path = require('node:path');
const fromFunctions = require('node:module').createRequire(path.resolve(__dirname, '../functions/package.json'));
(async () => {
  const {default: puppeteer} = await import(fromFunctions.resolve('puppeteer'));
  const browser = await puppeteer.launch({executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']});
  try {
    const page = await browser.newPage(); await page.setViewport({width: 390, height: 844});
    const errors = [], writes = []; let failSave = false, failRead = false;
    page.on('pageerror', error => errors.push(error.message));
    const level = (id, name, order, count, minimumScore, difficultyLevel, questionsPerPractice = 1) => ({id, levelName: name, sequenceOrder: order,
      criteria: {requiredPracticeCount: count, minimumScore, difficultyLevel, questionsPerPractice}});
    const bands = require('../functions/schema/assessment_framework_schema').assessmentFrameworkPreAssessmentScoreBands;
    const frameworks = [
      {id: 'mcq', name: 'Normal source', endLevelName: 'Fluent', levels: [level('b', 'Developing', 2, 20, 85, 'Hard', 15), level('a', 'Starting', 1, 10, 65, 'Easy', 12)], preAssessment: null},
      {id: 'short', name: 'Short MCQ source', frameworkType: 'normal', endLevelName: 'Ready', levels: [level('single', 'Only', 1, 3, 70, 'Medium')], preAssessment: null},
      {id: 'essay', name: 'Essay target', frameworkType: 'essay', endLevelName: 'Essay ready', levels: [level('essay-first', 'First essay', 1, 4, 71, 'Medium'), level('essay-second', 'Second essay', 2, 5, 80, 'Medium')], preAssessment: null},
      {id: 'fill', name: 'Fill target', frameworkType: 'fillInTheBlanks', endLevelName: 'Fill ready', levels: [level('fill-first', 'First passage', 1, 2, 70, 'Easy'), level('fill-second', 'Second passage', 2, 3, 80, 'Hard')],
        preAssessment: {difficultyLevel: 'medium', scoreLevelSplit: Object.fromEntries(bands.map(({field}, i) => [field, i > 2 ? 'fill-second' : 'fill-first']))}},
    ];
    const originalSource = structuredClone(frameworks[0]);
    await page.exposeFunction('__adoptionApi', async (action, id, input) => {
      if (action === 'list') return frameworks;
      if (action === 'get') {if (failRead) throw new Error('Source unavailable'); return frameworks.find(f => f.id === id);}
      if (action === 'update') {
        if (failSave) throw new Error('Save unavailable');
        writes.push({id, input}); const target = frameworks.find(f => f.id === id); Object.assign(target, input); return target;
      }
      throw new Error('Unexpected API operation ' + action);
    });
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      const js = body => request.respond({status: 200, contentType: 'application/javascript', body});
      if (url.pathname.includes('/__/firebase/') || url.pathname === '/init_fb.js') return js('');
      if (url.pathname.endsWith('/site_admin_page_loader.js')) return js('document.documentElement.hidden=false; const script=document.querySelector("[data-page-module]"); import(new URL(script.dataset.pageModule, location.href));');
      if (url.pathname.endsWith('/assessment_framework_module.js')) return js(`
        export const ASSESSMENT_FRAMEWORK_END_LEVEL_ID='endLevel';
        export const assessmentFrameworkPreAssessmentDifficultyLevels=['easy','medium','hard'];
        export const assessmentFrameworkPreAssessmentScoreBands=${JSON.stringify(bands)};
        export const listAssessmentFrameworks=()=>window.__adoptionApi('list');
        export const getAssessmentFrameworkById=id=>window.__adoptionApi('get',id);
        export const updateAssessmentFrameworkRecord=(target,input)=>window.__adoptionApi('update',target.id,input);
        export const createAssessmentFrameworkRecord=()=>{throw Error('Unexpected create')};
        export const saveAssessmentFrameworkPreAssessment=()=>{throw Error('Unexpected preassessment save')};
        export const deleteAssessmentFrameworkRecord=()=>{throw Error('Unexpected delete')};`);
      if (url.origin !== 'http://127.0.0.1:8769') return request.abort();
      return request.continue();
    });
    const waitReady = () => page.waitForFunction(() => !document.querySelector('#save-framework').disabled);
    const choose = async id => {await page.select('#framework-select', id); await page.waitForFunction(value => document.querySelector('#framework-select').value === value && !document.querySelector('#save-framework').disabled, {}, id);};
    const edit = (selector, value) => page.$eval(selector, (input, next) => {input.value = next; input.dispatchEvent(new Event('input', {bubbles:true}));}, value);
    const read = () => page.evaluate(() => ({end: document.querySelector('#framework-end-level-name').value, levels: [...document.querySelectorAll('.level-row')].map(row => ({id:row.dataset.levelId,
      name:row.querySelector('[data-field="levelName"]').value, count:row.querySelector('[data-field="requiredPracticeCount"]').value,
      score:row.querySelector('[data-field="minimumScore"]').value, difficulty:row.querySelector('[data-field="difficultyLevel"]').value}))}));
    const apply = async source => {await page.select('#mcq-framework-select', source); await page.click('#apply-mcq-framework'); await waitReady();};
    await page.goto('http://127.0.0.1:8769/features/assessment_framework/pages/admin/assessment_framework_admin.html', {waitUntil:'networkidle0'});
    await waitReady(); assert.equal(await page.$eval('#mcq-adoption-section', e=>e.hidden), true);
    await choose('essay');
    assert.equal(await page.$eval('#mcq-adoption-section', e=>e.hidden), false);
    assert.deepEqual(await page.$$eval('#mcq-framework-select option', items=>items.map(item=>item.value)), ['', 'mcq', 'short']);
    await edit('#framework-end-level-name','My unsaved end'); await edit('[data-field="minimumScore"]','74');
    const before = await read();
    await apply('mcq');
    const adopted = await read();
    assert.equal(adopted.end,'Fluent');
    assert.deepEqual(adopted.levels.map(l=>[l.id,l.name,l.count,l.score,l.difficulty]), [['essay-first','Starting','4','65','Easy'],['essay-second','Developing','5','85','Hard']]);
    assert.equal(await page.$eval('[data-field="difficultyLevel"]',e=>e.disabled), false);
    assert.equal(await page.$eval('[data-field="questionsPerPractice"]',e=>e.disabled), true);
    await edit('[data-field="minimumScore"]','88'); await page.select('[data-field="difficultyLevel"]','Hard');
    assert.equal(writes.length,0); await page.click('#undo-mcq-framework'); assert.deepEqual(await read(),before); assert.equal(writes.length,0);
    await apply('mcq'); failSave=true; await page.click('#save-framework'); await waitReady();
    assert.match(await page.$eval('#status-message',e=>e.textContent),/Save unavailable/);
    assert.equal(await page.$eval('#undo-mcq-framework',e=>e.disabled),false);
    await page.click('#undo-mcq-framework'); assert.deepEqual(await read(),before); failSave=false;
    await apply('mcq'); await edit('[data-field="minimumScore"]','88'); await page.select('[data-field="difficultyLevel"]','Medium');
    await page.click('#save-framework'); await waitReady();
    assert.equal(writes.length,1); assert.equal(writes[0].id,'essay'); assert.equal(writes[0].input.name,'Essay target');
    assert.equal(writes[0].input.levels[0].criteria.minimumScore,88); assert.equal(writes[0].input.levels[0].criteria.difficultyLevel,'Medium');
    assert.equal(writes[0].input.levels[0].criteria.questionsPerPractice,1);
    assert.equal(await page.$eval('#undo-mcq-framework',e=>e.disabled),true); assert.deepEqual(frameworks[0],originalSource);
    await apply('mcq'); await choose('fill'); assert.equal(await page.$eval('#undo-mcq-framework',e=>e.disabled),true);
    const fillBefore=await read(); await apply('mcq'); assert.equal((await read()).levels[0].id,'fill-first');
    assert.equal(await page.$eval('#save-pre-assessment',e=>e.disabled),true);
    await page.click('#undo-mcq-framework'); assert.deepEqual(await read(),fillBefore);
    assert.equal(await page.$eval('#save-pre-assessment',e=>e.disabled),false);
    await apply('short'); assert.match(await page.$eval('#status-message',e=>e.textContent),/pre-assessment mapping/); assert.deepEqual(await read(),fillBefore);
    failRead=true; await apply('mcq'); assert.match(await page.$eval('#status-message',e=>e.textContent),/Source unavailable/); assert.deepEqual(await read(),fillBefore); failRead=false;
    await edit('#new-framework-name','New essay'); await page.click('#use-new-framework'); await page.select('#framework-type','essay');
    const newBefore=await read(); await apply('mcq'); assert.equal((await read()).levels[0].count,'3'); await page.click('#undo-mcq-framework'); assert.deepEqual(await read(),newBefore);
    assert.deepEqual(errors,[]); assert.equal(writes.length,1);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Mobile page must fit viewport');
    console.log('PASS: Apply/Undo, unsaved edits, all copied fields, editable essay difficulty, counts/IDs preserved, Save/failure handling, source filtering, source independence, preassessment references and new drafts.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
