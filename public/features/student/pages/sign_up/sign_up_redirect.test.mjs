import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const signUpSource = fs.readFileSync(
  new URL("./sign_up.js", import.meta.url),
  "utf8"
);

test("successful student signup redirects to the student landing page", () => {
  assert.match(
    signUpSource,
    /const STUDENT_LANDING_URL\s*=\s*\n\s*"\/features\/student\/pages\/landing\/landing\.html";/
  );

  const streamSubscriptionIndex = signUpSource.indexOf(
    "await subscribeStudentToStreamSyllabuses"
  );
  const redirectIndex = signUpSource.indexOf(
    "window.location.replace(STUDENT_LANDING_URL)"
  );

  assert.ok(streamSubscriptionIndex >= 0);
  assert.ok(redirectIndex > streamSubscriptionIndex);
});
