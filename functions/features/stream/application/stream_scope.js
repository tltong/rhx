function normalizeText(value) {
  return String(value ?? "").trim();
}

function comparisonKey(value) {
  return normalizeText(value).normalize("NFKC").toLowerCase();
}

function requireScope(scope, country) {
  if (!scope) {
    throw new Error(`No syllabus scope exists for ${normalizeText(country)}.`);
  }

  return scope;
}

function listAvailableLevels(scope) {
  const levels = scope?.levels && typeof scope.levels === "object"
    ? scope.levels
    : {};

  return Object.entries(levels)
    .filter(([, years]) => years && Object.values(years).some(Boolean))
    .map(([level]) => level)
    .sort((first, second) => first.localeCompare(second));
}

function listAvailableYears(scope, level) {
  const selectedLevel = comparisonKey(level);
  const levels = listAvailableLevels(scope);

  if (!levels.some((item) => comparisonKey(item) === selectedLevel)) {
    throw new Error("The selected level is not available for this country.");
  }

  const levelKey = levels.find(
    (item) => comparisonKey(item) === selectedLevel,
  );

  return Object.entries(scope.levels[levelKey] || {})
    .filter(([, enabled]) => enabled === true)
    .map(([year]) => Number(year))
    .filter((year) => Number.isInteger(year) && year > 0)
    .sort((first, second) => first - second);
}

function requireAvailableLevel(scope, level) {
  const selectedLevel = comparisonKey(level);
  const matchedLevel = listAvailableLevels(scope).find(
    (item) => comparisonKey(item) === selectedLevel,
  );

  if (!matchedLevel) {
    throw new Error("The selected level is not available for this country.");
  }

  return matchedLevel;
}

function requireAvailableYear(scope, level, year) {
  const selectedYear = Number(year);

  if (!Number.isInteger(selectedYear) || selectedYear < 1) {
    throw new Error("year must be a positive integer.");
  }

  if (!listAvailableYears(scope, level).includes(selectedYear)) {
    throw new Error("The selected year is not available for this scope.");
  }

  return selectedYear;
}

function syllabusMatchesScope(syllabus, {country, level, year}) {
  return syllabus
    && comparisonKey(syllabus.country) === comparisonKey(country)
    && comparisonKey(syllabus.level) === comparisonKey(level)
    && (year === undefined || Number(syllabus.year) === Number(year));
}

module.exports = {
  requireScope,
  listAvailableLevels,
  listAvailableYears,
  requireAvailableLevel,
  requireAvailableYear,
  syllabusMatchesScope,
};
