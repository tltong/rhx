import assert from "node:assert/strict";
import test from "node:test";

import {
  WatchPracticeCompletionProcessing
} from "./watch_practice_completion_processing.js";

test("watch use case returns the repository unsubscribe function", () => {
  const calls = [];
  const unsubscribe = () => {};
  const useCase = new WatchPracticeCompletionProcessing({
    processingRepository: {
      watch(input) {
        calls.push(input);
        return unsubscribe;
      }
    }
  });
  const onChange = () => {};
  const onError = () => {};
  const result = useCase.execute({
    studentId: "student-1",
    practiceId: "practice-1",
    onChange,
    onError
  });

  assert.equal(result, unsubscribe);
  assert.deepEqual(calls, [{
    studentId: "student-1",
    practiceId: "practice-1",
    onChange,
    onError
  }]);
});
