import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const signUpSource = fs.readFileSync(
  new URL("./sign_up.js", import.meta.url),
  "utf8"
);

test("student sign-up creates a trial subscription using the exposed enum", () => {
  assert.match(
    signUpSource,
    /createStudentSubscription\(\{[\s\S]*studentId:\s*authUser\.uid,[\s\S]*subscriptionType:\s*subscriptionTypes\.TRIAL[\s\S]*\}\)/
  );
  assert.doesNotMatch(
    signUpSource,
    /createStudentSubscription\(\{[\s\S]*activeUntil:/
  );
});
