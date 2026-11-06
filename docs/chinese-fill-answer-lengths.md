# Chinese fill-in-the-blanks answer lengths

Chinese blanks show a character count: `学校` requires 2 characters, `图书馆` requires 3, and `𠮷野家` requires 3. Unicode letters and numbers count individually after NFKC normalization; spaces, punctuation and symbols do not count. Latin letters and digits in a Chinese answer count individually too. Chinese labels such as Chinese, Mandarin, 中文, 华文, and zh language tags use this rule. English, Malay and Tamil retain whitespace-separated word counting.

Generation computes the count from the model answer instead of trusting the LLM's number. Chinese generation requests `requiredCharacterCount` and permits 1–30 countable characters per new model answer. A Chinese question stores this additive, public metadata field in its existing `questionItems/{questionId}` document. The existing `requiredWordCount` field is retained for compatibility. No collection or external HTTP function is added.

Admin previews, reusable-question previews and student answer fields show character units. Client and server validation use the same count. Chinese static matching ignores inter-character spaces; alternative marking receives a character requirement instead of a word requirement. Model answers remain protected in `private/answerKey`.

Backend reads can derive missing legacy counts from the protected model answer without writing or exposing that answer. Admin draft reads/saves normalize the metadata too. Public student reads never fetch private model answers; a legacy public question with no character metadata displays an unavailable-count message instead of an incorrect `1 character` hint. Apply the metadata migration before publishing the updated student pages.

## Release preparation

```sh
bash scripts/migrate-chinese-fill-counts.sh          # Read-only audit
bash scripts/migrate-chinese-fill-counts.sh --apply  # Add corrected public character metadata
```

The migration uses the existing passage index and protected answer keys. It updates only `requiredCharacterCount` on Chinese question metadata, with update-time preconditions on the question, passage, index and answer key. Missing/inconsistent records block application. Rerunning is safe. Reports contain counts and IDs, never model answers. Legacy long answers retain their full character count. Passages, images, model answers, assignments, results, grades and rewards are not rewritten.

The ReadyHeroX deployment audits on 5 November 2026 found no saved Chinese passages requiring migration; no metadata updates were needed.

Released to ReadyHeroX on 5 November 2026. All eight affected Node.js functions were verified active and all 17 changed published web assets matched the release source. The metadata migration check completed without conflicts. Existing completed grades are retained.

## Verification

- `functions/fill_in_the_blanks_chinese.test.js`: backend/web parity, Chinese language labels, supplementary characters, mixed digits/letters, generation, validation, private/public metadata, static and alternative marking, and language-specific prompts.
- `scripts/migrate-chinese-fill-counts.test.cjs`: read-only planning, conditional writes, privacy, long legacy answers, conflicts, concurrency and idempotency.
- `scripts/test-fill-in-the-blanks-browser.cjs`: actual mobile preview/session pages, Chinese count hints and validation alongside English word validation.
- `functions/fill_in_the_blanks_web_emulator.test.js`: actual web generation/storage/submission, backend grading, private-answer isolation, a legacy metadata migration and preserved completed grades.
