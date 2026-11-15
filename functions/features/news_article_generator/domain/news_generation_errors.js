const safeIdentifier = value => typeof value === "string" && /^[a-zA-Z0-9_.-]{1,100}$/.test(value) ? value : null;
function generationFailure(error, stage) {
  const diagnostics = {code: safeIdentifier(error.code), status: Number.isInteger(error.status) ? error.status : null,
    parameter: safeIdentifier(error.param), type: safeIdentifier(error.type)};
  if (error.newsDiscoveryDiagnostics) {
    const source = error.newsDiscoveryDiagnostics;
    diagnostics.newsDiscovery = {reason: safeIdentifier(source.reason), attempts: source.attempts === 2 ? 2 : 1, formatAttempted: source.formatAttempted === true};
    for (const field of ["completedSearchCount", "sourceUrlCount", "finalTextLength", "reportTextLength", "requestedSourceCount", "verifiedSourceCount", "retainedFactCount"]) {
      if (["requestedSourceCount", "verifiedSourceCount", "retainedFactCount"].includes(field) && source[field] === undefined) continue;
      diagnostics.newsDiscovery[field] = Number.isSafeInteger(source[field]) && source[field] >= 0 ? Math.min(source[field], 1000000) : 0;
    }
  }
  if (["invalid-news", "already-exists", "failed-precondition"].includes(error.code)) {
    return {errorCode: error.code, errorMessage: error.message, errorDiagnostics: diagnostics};
  }
  const service = stage === "source" ? "news search" : stage === "deduplicate" ? "news comparison" : stage === "text" ? "article writing" : stage === "word_count" ? "article length adjustment" : stage === "vocabulary" ? "vocabulary selection" : stage === "meaning" ? "word meaning" : stage === "questions" ? "article questions" : "image preparation";
  let message = `The ${service} service failed. Retry to resume completed work.`;
  if ([401, 403].includes(error.status)) message = `The ${service} service could not authenticate. Ask an administrator to check the provider credentials and access.`;
  else if (error.status === 429) message = `The ${service} service has reached its usage limit. Check the provider quota or billing before retrying.`;
  else if (error.status === 400) message = `The ${service} service rejected the request. Ask an administrator to check the generation settings.`;
  return {errorCode: "generation-failed", errorMessage: message, errorDiagnostics: diagnostics};
}
module.exports = {generationFailure};
