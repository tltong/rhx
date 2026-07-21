const MERMAID_MODULE_URL =
  "https://cdn.jsdelivr.net/npm/mermaid@11.16.0/dist/mermaid.esm.min.mjs";
const MAX_MERMAID_CODE_LENGTH = 20000;

let renderSequence = 0;

async function loadDefaultMermaid() {
  const mermaidModule = await import(MERMAID_MODULE_URL);

  return mermaidModule.default;
}

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
      `Mermaid code must not exceed ${MAX_MERMAID_CODE_LENGTH} characters.`
    );
  }

  const prohibitedSources = [
    {
      pattern: /%%\s*\{/i,
      message: "Mermaid configuration directives are not allowed."
    },
    {
      pattern: /(?:^|\n)\s*click\s+/i,
      message: "Mermaid click actions are not allowed."
    },
    {
      pattern: /\b(?:javascript|vbscript)\s*:/i,
      message: "Executable links are not allowed."
    },
    {
      pattern: /\bdata\s*:\s*text\/html/i,
      message: "HTML data links are not allowed."
    },
    {
      pattern: /<\s*\/?\s*(?:script|iframe|object|embed|foreignObject)\b/i,
      message: "Executable HTML elements are not allowed."
    },
    {
      pattern: /\bon[a-z]+\s*=/i,
      message: "HTML event handlers are not allowed."
    }
  ];
  const prohibitedSource = prohibitedSources.find(({ pattern }) => (
    pattern.test(mermaidCode)
  ));

  if (prohibitedSource) {
    throw new Error(prohibitedSource.message);
  }

  return mermaidCode;
}

function sanitizeSvg(svg) {
  const normalizedSvg = String(svg ?? "").trim();

  if (!normalizedSvg) {
    throw new Error("Mermaid returned an empty SVG.");
  }

  if (
    typeof DOMParser !== "function"
    || typeof XMLSerializer !== "function"
  ) {
    return normalizedSvg;
  }

  const parser = new DOMParser();
  const documentNode = parser.parseFromString(
    normalizedSvg,
    "image/svg+xml"
  );

  if (
    documentNode.querySelector("parsererror")
    || documentNode.documentElement?.localName !== "svg"
  ) {
    throw new Error("Mermaid returned invalid SVG output.");
  }

  const svgElement = documentNode.documentElement;

  svgElement.querySelectorAll(
    "script, iframe, object, embed"
  ).forEach((element) => element.remove());

  [svgElement, ...svgElement.querySelectorAll("*")].forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const attributeName = attribute.name.toLowerCase();
      const attributeValue = attribute.value.trim();

      if (attributeName.startsWith("on")) {
        element.removeAttribute(attribute.name);
        return;
      }

      if (
        (attributeName === "href" || attributeName === "xlink:href")
        && !attributeValue.startsWith("#")
      ) {
        element.removeAttribute(attribute.name);
        return;
      }

      if (
        attributeName === "style"
        && /(?:expression|url)\s*\(/i.test(attributeValue)
      ) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  return new XMLSerializer().serializeToString(svgElement);
}

function createRenderId() {
  renderSequence += 1;

  return `rhx-mermaid-${Date.now()}-${renderSequence}`;
}

export class BrowserMermaidRenderer {
  constructor(loadMermaid = loadDefaultMermaid) {
    if (typeof loadMermaid !== "function") {
      throw new Error("loadMermaid must be a function.");
    }

    this.loadMermaid = loadMermaid;
    this.mermaid = null;
  }

  async getMermaid() {
    if (this.mermaid) {
      return this.mermaid;
    }

    const mermaid = await this.loadMermaid();

    if (!mermaid || typeof mermaid.render !== "function") {
      throw new Error("Mermaid could not be loaded.");
    }

    mermaid.initialize({
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
        tertiaryColor: "#f8fafc"
      },
      flowchart: {
        htmlLabels: true
      }
    });
    this.mermaid = mermaid;

    return this.mermaid;
  }

  async render(value) {
    const mermaidCode = requireSafeMermaidCode(value);
    const mermaid = await this.getMermaid();
    const parseResult = await mermaid.parse(mermaidCode);
    const renderResult = await mermaid.render(
      createRenderId(),
      mermaidCode
    );

    return {
      diagramType: parseResult.diagramType,
      mermaidCode,
      svg: sanitizeSvg(renderResult.svg)
    };
  }
}
