const DIFFICULTIES = Object.freeze([
  Object.freeze({
    key: "easy",
    label: "Easy",
    percentageField: "easyPercentage"
  }),
  Object.freeze({
    key: "medium",
    label: "Medium",
    percentageField: "mediumPercentage"
  }),
  Object.freeze({
    key: "hard",
    label: "Hard",
    percentageField: "hardPercentage"
  })
]);

function requireObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object.`);
  }

  return value;
}

function requirePositiveInteger(value, fieldName) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }

  return number;
}

function requirePercentage(value, fieldName) {
  const percentage = Number(value);

  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new Error(`${fieldName} must be between 0 and 100.`);
  }

  return percentage;
}

function allocateByLargestRemainder(total, weights) {
  const quotas = weights.map((weight) => total * weight / 100);
  const allocations = quotas.map(Math.floor);
  let remaining = total - allocations.reduce(
    (sum, allocation) => sum + allocation,
    0
  );
  const priority = quotas
    .map((quota, index) => ({
      index,
      remainder: quota - allocations[index]
    }))
    .sort((first, second) => (
      second.remainder - first.remainder ||
      first.index - second.index
    ));

  for (const item of priority) {
    if (remaining === 0) {
      break;
    }

    allocations[item.index] += 1;
    remaining -= 1;
  }

  return allocations;
}

function allocateDiagramQuestions(
  difficultyCounts,
  diagramPercentage,
  totalDiagramQuestions
) {
  const quotas = difficultyCounts.map(
    (count) => count * diagramPercentage / 100
  );
  const allocations = quotas.map(Math.floor);
  let remaining = totalDiagramQuestions - allocations.reduce(
    (sum, allocation) => sum + allocation,
    0
  );
  const priority = quotas
    .map((quota, index) => ({
      index,
      remainder: quota - allocations[index]
    }))
    .sort((first, second) => (
      second.remainder - first.remainder ||
      first.index - second.index
    ));

  for (const item of priority) {
    if (remaining === 0) {
      break;
    }

    if (allocations[item.index] >= difficultyCounts[item.index]) {
      continue;
    }

    allocations[item.index] += 1;
    remaining -= 1;
  }

  if (remaining !== 0) {
    throw new Error("Diagram question allocation could not be completed.");
  }

  return allocations;
}

export function allocatePreAssessmentQuestions(input = {}) {
  const source = requireObject(input, "allocation input");
  const numberOfQuestions = requirePositiveInteger(
    source.numberOfQuestions,
    "numberOfQuestions"
  );
  const difficultySplit = requireObject(
    source.difficultySplit,
    "difficultySplit"
  );
  const difficultyPercentages = DIFFICULTIES.map((difficulty) => (
    requirePercentage(
      difficultySplit[difficulty.percentageField],
      `difficultySplit.${difficulty.percentageField}`
    )
  ));
  const difficultyTotal = difficultyPercentages.reduce(
    (sum, percentage) => sum + percentage,
    0
  );

  if (Math.abs(difficultyTotal - 100) > 0.0001) {
    throw new Error("Difficulty percentages must total 100.");
  }

  const diagramPercentage = requirePercentage(
    source.diagramPercentage,
    "diagramPercentage"
  );
  const difficultyCounts = allocateByLargestRemainder(
    numberOfQuestions,
    difficultyPercentages
  );
  const withDiagram = Math.round(
    numberOfQuestions * diagramPercentage / 100
  );
  const diagramCounts = allocateDiagramQuestions(
    difficultyCounts,
    diagramPercentage,
    withDiagram
  );
  const byDifficulty = Object.fromEntries(
    DIFFICULTIES.map((difficulty, index) => {
      const total = difficultyCounts[index];
      const difficultyWithDiagram = diagramCounts[index];

      return [
        difficulty.key,
        Object.freeze({
          difficultyLevel: difficulty.label,
          total,
          withDiagram: difficultyWithDiagram,
          withoutDiagram: total - difficultyWithDiagram
        })
      ];
    })
  );

  return Object.freeze({
    totalQuestions: numberOfQuestions,
    diagramPercentage,
    withDiagram,
    withoutDiagram: numberOfQuestions - withDiagram,
    byDifficulty: Object.freeze(byDifficulty)
  });
}
