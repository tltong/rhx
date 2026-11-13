import {generatorConfiguration, fail} from "./essay_config.js?v=20261112-essay-variation-v1";
function eligibleEssayTypeIds(configuration, criteria) {
  const config = generatorConfiguration(configuration);
  const refs = config.gradeSettings[criteria.level]?.[criteria.standard]?.essayTypes ?? [];
  if (!refs.length) throw fail("No essay types are available for this grade.", "failed-precondition");
  return refs.map(ref => ref.essayTypeId);
}
function chooseEssayType(eligible, used, random = Math.random, preferred) {
  const seen = new Set(used), unused = eligible.filter(id => !seen.has(id));
  const choices = unused.length ? unused : eligible;
  if (!choices.length) throw fail("No essay types are available for this grade.", "failed-precondition");
  if (preferred && choices.includes(preferred)) return preferred;
  if (choices.length === 1) return choices[0];
  const draw = random();
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw fail("Invalid random essay type selection.");
  return choices[Math.floor(draw * choices.length)];
}
function typeSelectionAllowed(eligible, used, selected) {
  const seen = new Set(used), unused = eligible.filter(id => !seen.has(id));
  return (unused.length ? unused : eligible).includes(selected);
}
function normalizedTheme(value) {
  if (typeof value !== "string" || !value.trim()) throw fail("An essay theme is required.");
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}
export {eligibleEssayTypeIds, chooseEssayType, typeSelectionAllowed, normalizedTheme};
