import assert from "node:assert/strict";
import test from "node:test";
import {isTransientNewsError, newsFetchErrorMessage} from "./domain/news_transport.js";
test("Firebase transport failures are recoverable without treating validation or access errors as transient", () => {
  for (const code of ["functions/internal", "functions/unavailable", "functions/deadline-exceeded", "aborted", "cancelled"]) assert.equal(isTransientNewsError({code}), true);
  assert.equal(isTransientNewsError(new TypeError("Failed to fetch")), true);
  for (const code of ["functions/unauthenticated", "functions/permission-denied", "functions/invalid-argument", "functions/failed-precondition", "functions/resource-exhausted"]) assert.equal(isTransientNewsError({code}), false);
  assert.equal(isTransientNewsError(new TypeError("Invalid article data")), false);
});
test("bare SDK messages become useful recovery instructions and specific application errors stay visible", () => {
  for (const message of ["internal", "INTERNAL", "unavailable", "deadline-exceeded", "Failed to fetch", ""]) {
    assert.equal(newsFetchErrorMessage({message}), "Could not confirm article preparation. Retry to resume your saved article.");
  }
  assert.equal(newsFetchErrorMessage({message: "Choose a language available in Syllabus Scope."}), "Choose a language available in Syllabus Scope.");
});
