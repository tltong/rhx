import assert from "node:assert/strict";
import test from "node:test";

import {
  completionProcessingStages,
  completionProcessingStatuses,
  watchPracticeCompletionProcessing
} from "./student_practice_module.js";

test("Student Practice exposes completion processing monitoring", () => {
  assert.equal(typeof watchPracticeCompletionProcessing, "function");
  assert.equal(completionProcessingStatuses.COMPLETED, "completed");
  assert.equal(completionProcessingStages.GENERATING, "generating");
});
