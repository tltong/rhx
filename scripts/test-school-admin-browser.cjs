// Real browser + frontend API + callable handler + local Firestore. Auth/transport are isolated test doubles.
const assert = require("node:assert/strict"), path = require("node:path");
const fromFunctions = require("node:module").createRequire(path.resolve(__dirname, "../functions/package.json"));
const ORIGIN = process.env.SCHOOL_TEST_ORIGIN || "http://127.0.0.1:8779";
assert.match(ORIGIN, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):\d+$/);
assert.match(process.env.GCLOUD_PROJECT || "", /^demo-/);

(async () => {
  const {getFirestoreDb} = fromFunctions("./utils/firebase/firebase_ops"), db = getFirestoreDb();
  const {createSchoolFeature} = fromFunctions("./features/school/school_module");
  const api = createSchoolFeature({authorize: async () => ({uid: "admin", administrator: true})});
  const handler = fromFunctions("./school_catalog").createSchoolCatalogHandler({apis: api});
  const {schoolSearchPrefixes} = fromFunctions("./features/school/domain/school_search");
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, {method: "DELETE"});
  await db.doc("syllabusScope/Malaysia").set({country: "Malaysia", levels: {primary: {1: true}, secondary: {1: true}}});
  await db.doc("streams/primary").set({name: "Primary stream", country: "Malaysia", level: "primary"});
  await db.doc("streams/secondary").set({name: "Secondary stream", country: "Malaysia", level: "secondary"});
  const {default: puppeteer} = await import(fromFunctions.resolve("puppeteer"));
  const browser = await puppeteer.launch({executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]});
  try {
    const page = await browser.newPage(), errors = [], calls = [];
    let failure = null, failScopes = true;
    await page.setViewport({width: 390, height: 844});
    page.on("pageerror", error => errors.push(error.message));
    await page.exposeFunction("__schoolApi", async (action, input) => {
      calls.push({action, input});
      if (failure === action) {failure = null; throw new Error("Temporary test failure. Reload and try again.");}
      return handler({auth: {uid: "admin"}, data: {action, input}});
    });
    await page.exposeFunction("__schoolScopes", async () => {
      if (failScopes) {failScopes = false; throw new Error("Temporary country load failure.");}
      return (await db.collection("syllabusScope").get()).docs.map(doc => ({id: doc.id, ...doc.data()}));
    });
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = new URL(request.url()), js = body => request.respond({status: 200, contentType: "application/javascript", body});
      if (url.pathname.includes("/__/firebase/") || url.pathname === "/init_fb.js") return js("");
      if (url.pathname.endsWith("/site_admin_page_loader.js")) return js('document.documentElement.hidden=false;import(new URL(document.querySelector("[data-page-module]").dataset.pageModule,location.href).href);');
      if (url.pathname.endsWith("/firebase_ops.js")) return js("export const getFirebaseApp=()=>({functions:()=>({httpsCallable:()=>async({action,input})=>({data:await window.__schoolApi(action,input)})})});");
      if (url.pathname.endsWith("/firebase_auth.js")) return js("export const requireCurrentFirebaseAuthUser=()=>({uid:'admin'});");
      if (url.pathname.endsWith("/syllabusscope_module.js")) return js("export const listSyllabusScopes=()=>window.__schoolScopes();");
      if (url.origin !== ORIGIN) return request.abort();
      return request.continue();
    });
    const wait = text => page.waitForFunction(text => document.querySelector("#status").textContent.includes(text) && !document.querySelector("#reload").disabled, {}, text);
    const idle = () => page.waitForFunction(() => !document.querySelector("#reload").disabled);
    const searchInput = "#school-search input", results = "#school-search [role=option]";
    const searchIdle = () => page.waitForFunction(() => document.querySelector("#school-search [role=listbox]").getAttribute("aria-busy") === "false");
    const query = async text => {
      await page.click(searchInput);
      await page.$eval(searchInput, (element, next) => {element.value = next; element.dispatchEvent(new Event("input", {bubbles: true}));}, text);
      await searchIdle();
    };
    const value = (id, value) => page.$eval("#" + id, (element, value) => {element.value = value; element.dispatchEvent(new Event("input", {bubbles: true}));}, value);
    await page.goto(ORIGIN + "/features/school/pages/admin/school_admin.html", {waitUntil: "networkidle0"});
    await wait("Temporary country load failure");
    assert.equal(await page.$eval(searchInput, node => node.disabled), true);
    await page.click("#reload"); await wait("Directory reloaded");
    await page.select("#country", "Malaysia"); await idle();
    await page.select("#level", "primary"); await idle();
    assert.equal(await page.$eval("#school-stream", select => select.options.length), 2, "Only matching streams are offered");

    await value("state-name", "Selangor"); await page.click("#save-state"); await wait("State saved");
    const state = (await api.listStates({country: "Malaysia"})).items[0];
    await page.select("#locality-state", state.id); await idle();
    await value("locality-name", "Petaling Jaya"); await page.click("#save-locality"); await wait("City/town saved");
    const town = (await api.listLocalities({country: "Malaysia", stateId: state.id})).items[0];
    await page.select("#school-state", state.id); await idle();
    await page.select("#school-locality", town.id);
    await page.select("#school-stream", "primary");
    await value("school-name", "Alpha <img src=x onerror=alert(1)> School");
    failure = "createSchool";
    await page.click("#save-school"); await wait("Temporary test failure");
    assert.equal(await page.$eval("#school-name", element => element.value), "Alpha <img src=x onerror=alert(1)> School", "Failed saves preserve input");
    await page.click("#save-school"); await wait("School saved");
    await searchIdle();
    assert.equal(await page.$("#school-search img"), null, "Names are rendered as text");
    let saved = (await api.listSchools({country: "Malaysia", level: "primary"})).items[0];
    assert.equal(saved.streamId, "primary");
    assert.equal(saved.localityId, town.id);

    // Edit uses the saved ID; failures loading another location cannot overwrite the prior record.
    await page.select("#state-record", "");
    await idle();
    failure = "getState";
    await page.select("#state-record", state.id); await wait("Temporary test failure");
    assert.equal(await page.$eval("#save-state", button => button.disabled), true);
    await page.click("#reload"); await wait("Directory reloaded");
    assert.equal(await page.$eval("#state-name", element => element.value), "Selangor");

    await value("school-name", "My unsaved school name");
    await api.updateSchool({id: saved.id, expectedVersion: saved.version, name: "Changed elsewhere"});
    await page.click("#save-school"); await wait("another session");
    assert.equal(await page.$eval("#school-name", element => element.value), "My unsaved school name");
    await page.click("#reload"); await wait("Directory reloaded");
    assert.equal(await page.$eval("#school-name", element => element.value), "Changed elsewhere");
    await page.select("#school-stream", ""); await page.click("#save-school"); await wait("School saved");
    saved = await api.getSchool(saved.id); assert.equal(saved.streamId, null);
    await page.click("#archive-locality"); await wait("Archive or move active");
    assert.equal((await api.getLocality(town.id)).status, "active");
    await page.click("#archive-school"); await wait("School archived");
    await searchIdle();
    assert.equal((await page.$$(results)).length, 0);
    await page.select("#filter-status", "archived"); await idle(); await searchIdle();
    assert.equal((await page.$$(results)).length, 1);
    assert.match(await page.$eval("#school-search", node => node.textContent), /Archived/);
    await page.click(`[data-item-id="${saved.id}"]`); await wait("School loaded");
    await page.select("#school-status", "active"); await page.click("#save-school"); await wait("School saved");

    const batch = db.batch();
    for (let i = 0; i < 54; i++) {
      const name = `SK Chung School ${String(i).padStart(2, "0")}`;
      batch.set(db.collection("schools").doc(), {
        country: "Malaysia", level: "primary", stateId: state.id, localityId: town.id, name,
        nameNormalized: name.toLowerCase(), searchPrefixes: schoolSearchPrefixes(name), streamId: null, schoolCode: "", status: "active", version: 1,
        createdAt: new Date(), updatedAt: new Date(), createdBy: "admin", updatedBy: "admin",
      });
    }
    await batch.commit();
    const otherState = await api.createState({country: "Malaysia", name: "Johor"});
    const otherTown = await api.createLocality({country: "Malaysia", stateId: otherState.id, name: "Johor Bahru", type: "city"});
    const duplicate = await api.createSchool({country: "Malaysia", level: "primary", stateId: otherState.id, localityId: otherTown.id, name: "SK Chung School 50", streamId: "primary"});
    const archived = await api.createSchool({country: "Malaysia", level: "primary", stateId: state.id, localityId: town.id, name: "SK Chung School 59", status: "archived"});
    await page.click("#reload"); await wait("Directory reloaded");
    await page.select("#filter-status", "active"); await idle(); await searchIdle();
    await page.click("#school-search .searchable-list-clear"); await searchIdle();
    assert.equal((await page.$$(results)).length, 10);
    await page.click("#school-search .searchable-list-more"); await searchIdle();
    assert.equal((await page.$$(results)).length, 20);
    await query("c");
    assert.equal((await page.$$(results)).length, 10);
    assert.ok(calls.some(call => call.action === "listSchools" && call.input.search === "c"));
    await query("chung s");
    assert.equal((await page.$$(results)).length, 10);
    await query("school 5");
    assert.equal((await page.$$(results)).length, 5);
    assert.match(await page.$eval("#school-search", node => node.textContent), /Petaling Jaya · Selangor/);
    assert.match(await page.$eval("#school-search", node => node.textContent), /Johor Bahru · Johor/);
    await page.select("#filter-status", "all"); await idle(); await searchIdle();
    assert.equal((await page.$$(results)).length, 6);
    assert.match(await page.$eval("#school-search", node => node.textContent), /Archived/);
    await page.select("#filter-status", "archived"); await idle(); await searchIdle();
    assert.equal((await page.$$(results)).length, 1);
    assert.equal(await page.$eval(results, node => node.dataset.itemId), archived.id);
    await page.select("#filter-status", "active"); await idle(); await searchIdle();
    await page.select("#filter-state", state.id); await idle(); await searchIdle();
    await page.select("#filter-locality", town.id); await idle(); await searchIdle();
    assert.equal((await page.$$(results)).length, 4);
    assert.ok(calls.some(call => call.action === "listSchools" && call.input.localityId === town.id));
    failure = "listLocalities";
    await page.select("#filter-state", otherState.id); await wait("Temporary test failure"); await searchIdle();
    assert.equal(await page.$eval("#filter-locality", node => node.value), "");
    assert.equal((await page.$$(results)).length, 1);
    assert.equal(await page.$eval(results, node => node.dataset.itemId), duplicate.id, "Failed city loading cannot preserve an old state filter");
    await page.select("#filter-state", ""); await idle(); await searchIdle();
    assert.equal(await page.$eval("#filter-locality", node => node.value), "");
    assert.equal(await page.$eval("#filter-locality", node => node.disabled), true);
    assert.equal((await page.$$(results)).length, 5);
    await page.click(searchInput); await searchIdle();
    await page.$eval("#school-search", node => node.scrollIntoView({block: "center"}));
    await page.screenshot({path: "/tmp/rhx-school-admin-mobile.png", fullPage: true});
    await value("school-name", "Unsaved admin edit");
    await page.click(searchInput); await searchIdle();
    failure = "getSchool";
    await page.click(`[data-item-id="${duplicate.id}"]`); await wait("Temporary test failure");
    assert.equal(await page.$eval("#school-name", node => node.value), "Unsaved admin edit");
    await query("school 5");
    await page.click(`[data-item-id="${duplicate.id}"]`); await wait("School loaded");
    assert.equal(await page.$eval("#school-name", node => node.value), duplicate.name);
    assert.equal((await api.getSchool(duplicate.id)).version, 1, "Selecting a suggestion loads the editor without saving");
    assert.ok(calls.filter(call => call.action === "listSchools").every(call => call.input.limit === 10 && call.input.searchMode === "wordPrefix"));
    assert.ok(calls.some(call => call.action === "listSchools" && call.input.cursor));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Mobile layout does not overflow");
    await page.setViewport({width: 1366, height: 950});
    await query("school 5");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({path: "/tmp/rhx-school-admin-desktop.png", fullPage: true});
    assert.deepEqual(errors, []);
    console.log("PASS: admin shared autocomplete, first-character and multi-word matching, active/archived/all filters, optional locations, continued paging, safe text, explicit saves, failed lookups, stale versions, school/location writes, and mobile/desktop layout.");
  } finally {await browser.close(); await db.terminate();}
})().catch(error => {console.error(error); process.exitCode = 1;});
