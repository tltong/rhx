// Real admin UI + real config service/Firestore persistence. Provider and auth transports are isolated doubles.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const fromFunctions = require('node:module').createRequire(path.resolve(__dirname, '../functions/package.json'));
const {Firestore} = fromFunctions('firebase-admin/firestore');
const {createEssayConfigFeature} = require('../functions/features/essay_config/essay_config_module');
const {createEssayConfigHandler} = require('../functions/essay_config');
const {GenerateEssayQuestion} = require('../functions/features/essay_question_generator/application/generate_essay_question');
const {FirestoreEssayQuestionGeneratorRepository} = require('../functions/features/essay_question_generator/infrastructure/firestore_essay_question_generator_repository');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
(async () => {
  const db = new Firestore({projectId: 'demo-rhx-essay-browser'}), root = path.resolve(__dirname, '../public');
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-rhx-essay-browser/databases/(default)/documents`, {method: 'DELETE'});
  const feature = createEssayConfigFeature({getDb: () => db, requireAdministrator: async context => {
    assert.equal(context.auth.uid, 'admin'); return 'admin';
  }}), handler = createEssayConfigHandler({apis: feature});
  const repository = new FirestoreEssayQuestionGeneratorRepository({getFirestoreDb: () => db, readDocument: async (collection, id) => (await db.doc(collection + "/" + id).get()).data() || null});
  repository.getConfig = () => feature.getGeneratorConfiguration();
  let failLoad = true, failSave = true;
  const prompts = [], calls = [];
  const generator = new GenerateEssayQuestion({repository, requireAdministrator: async () => ({uid: 'admin'}),
    generateLlmText: async prompt => {prompts.push(prompt); return {questionText: 'Write a story following the four pictures.', imagePrompt: 'Four scenes of a bird rescue', storyFrames: ['Find a bird', 'Ask for help', 'Care for the bird', 'Release the bird']};},
    createPicture: async input => ({storagePath: `essay-question-images/${input.questionId}.png`, url: 'https://firebasestorage.googleapis.com/v0/b/demo/o/test.png'})});
  const server = http.createServer((request, response) => {
    const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {response.writeHead(404); return response.end();}
    response.setHeader('Content-Type', file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'application/javascript');
    response.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const {default: puppeteer} = await import(fromFunctions.resolve('puppeteer'));
  const browser = await puppeteer.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']});
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', error => {errors.push(error.message); console.error('Browser error:', error.message);});
    await page.exposeFunction('__essayCall', async (action, input) => {
      calls.push({action, input});
      if (action === 'getEssayConfiguration' && failLoad) {failLoad = false; throw new Error('Temporary load failure');}
      if (action === 'saveEssayConfiguration' && failSave) {failSave = false; throw new Error('Temporary save failure');}
      return handler({auth: {uid: 'admin'}, data: {action, input}});
    });
    await page.exposeFunction('__essayGenerate', input => generator.execute(input));
    await page.exposeFunction('__essaySave', input => repository.saveQuestion({...input, seed: input.seedUsed}));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url()), js = body => request.respond({status: 200, contentType: 'application/javascript', body});
      if (url.hostname === 'firebasestorage.googleapis.com') return request.respond({status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4WQAAAAASUVORK5CYII=', 'base64')});
      if (url.origin !== origin) return request.abort();
      if (url.pathname.includes('/__/firebase/') || url.pathname === '/init_fb.js') return js('');
      if (url.pathname.endsWith('/site_admin_page_loader.js')) return js('document.documentElement.hidden=false;import(new URL(document.querySelector("[data-page-module]").dataset.pageModule,location.href));');
      if (url.pathname.endsWith('/utils/firebase/firebase_ops.js')) return js('export const getFirebaseApp=()=>({functions:()=>({httpsCallable:()=>async({action,input})=>({data:await window.__essayCall(action,input)})})});');
      if (url.pathname.endsWith('/utils/firebase/firebase_auth.js')) return js('export const requireCurrentFirebaseAuthUser=()=>({uid:"admin"});');
      if (url.pathname.endsWith('/essay_question_generator_module.js')) return js('export const ESSAY_QUESTION_LEVELS={PRIMARY:"primary",SECONDARY:"secondary"},ESSAY_QUESTION_STANDARDS=[1,2,3,4,5,6],ESSAY_QUESTION_DIFFICULTIES={EASY:"easy",MEDIUM:"medium",HARD:"hard"};export const generateEssayQuestion=input=>window.__essayGenerate(input),saveEssayQuestion=input=>window.__essaySave(input),getEssayQuestionGeneratorConfig=async()=>null,saveEssayQuestionGeneratorConfig=async()=>null,createDefaultConfiguration=()=>({});');
      if (url.pathname.endsWith('/question_seed_generator_module.js')) return js('export const getCombinedQuestionSeed=async()=>"Bird rescue";');
      if (url.pathname.endsWith('/syllabusscope_module.js')) return js('export const listSyllabusScopeLanguages=async()=>["English"];');
      request.continue();
    });
    const status = async text => {try {await page.waitForFunction(text => document.querySelector('#essay-status').textContent.includes(text), {}, text);} catch (error) {console.error('Admin state:', await page.$eval('#essay-status', node => node.textContent), errors, calls.map(call => call.action)); throw error;}};
    const edit = (selector, value) => page.$eval(selector, (field, value) => {
      if (field.type === 'checkbox') field.checked = value; else field.value = value;
      field.dispatchEvent(new Event('input', {bubbles: true}));
    }, value);
    await page.setViewport({width: 1366, height: 950});
    await page.goto(origin + '/features/essay_question_generator/pages/admin/essay_question_generator_admin.html', {waitUntil: 'networkidle0'});
    await status('Temporary load failure'); await page.click('#essay-retry-load'); await status('Settings loaded');
    assert.equal(await page.$eval('#essay-type-catalog', node => node.children.length), 5);
    assert.equal((await db.doc('essayConfig/settings').get()).exists, false, 'Reads do not save defaults');
    assert.equal(await page.$('#essay-primary-grade-3-pictureEnabled'), null, 'No grade-wide picture flag');
    await page.$$eval('.essay-type-card', cards => cards.forEach(card => card.open = true));
    await edit('#essay-type-finishTheStory-primary_3-available', true);
    await edit('#essay-type-finishTheStory-primary_3-picture', true);
    await edit('#essay-type-finishTheStory-primary_5-available', true);
    await edit('#essay-type-finishTheStory-primary_3-instructions', 'A short opening for grade three');
    await edit('#essay-type-fourFrameStory-primary_3-available', true);
    assert.equal(await page.$eval('#essay-type-fourFrameStory-primary_3-picture', field => field.checked && field.disabled), true);
    await page.click('#essay-add-type');
    const customId = await page.$eval('#essay-type-catalog > details:last-child input', node => node.id.replace('essay-type-', '').replace('-name', ''));
    assert.ok(customId.startsWith('type_'));
    await page.$eval('#essay-type-catalog > details:last-child', node => node.open = true);
    await edit(`#essay-type-${customId}-name`, 'Custom <img src=x onerror=alert(1)>');
    await edit(`#essay-type-${customId}-instructions`, 'Write about a memorable event.');
    await edit(`#essay-type-${customId}-secondary_4-available`, true);
    await page.click('#essay-save-config'); await status('Temporary save failure');
    assert.equal(await page.$eval('#essay-type-finishTheStory-primary_3-picture', field => field.checked), true);
    await page.click('#essay-save-config'); await status('Settings saved');
    const config = await feature.loadEssayConfiguration();
    assert.equal(config.essayTypes.length, 6);
    assert.deepEqual(config.gradeSettings.primary[3].essayTypes.find(ref => ref.essayTypeId === 'finishTheStory'), {essayTypeId: 'finishTheStory', pictureEnabled: true});
    assert.equal(config.gradeSettings.primary[5].essayTypes.find(ref => ref.essayTypeId === 'finishTheStory').pictureEnabled, false);
    assert.equal(config.essayTypes.find(type => type.id === 'finishTheStory').gradeInstructions.primary_3, 'A short opening for grade three');
    await page.select('#essay-demo-level', 'primary'); await page.select('#essay-demo-standard', '3');
    await page.select('#essay-demo-type', 'fourFrameStory'); await page.select('#essay-demo-language', 'English'); await page.select('#essay-demo-difficulty', 'easy');
    await edit('#essay-demo-seed', 'Bird rescue'); await page.click('#essay-demo-generate');
    await page.waitForFunction(() => !document.querySelector('#essay-demo-result').hidden);
    assert.ok(prompts[0].includes('fourFrameStory')); assert.ok(prompts[0].includes('exactly 4'));
    await page.click('#essay-demo-save-question');
    await page.waitForFunction(() => document.querySelector('#essay-demo-status').textContent === 'Question saved.');
    const stored = await db.collection('essayQuestionGenerator/primary/standards/3/languages/English/questions').get();
    assert.equal(stored.size, 1); assert.equal(stored.docs[0].data().storyFrames.length, 4);
    await page.select('#essay-demo-standard', '6');
    assert.deepEqual(await page.$$eval('#essay-demo-type option', options => options.slice(1).map(option => option.value)), ['normalEssay']);
    await page.screenshot({path: '/tmp/rhx-essay-admin-desktop.png', fullPage: true});
    await page.setViewport({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile has no horizontal overflow');
    await page.screenshot({path: '/tmp/rhx-essay-admin-mobile.png', fullPage: true});
    assert.deepEqual(errors, []);
    console.log('PASS: real admin/catalog API persistence, load/save retries, dynamic IDs, per-grade photos and instructions, locked required photos, type selection, four-frame generation/save, and desktop/mobile layout.');
  } finally {await browser.close(); await new Promise(resolve => server.close(resolve)); await db.terminate();}
})().catch(error => {console.error(error); process.exitCode = 1;});
