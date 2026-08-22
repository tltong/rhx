const MATH_DELIMITERS = Object.freeze([
  Object.freeze({ left: "\\(", right: "\\)", display: false }),
  Object.freeze({ left: "\\[", right: "\\]", display: true })
]);

function requireElement(value) {
  if (!value || value.nodeType !== 1) {
    throw new Error("A DOM element is required for math rendering.");
  }

  return value;
}

function getMathRenderer() {
  return typeof globalThis.renderMathInElement === "function"
    ? globalThis.renderMathInElement
    : null;
}

function renderMathContent(element) {
  const target = requireElement(element);
  const renderMath = getMathRenderer();

  if (!renderMath) {
    return false;
  }

  renderMath(target, {
    delimiters: MATH_DELIMITERS,
    throwOnError: false,
    strict: "warn",
    trust: false
  });

  return true;
}

function setMathText(element, value) {
  const target = requireElement(element);

  target.textContent = String(value ?? "");

  if (
    !renderMathContent(target)
    && globalThis.document?.readyState === "loading"
    && typeof globalThis.addEventListener === "function"
  ) {
    globalThis.addEventListener(
      "load",
      () => renderMathContent(target),
      { once: true }
    );
  }

  return target;
}

export {
  MATH_DELIMITERS,
  renderMathContent,
  setMathText
};
