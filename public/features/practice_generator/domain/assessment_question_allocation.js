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

export function allocateAssessmentQuestions({
  numberOfQuestions,
  diagramPercentage
} = {}) {
  const totalQuestions = requirePositiveInteger(
    numberOfQuestions,
    "numberOfQuestions"
  );
  const normalizedDiagramPercentage = requirePercentage(
    diagramPercentage,
    "diagramPercentage"
  );
  const withDiagram = Math.round(
    totalQuestions * normalizedDiagramPercentage / 100
  );

  return Object.freeze({
    totalQuestions,
    diagramPercentage: normalizedDiagramPercentage,
    withDiagram,
    withoutDiagram: totalQuestions - withDiagram
  });
}
