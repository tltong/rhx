import assert from "node:assert/strict";
import {test} from "node:test";
import {createRequire} from "node:module";
import * as web from "./domain/essay_word_count.js";
const require = createRequire(import.meta.url);
const backend = require("../../../functions/features/essay_practice_session/domain/essay_word_count");
for (const [layer, policy] of [["backend", backend], ["web", web]]) {
  test(layer + ": counts words across whitespace and paragraphs without counting punctuation", () => {
    assert.deepEqual(policy.getEssayWordCount("  One\n\ntwo\tthree. ... !!!  ", 3), {wordCount: 3, minWords: 3, meetsMinimum: true});
    assert.equal(policy.getEssayWordCount("... !!! --", 1).meetsMinimum, false);
    assert.equal(policy.getEssayWordCount("I don't give up.", 4).wordCount, 4);
    assert.equal(policy.getEssayWordCount(" \n\t", null).meetsMinimum, false);
  });
  test(layer + ": counts words in languages without spaces", () => {
    const count = policy.getEssayWordCount("\u4eca\u5929\u5929\u6c14\u5f88\u597d\u3002", 3);
    assert.deepEqual(count, {wordCount: 3, minWords: 3, meetsMinimum: true});
  });
  test(layer + ": checks the exact minimum and permits no configured minimum", () => {
    assert.equal(policy.getEssayWordCount("One two", 3).meetsMinimum, false);
    assert.equal(policy.getEssayWordCount("One two three", 3).meetsMinimum, true);
    assert.equal(policy.getEssayWordCount("One two three four", 3).meetsMinimum, true);
    assert.equal(policy.getEssayWordCount("One").meetsMinimum, true);
    assert.throws(() => policy.requireEssayMinimumWordCount("Too short", 3), /at least 3 words/);
  });
}
