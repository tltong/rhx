function stripJsonCodeFence(content) {
  return String(content || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractFirstJsonValue(content) {
  const text = String(content || "");
  const start = text.search(/[\[{]/);

  if (start < 0) {
    return "";
  }

  const openingChar = text[start];
  const closingChar = openingChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === openingChar) {
      depth += 1;
    } else if (char === closingChar) {
      depth -= 1;

      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return "";
}

function repairJsonCandidate(candidate) {
  return String(candidate || "")
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
}

function parseModelJson(content) {
  const rawCandidates = [
    String(content || "").trim(),
    stripJsonCodeFence(content),
    extractFirstJsonValue(content),
  ].filter(Boolean);
  const candidates = [];

  rawCandidates.forEach((candidate) => {
    const repairedCandidate = repairJsonCandidate(candidate);

    candidates.push(candidate);

    if (repairedCandidate !== candidate) {
      candidates.push(repairedCandidate);
    }
  });

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      // Try the next candidate.
    }
  }

  return null;
}

module.exports = {parseModelJson};
