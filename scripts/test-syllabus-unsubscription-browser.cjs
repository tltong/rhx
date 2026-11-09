const assert = require("node:assert/strict"), path = require("node:path");
const fromFunctions = require("node:module").createRequire(path.resolve(__dirname, "../functions/package.json"));
const origin = "http://127.0.0.1:8769";
(async () => {
  const {default: puppeteer} = await import(fromFunctions.resolve("puppeteer"));
  const browser = await puppeteer.launch({executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"]});
  try {
    const page = await browser.newPage(); await page.setViewport({width: 390, height: 844});
    const errors = [], calls = [], writes = [], receipts = new Map();
    const subscriptions = new Map(["english", "math"].map(id => [id, {id, state: "active", language: "English"}]));
    let mode = "held", release;
    const gate = new Promise(resolve => {release = resolve;});
    page.on("pageerror", error => errors.push(error.message));
    await page.exposeFunction("__read", (collection, id) => collection.includes("syllabusSubscriptions") ? subscriptions.get(id) || null : null);
    await page.exposeFunction("__list", collection => collection.includes("syllabusSubscriptions") ? [...subscriptions.values()] : []);
    await page.exposeFunction("__write", (collection, id, data) => {
      writes.push({collection, id, data});
      if (collection.endsWith("/syllabuses")) subscriptions.set(id, {...data, id});
    });
    await page.exposeFunction("__unsubscribe", async input => {
      calls.push(input); assert.equal(input.studentId, "student"); assert.deepEqual(Object.keys(input).sort(), ["requestId", "studentId", "syllabusId"]);
      if (mode === "held") await gate;
      if (!receipts.has(input.requestId)) {receipts.set(input.requestId, input.syllabusId); subscriptions.delete(input.syllabusId);}
      if (mode === "lost") {mode = "completed"; throw new Error("Response lost; retry to resume cleanup.");}
      return {studentId: input.studentId, syllabusId: input.syllabusId, unsubscribed: true, cleanupStatus: mode === "pending" ? "pending" : "completed"};
    });
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = new URL(request.url());
      const js = body => request.respond({status: 200, contentType: "application/javascript", body});
      if (url.pathname.startsWith("/__/firebase/") || url.pathname === "/init_fb.js") return js("");
      if (url.pathname === "/utils/firebase/firebase_ops.js") return js(`
        export const readDocument=(collection,id)=>window.__read(collection,id);
        export const readCollection=collection=>window.__list(collection);
        export const writeDocument=(collection,id,data)=>window.__write(collection,id,data);
        export const deleteDocument=()=>{throw new Error('Direct client delete forbidden');};
        export const getFirebaseApp=()=>({functions:region=>{if(region!=='us-central1')throw new Error('Wrong region');return {httpsCallable:(name,options)=>{
          if(name!=='unsubscribeStudentSyllabus'||options.timeout!==540000)throw new Error('Wrong callable');
          return async input=>({data:await window.__unsubscribe(input)});
        }};}});
      `);
      if (url.pathname === "/utils/firebase/firebase_auth.js") return js("export const requireCurrentFirebaseAuthUser=()=>({uid:'guardian'});");
      if (url.pathname.includes("/guardian/guardian_module.js")) return js("export const getGuardianById=async()=>({id:'guardian'});export const onGuardianAuthStateChanged=callback=>{queueMicrotask(()=>callback({uid:'guardian'}));return()=>{};};");
      if (url.pathname.includes("/guardian_student_link/guardian_student_link_module.js")) return js("export const getGuardianStudentLink=async()=>({state:'active'});export const guardianStudentLinkStates={ACTIVE:'active'};");
      if (url.pathname.includes("/syllabus/syllabus_module.js")) return js("export const getSyllabusById=async id=>({id,subject:id,country:'Malaysia',level:'primary',year:4,languages:['English']});");
      if (url.pathname.includes("/student/student_module.js")) return js("export const getStudentById=async()=>({country:'Malaysia',level:'primary',yearOfRegistration:new Date().getFullYear(),standardAtYearOfRegistration:4});");
      if (url.pathname.includes("/stream_subscription/stream_subscription_module.js")) return js("export const getStudentStreamSubscription=async()=>({streamId:'stream'});");
      if (url.pathname.includes("/stream/stream_module.js")) return js("export const getStreamById=async()=>({country:'Malaysia',level:'primary',getYearAssignment:()=>({syllabuses:[{syllabusId:'english',language:'English'},{syllabusId:'math',language:'English'}]})});");
      if (url.pathname.endsWith("/subscription_plan_module.js")) return js(["createSubscriptionPlan", "deleteSubscriptionPlan", "getSubscriptionPlan", "getSubscriptionPlanCatalog", "listSubscriptionPlans", "setSubscriptionPlanCurrency", "updateSubscriptionPlan"].map(name => `export const ${name}=async()=>null;`).join("\n"));
      if (url.pathname.endsWith("/student_subscription_module.js")) return js(["createStudentSubscription", "getStudentSubscription", "getSubscriptionPayment", "listSubscriptionPayments", "paymentModes", "paymentProviders", "recordSubscriptionPayment", "subscriptionTypes", "updateStudentSubscription"].map(name => `export const ${name}=async()=>null;`).join("\n"));
      if (url.origin !== origin) return request.abort();
      return request.continue();
    });
    const status = text => page.waitForFunction(text => document.querySelector("#subscription-status")?.textContent.includes(text), {}, text);
    const click = (section, id, label) => page.$eval(section, (root, id, label) => {
      const row = [...root.querySelectorAll("article")].find(row => row.querySelector("h3")?.textContent === id);
      const button = [...(row?.querySelectorAll("button") || [])].find(button => button.textContent === label);
      if (!button) throw new Error("Missing " + label + " for " + id); button.click();
    }, id, label);
    const current = "#subscribed-syllabuses", available = "#available-syllabuses";
    await page.goto(origin + "/features/syllabus_subscription/pages/manage_student/manage_student_subscriptions.html?studentId=student", {waitUntil: "networkidle0"});
    await status("2 subscribed");
    await click(current, "english", "Deactivate"); await status("deactivated");
    assert.equal(subscriptions.get("english").state, "inactive"); assert.equal(calls.length, 0);
    await click(current, "english", "Activate"); await status("activated");
    await click(current, "english", "Unsubscribe");
    await page.waitForFunction(() => document.querySelector("#subscription-status").textContent.includes("Unsubscribing"));
    assert.equal(await page.$$eval(".syllabus-row button", buttons => buttons.every(button => button.disabled)), true);
    await click(current, "english", "Unsubscribe");
    release(); await status("Subject assessment history removed.");
    assert.equal(calls.length, 1); assert.equal(await page.$eval("#subscribed-count", element => element.textContent), "1");
    mode = "lost"; await click(current, "math", "Unsubscribe"); await status("Response lost");
    await click(current, "math", "Unsubscribe"); await status("Subject assessment history removed.");
    assert.equal(calls.length, 3); assert.equal(calls[1].requestId, calls[2].requestId, "Lost-response retries reuse the durable request ID");
    await click(available, "math", "Subscribe"); await status("subscribed.");
    mode = "pending"; await click(current, "math", "Unsubscribe"); await status("cleanup is still running");
    assert.notEqual(calls[3].requestId, calls[2].requestId, "A new subscription receives a fresh unsubscribe request");
    assert.equal(await page.$eval("#subscribed-count", element => element.textContent), "0");
    assert.equal(writes.some(write => !write.collection.includes("syllabusSubscriptions")), false);
    assert.deepEqual(errors, []);
    console.log("Student Syllabus Subscriptions browser checks passed: backend callable, deactivation, duplicate clicks, lost-response retry and pending cleanup.");
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
