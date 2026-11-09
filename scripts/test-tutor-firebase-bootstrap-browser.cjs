const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const fromFunctions = require("node:module").createRequire(path.resolve(__dirname, "../functions/package.json"));
const origin = process.env.SUBJECT_ASSESSMENT_TEST_ORIGIN || "http://127.0.0.1:8769";
assert.match(origin, /^(http:\/\/(127\.0\.0\.1|localhost):\d+|https:\/\/readyherox\.web\.app)$/);
const sdkDirectory = process.env.SUBJECT_ASSESSMENT_TEST_SDK_DIR || "/workspace/.rhx-tools/firebase-compat/12.15.0";
const sdks = new Map(["app", "auth", "firestore", "functions"].map(part => {
  const name = "firebase-" + part + "-compat.js";
  return [name, fs.readFileSync(path.join(sdkDirectory, name), "utf8")];
}));

(async () => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON; delete process.env.FIREBASE_TOKEN; delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const {default: puppeteer} = await import(fromFunctions.resolve("puppeteer"));
  const args = ["--no-sandbox", "--disable-dev-shm-usage"];
  if (origin.startsWith("https:") && process.env.HTTPS_PROXY) {
    const proxy = new URL(process.env.HTTPS_PROXY); assert.equal(proxy.username + proxy.password, "");
    args.push("--proxy-server=" + proxy.protocol + "//" + proxy.host);
  }
  const browser = await puppeteer.launch({executablePath: "/usr/bin/chromium", headless: true, args});
  try {
    const page = await browser.newPage(), errors = [], requests = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = new URL(request.url()), js = body => request.respond({status: 200, contentType: "application/javascript", body});
      if (url.pathname.startsWith("/__/firebase/")) {
        if (url.pathname === "/__/firebase/init.js") return js("");
        const source = sdks.get(url.pathname.split("/").at(-1));
        assert.ok(source, "Unexpected Firebase SDK dependency"); return js(source);
      }
      // Keep the real firebase_ops module and SDK registration. Only auth state,
      // page orchestration and the callable transport response are simulated.
      if (url.pathname.endsWith("/firebase_auth.js")) return js('export const requireCurrentFirebaseAuthUser=()=>({uid:"test-student"});');
      if (url.pathname.endsWith("/question_review.js")) return js(`
        import {getSubjectAssessmentTutorQuestion} from "/features/subject_assessment/subject_assessment_module.js";
        try {
          const question=await getSubjectAssessmentTutorQuestion({assessmentId:"sdk-check",position:1});
          window.__bootstrap={question};
        } catch(error) {window.__bootstrap={error:error.message};}
      `);
      if (url.hostname === "us-central1-readyherox.cloudfunctions.net") {
        assert.equal(url.pathname, "/subjectAssessment");
        const headers = {"access-control-allow-origin": origin, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type"};
        if (request.method() === "OPTIONS") return request.respond({status: 204, headers});
        requests.push(JSON.parse(request.postData()));
        return request.respond({status: 200, contentType: "application/json", headers, body: JSON.stringify({data: {id: "assessment-sdk-check", questionText: "Frozen assessment question"}})});
      }
      if (url.origin !== origin && !url.protocol.startsWith("blob")) return request.abort();
      request.continue();
    });
    await page.goto(origin + "/features/tutor/pages/question_review/question_review.html?assessmentId=sdk-check&position=1&questionId=assessment-sdk-check", {waitUntil: "networkidle0"});
    await page.waitForFunction(() => window.__bootstrap);
    assert.deepEqual(await page.evaluate(() => window.__bootstrap), {question: {id: "assessment-sdk-check", questionText: "Frozen assessment question"}});
    assert.deepEqual(requests, [{data: {action: "tutor", input: {assessmentId: "sdk-check", position: 1}}}]);
    assert.deepEqual(errors, []);
    console.log("PASS: the Tutor HTML registers the real Firebase Functions SDK and its assessment API reaches the callable transport.");
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
