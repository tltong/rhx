// Copy the requested MCQ settings into an independent, editable draft.
// Keep target level IDs/counts where possible so existing references remain valid.
export function adoptMcqFramework(source, target) {
  if (!source || (source.frameworkType || "normal") !== "normal") throw new Error("Select a normal (MCQ) assessment framework.");
  if (!["essay", "fillInTheBlanks"].includes(target?.frameworkType)) throw new Error("MCQ settings can be applied only to essay or fill-in-the-blanks frameworks.");
  if (!source.endLevelName?.trim() || !source.levels?.length) throw new Error("The selected MCQ framework must have an end level and at least one level.");
  const current = target.levels || [], used = new Set();
  const levels = [...source.levels].sort((a, b) => a.sequenceOrder - b.sequenceOrder).map((level, index) => {
    const difficulty = String(level.criteria?.difficultyLevel).toLowerCase();
    const minimumScore = Number(level.criteria?.minimumScore);
    if (!level.levelName?.trim() || !["easy", "medium", "hard"].includes(difficulty) || !Number.isFinite(minimumScore) || minimumScore < 0 || minimumScore > 100) throw new Error("Each MCQ level must have a name, minimum score from 0 to 100, and Easy, Medium or Hard difficulty.");
    const existing = current.find(item => !used.has(item) && item.id && item.id === level.id)
      || current.find(item => !used.has(item) && item.levelName?.trim().toLowerCase() === level.levelName.trim().toLowerCase())
      || (!used.has(current[index]) ? current[index] : null)
      || current.find(item => !used.has(item));
    if (existing) used.add(existing);
    return {id: existing?.id || null, levelName: level.levelName, sequenceOrder: index + 1,
      criteria: {requiredPracticeCount: existing?.criteria?.requiredPracticeCount ?? 3, minimumScore,
        questionsPerPractice: 1, difficultyLevel: difficulty[0].toUpperCase() + difficulty.slice(1)}};
  });
  const remainingIds = new Set(["endLevel", ...levels.map(level => level.id).filter(Boolean)]);
  if (target.preAssessment && Object.values(target.preAssessment.scoreLevelSplit || {}).some(id => !remainingIds.has(id))) throw new Error("This MCQ framework removes a level used by your pre-assessment mapping. Update that mapping before applying these settings.");
  return {endLevelName: source.endLevelName, levels};
}

// MCQ placement rules can be reused for a one-passage fill assessment.
// The target keeps its single difficulty; MCQ's count/split do not apply.
export function adoptMcqPreAssessment(source, target, scoreBands) {
  if (!source || (source.frameworkType || "normal") !== "normal") throw new Error("Select a normal (MCQ) assessment framework.");
  if (target?.frameworkType !== "fillInTheBlanks") throw new Error("Pre-assessment adoption requires a fill-in-the-blanks framework.");
  if (!source.preAssessment?.scoreLevelSplit) throw new Error("The selected MCQ framework has no saved pre-assessment mapping.");
  if (!Array.isArray(scoreBands) || !scoreBands.length) throw new Error("Pre-assessment score bands are required.");
  if (!target.levels?.length || target.levels.some(level => !level.id)) throw new Error("Save the target framework levels before adopting a pre-assessment mapping.");
  const difficultyLevel = String(target.preAssessment?.difficultyLevel ?? "medium").toLowerCase();
  if (!["easy", "medium", "hard"].includes(difficultyLevel)) throw new Error("Choose Easy, Medium or Hard passage difficulty.");
  const scoreLevelSplit = {};
  for (const {field} of scoreBands) {
    const sourceId = source.preAssessment.scoreLevelSplit[field];
    if (sourceId === "endLevel") {scoreLevelSplit[field] = "endLevel"; continue;}
    const sourceLevels = (source.levels || []).filter(level => level.id === sourceId);
    if (sourceLevels.length !== 1) throw new Error("The MCQ pre-assessment mapping references a missing or ambiguous level for " + field + ".");
    const sourceLevel = sourceLevels[0];
    const nameMatches = target.levels.filter(level => String(level.levelName).trim().toLowerCase() === String(sourceLevel.levelName).trim().toLowerCase());
    const sequenceMatches = target.levels.filter(level => level.sequenceOrder === sourceLevel.sequenceOrder);
    const matched = nameMatches.length === 1 ? nameMatches[0] : sequenceMatches.length === 1 ? sequenceMatches[0] : null;
    if (!matched) throw new Error("No matching target level for " + sourceLevel.levelName + ". Adopt and save the MCQ levels first, or select a framework with matching levels.");
    scoreLevelSplit[field] = matched.id;
  }
  return {difficultyLevel, scoreLevelSplit};
}
