import assert from "node:assert/strict";
import {afterEach, test} from "node:test";
import {getConfiguredFirebaseApp, getFirebaseConfig} from "./firebase_config.js";
import {getHttpFunctionUrl} from "../../utils/firebase/function_url.js";
import {getDeepseekFunctionUrl} from "../../utils/llm/deepseek_util.js";

const originalFirebase = globalThis.firebase;
afterEach(() => {
  if (originalFirebase === undefined) delete globalThis.firebase;
  else globalThis.firebase = originalFirebase;
});

test("Firestore and direct function URLs use the Hosting-initialized default app", async () => {
  for (const projectId of ["readyherox", "hosting-config-test"]) {
    const options = {projectId, apiKey: "hosting-supplied-key", authDomain: `${projectId}.firebaseapp.com`};
    const db = {projectId};
    const app = {options, firestore: () => db};
    globalThis.firebase = {
      app: () => app,
      initializeApp: () => assert.fail("The web layer must reuse Hosting's initialized app"),
      firestore: () => db,
    };
    const {initFirebase, getFirestoreDb} = await import(`../../utils/firebase/firebase_ops.js?config-test=${projectId}`);
    assert.equal(getConfiguredFirebaseApp(), app);
    assert.equal(getFirebaseConfig(), options);
    assert.equal(initFirebase().app, app);
    assert.equal(getFirestoreDb(), db);
    assert.equal(getHttpFunctionUrl("generateLlmImage"), `https://us-central1-${projectId}.cloudfunctions.net/generateLlmImage`);
    assert.equal(getDeepseekFunctionUrl({useDirectFunction: true}), `https://us-central1-${projectId}.cloudfunctions.net/generateDeepseekText`);
  }
});

test("a missing default app fails without initializing an app or selecting production", async () => {
  const missingApp = new Error("No Firebase App '[DEFAULT]' has been created");
  globalThis.firebase = {
    // A named secondary app does not replace Hosting's default app.
    apps: [{name: "secondary"}],
    app: () => {throw missingApp;},
    initializeApp: () => assert.fail("Missing Hosting configuration must not initialize a fallback"),
    firestore: () => assert.fail("Firestore must not be accessed before configuration"),
  };
  const {getFirestoreDb} = await import("../../utils/firebase/firebase_ops.js?missing-config-test");
  for (const operation of [getFirebaseConfig, getFirestoreDb, () => getHttpFunctionUrl("generateLlmImage"),
    () => getDeepseekFunctionUrl({useDirectFunction: true})]) {
    assert.throws(operation, error => {
      assert.match(error.message, /Firebase configuration is unavailable.*\/__\/firebase\/init\.js/);
      assert.equal(error.cause, missingApp);
      return true;
    });
  }
});

test("configuration is resolved lazily and rejects missing project settings", () => {
  delete globalThis.firebase;
  assert.throws(getFirebaseConfig, /Firebase configuration is unavailable/);
  for (const options of [undefined, {}, {projectId: ""}, {projectId: " "}]) {
    globalThis.firebase = {app: () => ({options})};
    assert.throws(getFirebaseConfig, /Firebase configuration is unavailable/);
  }
  globalThis.firebase = {app: () => ({options: {projectId: "configured-later"}})};
  assert.equal(getFirebaseConfig().projectId, "configured-later");
});

test("explicit emulator project settings work without Hosting initialization", () => {
  delete globalThis.firebase;
  assert.equal(getHttpFunctionUrl("generateLlmImage", {projectId: "demo-local", hostname: "localhost"}),
    "http://localhost:5001/demo-local/us-central1/generateLlmImage");
  assert.equal(getDeepseekFunctionUrl({projectId: "demo-local", hostname: "localhost"}),
    "http://localhost:5001/demo-local/us-central1/generateDeepseekText");
});
