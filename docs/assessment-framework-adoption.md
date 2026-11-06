# Adopting MCQ framework settings

The Assessment Framework admin page offers **Adopt settings from an MCQ framework** for Essay and Fill in the blanks frameworks. Its selector lists saved normal/MCQ frameworks, including legacy frameworks without an explicit type.

**Apply MCQ settings** reads the selected source and copies its end-level name, ordered level names, minimum scores and per-level difficulty into the current form. The target retains its framework name/type and existing essay or passage counts. Added levels default to three required essays/passages; each practice still contains one essay or passage. The Apply control for levels does not copy MCQ question counts or pre-assessment settings; pre-assessment adoption has its own controls below.

This creates an editable copy, with no continuing link to the source. Applying or editing the form does not save anything. Existing target level IDs are retained where possible; source framework records are never modified.

**Undo application** restores the complete level/end-level form state immediately before the last successful Apply, including unsaved edits. Further edits to the adopted fields are also undone. Saving, switching frameworks or starting a new framework clears this editing-session undo. A failed save keeps Undo available. Use **Save Framework** to persist the edited or restored form.

If adoption would remove a level referenced by an existing fill-in-the-blanks placement mapping, Apply explains which configuration must be updated first and leaves the form unchanged. Placement settings are edited through their existing section.

Essay difficulty is now configurable as Easy, Medium or Hard at every level, with Medium retained as the default for new essay levels. Both backend and web framework validation accept these settings. Initial shared essay generation uses the first level's difficulty; subsequent generation uses the student's current topic level. Reusable questions and saved retry drafts must match that difficulty. An already assigned question is retained on replay; its grade is saved normally, while a difficulty mismatch cannot advance the current level. Reaching the end level completes the generation record without assigning another essay.

Existing framework records with Medium difficulty remain valid. No data migration, new collection or external HTTP function is required. The existing essay generation record schema documents all three difficulties and an optional `outcome: "framework-completed"` terminal result. Student progress is not reset.

## Verification

- `node public/features/assessment_framework/application/adopt_mcq_framework.test.mjs`: copied fields, independent edits, retained counts/IDs, placement references, and web/backend difficulty validation.
- `node scripts/test-framework-adoption-browser.cjs`, with `public/` served on port 8769: actual mobile form, Apply/Undo, unsaved drafts, edited values, failed/successful saves, type filtering, source independence and placement mapping guards. APIs are intercepted locally.
- `functions/fill_in_the_blanks_web_emulator.test.js`: actual web framework API saves an adopted Essay and Fill in the blanks framework; backend API reads back the exact copied/edited criteria. Model providers remain mocked.
- Essay generation and assessment regression suites cover all three difficulties, replacing stale retry drafts, matching questions to level difficulty, end-level completion and replay.

Deploy the backend changes before publishing the updated web pages, so new Easy/Hard essay configurations are supported throughout the runtime.

Released to ReadyHeroX on 5 November 2026. All seven affected Node.js functions were verified active, and all changed published pages, modules and styles matched the release source.

## Adopting a pre-assessment mapping

For a saved Fill-in-the-Blanks framework, the **Pre-assessment** section has a separate MCQ source selector, **Apply MCQ pre-assessment**, and **Undo pre-assessment adoption**. Save any level edits first. Sources without a saved MCQ pre-assessment are shown disabled.

Apply reads the current source and copies all seven score-band mappings. References are translated to this framework's saved level IDs using a unique matching level name, then a unique matching sequence number. The end-level reference stays `endLevel`. Missing or ambiguous matches produce an error without changing the form; adopt/save the source's levels first if necessary.

The passage difficulty keeps its current value (Medium when not yet configured). MCQ question counts and difficulty percentages are not copied, because Fill-in-the-Blanks pre-assessment uses one passage. Blanks per passage remain governed by the Question Generator's grade settings.

Mappings remain editable, and applying/undoing writes no data. **Save Pre-assessment** persists them through the existing feature API. Undo restores the values before the last successful application, including blank fields and a manually chosen passage difficulty. A failed save retains Undo; saving, changing levels or switching frameworks clears it. Essay frameworks continue to start at their first level without pre-assessment.

Pure mapping tests cover reference translation and independent edits. The real browser test covers Apply/Undo, edited save, failure recovery and preserving passage difficulty. The Firestore emulator test saves an adopted mapping through the web feature and verifies it through the backend feature. No new collection, backend API or HTTP function is introduced.

The pre-assessment adoption controls were published to ReadyHeroX on 5 November 2026. All four changed production web assets were verified against the release source. The release used the existing backend APIs and schema.
