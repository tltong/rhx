// Exercise the actual Syllabus admin DOM and rendering; feature API calls stay local.
const assert = require('node:assert/strict'), path = require('node:path');
const fromFunctions = require('node:module').createRequire(path.resolve(__dirname, '../functions/package.json'));
(async () => {
  const {default: puppeteer} = await import(fromFunctions.resolve('puppeteer'));
  const browser = await puppeteer.launch({executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']});
  try {
    const page = await browser.newPage(); await page.setViewport({width: 390, height: 844});
    const errors = [], saves = [];
    page.on('pageerror', error => errors.push(error.message));
    const frameworks = ['normal', 'essay', 'fillInTheBlanks'].map(id => ({id, name: id, frameworkType: id}));
    let syllabus = {id: 'mixed', country: 'Malaysia', level: 'primary', year: 1, subject: 'English', languages: ['English'], active: true,
      assessmentFrameworkId: 'normal', topics: ['normal', 'essay', 'fillInTheBlanks'].map(id => ({id, topicName: id, pausable: true,
        subtopics: {}, assessmentFrameworkIds: {english: id}, preAssessmentPractices: {}}))};
    await page.exposeFunction('__syllabusApi', async (action, changes) => {
      if (action === 'list') return [syllabus];
      if (action === 'get') return syllabus;
      if (action === 'save') {saves.push(changes); syllabus = {...syllabus, ...changes}; return syllabus;}
      throw new Error('Unexpected operation ' + action);
    });
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      const js = body => request.respond({status: 200, contentType: 'application/javascript', body});
      if (url.pathname.includes('/__/firebase/') || url.pathname === '/init_fb.js') return js('');
      if (url.pathname.endsWith('/site_admin_page_loader.js')) return js('document.documentElement.hidden=false; const script=document.querySelector("[data-page-module]"); import(new URL(script.dataset.pageModule, location.href).href);');
      if (url.pathname.endsWith('/syllabus_module.js')) return js(`export const listSyllabuses=()=>window.__syllabusApi('list'); export const getSyllabusById=()=>window.__syllabusApi('get'); export const updateSyllabusRecord=(current,changes)=>window.__syllabusApi('save',changes); export const createSyllabusRecord=changes=>window.__syllabusApi('save',changes); export const deleteSyllabusRecord=()=>{throw Error('Unexpected delete')};`);
      if (url.pathname.endsWith('/assessment_framework_module.js')) return js('export const listAssessmentFrameworks=async()=>'+JSON.stringify(frameworks)+';');
      if (url.pathname.endsWith('/syllabusscope_module.js')) return js('export const listSyllabusScopes=async()=>[{country:"Malaysia",languages:["English"],levels:{primary:{1:true}}}];');
      if (url.origin !== 'http://127.0.0.1:8769') return request.abort();
      return request.continue();
    });
    await page.goto('http://127.0.0.1:8769/features/syllabus/pages/admin/syllabus_admin.html', {waitUntil: 'networkidle0'});
    await page.waitForFunction(() => document.querySelectorAll('select[data-framework-language]').length === 3);
    assert.equal(await page.$('#assessment-framework-select'), null);
    const selections = await page.$$eval('select[data-framework-language]', elements => elements.map(element => ({value: element.value, groups: [...element.querySelectorAll('optgroup')].map(group => group.label)})));
    assert.deepEqual(selections.map(item => item.value), ['normal', 'essay', 'fillInTheBlanks']);
    assert.ok(selections.every(item => item.groups.join('|') === 'Multiple choice|Essay|Fill in the blanks'));
    await page.select('select[data-framework-language]', '');
    await page.click('#save-syllabus');
    await page.waitForFunction(() => /Select a framework/.test(document.querySelector('#status-message').textContent));
    assert.equal(saves.length, 0);
    await page.select('select[data-framework-language]', 'normal');
    await page.click('#save-syllabus');
    await page.waitForFunction(() => document.querySelector('#status-message').textContent === 'Syllabus saved.');
    assert.equal(saves.length, 1); assert.equal(Object.hasOwn(saves[0], 'assessmentFrameworkId'), false);
    assert.deepEqual(saves[0].topics.map(topic => topic.assessmentFrameworkIds), [{english: 'normal'}, {english: 'essay'}, {english: 'fillInTheBlanks'}]);
    assert.deepEqual(errors, []);
    console.log('PASS: Mobile admin shows all three topic formats, rejects missing active assignments, and saves no subject default.');
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
