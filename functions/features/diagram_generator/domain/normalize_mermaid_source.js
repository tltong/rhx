function splitCommaSeparatedValues(source) {
  const values = [];
  let current = "";
  let quote = null;
  let escaped = false;

  for (const character of String(source || "")) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === "\\" && quote) {
      current += character;
      escaped = true;
      continue;
    }

    if ((character === '"' || character === "'") && !quote) {
      quote = character;
      current += character;
      continue;
    }

    if (character === quote) {
      quote = null;
      current += character;
      continue;
    }

    if (character === "," && !quote) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current.trim());
  return values;
}

function isNumber(value) {
  return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value);
}

function normalizeTextValue(value) {
  const text = String(value || "").trim();

  if (!text) {
    return text;
  }

  if (text.startsWith('"') && text.endsWith('"')) {
    return text;
  }

  if (text.startsWith("'") && text.endsWith("'")) {
    return JSON.stringify(text.slice(1, -1));
  }

  return JSON.stringify(text);
}

function normalizeCategory(value) {
  const category = String(value || "").trim();

  if (!category || isNumber(category)) {
    return category;
  }

  return normalizeTextValue(category);
}

function normalizeXyChartLine(line) {
  const categoryAxis = line.match(/^(\s*x-axis\s+)\[(.*)\](\s*)$/i);

  if (categoryAxis) {
    const categories = splitCommaSeparatedValues(categoryAxis[2])
      .map(normalizeCategory)
      .join(", ");

    return `${categoryAxis[1]}[${categories}]${categoryAxis[3]}`;
  }

  const rangeAxis = line.match(
    /^(\s*(?:x-axis|y-axis)\s+)(.*?)(\s+[+-]?(?:\d+\.?\d*|\.\d+)\s*-->\s*[+-]?(?:\d+\.?\d*|\.\d+)\s*)$/i,
  );

  if (rangeAxis) {
    const axisTitle = rangeAxis[2].trim();

    return axisTitle
      ? `${rangeAxis[1]}${normalizeTextValue(axisTitle)}${rangeAxis[3]}`
      : line;
  }

  const title = line.match(/^(\s*title\s+)(.+?)(\s*)$/i);

  if (title) {
    return `${title[1]}${normalizeTextValue(title[2])}${title[3]}`;
  }

  return line;
}

function normalizeMermaidSource(value) {
  const source = String(value || "");
  const firstLine = source
    .split(/\r?\n/)
    .find((line) => line.trim());

  if (!/^xychart(?:-beta)?\b/i.test(String(firstLine || "").trim())) {
    return source;
  }

  return source
    .split(/\r?\n/)
    .map(normalizeXyChartLine)
    .join("\n");
}

module.exports = {
  normalizeMermaidSource,
};
