const sanitizeHtml = require("sanitize-html");

const MAX_MERMAID_CODE_LENGTH = 20000;
const SAFE_SVG_TAGS = [
  "svg", "g", "defs", "marker", "path", "rect", "circle", "ellipse",
  "line", "polyline", "polygon", "text", "tspan", "title", "desc",
  "foreignObject", "div", "span", "p", "br",
];
const SAFE_SVG_ATTRIBUTES = [
  "id", "class", "xmlns", "xmlns:xlink", "viewBox", "width", "height",
  "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "d", "points", "transform", "preserveAspectRatio", "role", "aria-roledescription",
  "aria-labelledby", "aria-describedby", "tabindex", "style", "fill", "stroke",
  "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin",
  "stroke-opacity", "fill-opacity", "opacity", "color", "font-family",
  "font-size", "font-style", "font-weight", "text-anchor", "dominant-baseline",
  "display", "visibility", "marker-start", "marker-mid", "marker-end",
  "refX", "refY", "markerWidth", "markerHeight", "orient", "offset",
  "stop-color", "stop-opacity", "href", "xlink:href",
];
const PRESENTATION_PROPERTIES = [
  "fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray",
  "stroke-linecap", "stroke-linejoin", "stroke-opacity", "opacity", "color",
  "font-family", "font-size", "font-style", "font-weight", "text-anchor",
  "dominant-baseline", "display", "visibility",
];
const PROHIBITED_SOURCES = [
  [/%%\s*\{/i, "Mermaid configuration directives are not allowed."],
  [/(?:^|\n)\s*click\s+/i, "Mermaid click actions are not allowed."],
  [/\b(?:javascript|vbscript)\s*:/i, "Executable links are not allowed."],
  [/\bdata\s*:\s*text\/html/i, "HTML data links are not allowed."],
  [/<\s*\/?\s*(?:script|iframe|object|embed|foreignObject)\b/i,
    "Executable HTML elements are not allowed."],
  [/\bon[a-z]+\s*=/i, "HTML event handlers are not allowed."],
];

let browserPromise = null;

function requireSafeMermaidCode(value) {
  const mermaidCode = String(value ?? "")
    .trim()
    .replace(/^```(?:mermaid)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/\\+r\\+n|\\+n|\\+r/g, "\n")
    .trim();

  if (!mermaidCode) {
    throw new Error("Mermaid code is required.");
  }

  if (mermaidCode.length > MAX_MERMAID_CODE_LENGTH) {
    throw new Error(
      `Mermaid code must not exceed ${MAX_MERMAID_CODE_LENGTH} characters.`,
    );
  }

  const prohibited = PROHIBITED_SOURCES.find(([pattern]) => (
    pattern.test(mermaidCode)
  ));

  if (prohibited) {
    throw new Error(prohibited[1]);
  }

  return mermaidCode;
}

function sanitizeSvg(svg) {
  const sanitizedSvg = sanitizeHtml(String(svg || ""), {
    allowedTags: SAFE_SVG_TAGS,
    allowedAttributes: {
      "*": SAFE_SVG_ATTRIBUTES,
    },
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "style", "textarea", "option", "iframe", "object", "embed"],
    parser: {
      lowerCaseAttributeNames: false,
      lowerCaseTags: false,
    },
    transformTags: {
      "*": (tagName, attributes) => {
        const safeAttributes = {};

        Object.entries(attributes).forEach(([name, value]) => {
          const normalizedName = name.toLowerCase();
          const normalizedValue = String(value || "").trim();

          if (normalizedName.startsWith("on")) {
            return;
          }

          if (
            (normalizedName === "href" || normalizedName === "xlink:href")
            && !normalizedValue.startsWith("#")
          ) {
            return;
          }

          if (
            normalizedName === "style"
            && /(?:expression|url)\s*\(|@import|behavior\s*:/i.test(normalizedValue)
          ) {
            return;
          }

          safeAttributes[name] = value;
        });

        return { tagName, attribs: safeAttributes };
      },
    },
  }).trim();

  if (!/^<svg\b/i.test(sanitizedSvg) || !/<\/svg>$/i.test(sanitizedSvg)) {
    throw new Error("Mermaid returned invalid SVG output.");
  }

  return sanitizedSvg;
}

async function inlinePresentationStyles(browser, svg) {
  const page = await browser.newPage();

  try {
    return page.evaluate((svgSource, properties) => {
      document.body.innerHTML = svgSource;
      const svgElement = document.querySelector("svg");

      if (!svgElement) {
        throw new Error("Rendered output does not contain an SVG element.");
      }

      [svgElement, ...svgElement.querySelectorAll("*")].forEach((element) => {
        const computedStyle = getComputedStyle(element);
        const declarations = properties
          .map((property) => [property, computedStyle.getPropertyValue(property)])
          .filter(([, value]) => {
            const normalizedValue = String(value || "").trim();

            return normalizedValue
              && !/(?:expression|url)\s*\(|@import|behavior\s*:/i.test(
                normalizedValue,
              );
          })
          .map(([property, value]) => `${property}:${value.trim()}`);

        if (declarations.length > 0) {
          element.setAttribute("style", declarations.join(";"));
        }
      });
      svgElement.querySelectorAll(
        "script, style, iframe, object, embed",
      ).forEach((element) => element.remove());

      return svgElement.outerHTML;
    }, String(svg || ""), PRESENTATION_PROPERTIES);
  } finally {
    await page.close();
  }
}

function detectDiagramType(mermaidCode) {
  const firstLine = mermaidCode.split(/\r?\n/, 1)[0].trim();

  return firstLine.split(/\s+/, 1)[0] || "unknown";
}

async function launchBrowser() {
  const { default: puppeteer } = await import("puppeteer");

  return puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = launchBrowser();
  }

  const browser = await browserPromise;

  if (!browser.connected) {
    browserPromise = launchBrowser();
    return browserPromise;
  }

  return browser;
}

class ServerMermaidRenderer {
  async render(value) {
    const mermaidCode = requireSafeMermaidCode(value);
    const [{ renderMermaid }, browser] = await Promise.all([
      import("@mermaid-js/mermaid-cli"),
      getBrowser(),
    ]);
    const result = await renderMermaid(
      browser,
      mermaidCode,
      "svg",
      {
        backgroundColor: "white",
        mermaidConfig: {
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            fontFamily: "Arial, Helvetica, sans-serif",
            primaryColor: "#e8f4ff",
            primaryTextColor: "#102a43",
            primaryBorderColor: "#0369a1",
            lineColor: "#52606d",
            secondaryColor: "#e4f5e9",
            tertiaryColor: "#f8fafc",
          },
          flowchart: { htmlLabels: true },
        },
      },
    );
    const svg = await inlinePresentationStyles(
      browser,
      Buffer.from(result.data).toString("utf8"),
    );

    return {
      diagramType: detectDiagramType(mermaidCode),
      mermaidCode,
      svg: sanitizeSvg(svg),
    };
  }
}

module.exports = {
  ServerMermaidRenderer,
};
