import {answerLength, answerLengthUnit, requiredAnswerLength} from "../domain/fill_in_the_blanks.js?v=20261105-chinese-count-v1";
export function mountFillInTheBlanksPassage({root, passage, answers = {}, result = null, readOnly = false, previewImage = null}) {
  root.replaceChildren(); root.classList?.add("fill-in-the-blanks-view");
  const doc = root.ownerDocument, inputs = new Map(), questions = new Map(passage.questions.map(q => [q.questionId, q]));
  let resolveReady; const ready = new Promise(resolve => {resolveReady = resolve;});
  let timeout, finished = false;
  let previewUrl = null;
  const dialogs = new Set(), imageUrls = doc.defaultView?.URL ?? globalThis.URL;
  if (previewImage?.mimeType === "image/png" && typeof previewImage.base64 === "string") {
    try {
      const bytes = Uint8Array.from(atob(previewImage.base64), character => character.charCodeAt(0));
      const ImageBlob = doc.defaultView?.Blob ?? globalThis.Blob;
      previewUrl = imageUrls.createObjectURL(new ImageBlob([bytes], {type: "image/png"}));
    } catch { /* A malformed optional picture must not hide the written question. */ }
  }
  const imageUrl = previewUrl ?? passage.image?.url;
  const finish = () => {if (!finished) {finished = true; clearTimeout(timeout); resolveReady();}};
  if (previewUrl || imageUrl && /^https:\/\//.test(imageUrl)) {
    const figure = doc.createElement("figure"), image = doc.createElement("img"), button = doc.createElement("button"), note = doc.createElement("p");
    image.src = imageUrl; image.alt = "Illustration supporting the passage"; image.className = "passage-image";
    button.type = "button"; button.className = "picture-button"; button.setAttribute("aria-label", "Enlarge passage picture"); button.append(image);
    note.textContent = "Select the picture to enlarge it. Every answer can be found from the written context.";
    const fallback = () => {figure.hidden = true; note.textContent = "The picture is unavailable. You can answer every blank using the written passage."; finish();};
    image.addEventListener("load", finish, {once: true}); image.addEventListener("error", fallback, {once: true});
    button.addEventListener("click", () => {
      const dialog = doc.createElement("dialog"), large = image.cloneNode(), close = doc.createElement("button");
      dialog.className = "fill-picture-dialog";
      close.type = "button"; close.textContent = "Close picture"; close.addEventListener("click", () => dialog.close());
      dialogs.add(dialog);
      dialog.append(close, large); doc.body.append(dialog); dialog.addEventListener("close", () => {dialogs.delete(dialog); dialog.remove();}, {once: true}); dialog.showModal();
    });
    figure.append(button); root.append(figure, note); timeout = setTimeout(fallback, 15000);
    if (image.complete) {if (image.naturalWidth) finish(); else fallback();}
  } else finish();
  const paragraph = doc.createElement("div"); paragraph.className = "passage-text"; paragraph.dir = "auto";
  const parts = passage.passageText.split(/(\{\{[^{}]+\}\})/g);
  for (const part of parts) {
    const match = part.match(/^\{\{([^{}]+)\}\}$/), question = match ? questions.get(match[1]) : null;
    if (!question) {paragraph.append(doc.createTextNode(part)); continue;}
    const field = doc.createElement("span"), label = doc.createElement("label"), input = doc.createElement("input"), hint = doc.createElement("small");
    field.className = "blank-field"; input.id = "blank-" + question.questionId;
    input.type = "text"; input.autocomplete = "off"; input.spellcheck = false; input.maxLength = 1000; input.dir = "auto";
    input.value = result?.answers?.[question.questionId]?.submittedAnswer ?? answers[question.questionId] ?? "";
    input.disabled = readOnly || Boolean(result); input.setAttribute("aria-describedby", input.id + "-hint");
    label.htmlFor = input.id; label.textContent = question.position + "."; label.setAttribute("aria-label", "Question " + question.position);
    const required = requiredAnswerLength(question, passage.language), unit = answerLengthUnit(passage.language, question);
    hint.id = input.id + "-hint";
    hint.textContent = required === null ? "Character count unavailable; reload this passage." : required + " " + (required === 1 ? unit.slice(0, -1) : unit);
    function validate() {
      const message = !input.value.trim() ? "" : required === null ? "Reload this passage to get its Chinese character counts."
        : answerLength(input.value, passage.language, question) !== required ? "Enter exactly " + required + " " + (required === 1 ? unit.slice(0, -1) : unit) + ", or leave this blank." : "";
      input.setCustomValidity(message); input.setAttribute("aria-invalid", String(Boolean(message))); return !message;
    }
    input.addEventListener("input", validate); inputs.set(question.questionId, {input, validate}); field.append(label, input, hint);
    if (result) {
      const marked = result.answers[question.questionId], feedback = doc.createElement("span");
      feedback.className = marked.isCorrect ? "answer-correct" : "answer-incorrect";
      feedback.textContent = marked.isCorrect ? "Correct" : (marked.submittedAnswer.trim() ? "Incorrect. Model answer: " : "Unanswered. Model answer: ") + marked.correctAnswer;
      field.append(feedback);
    }
    paragraph.append(field);
  }
  root.append(paragraph);
  return {ready, getAnswers: () => Object.fromEntries([...inputs].map(([key, field]) => [key, field.input.value])),
    validate: () => [...inputs.values()].every(field => field.validate()),
    setDisabled: value => inputs.forEach(field => {field.input.disabled = value || readOnly || Boolean(result);}),
    dispose: () => {clearTimeout(timeout); finish();
      for (const dialog of dialogs) {dialog.close(); dialog.remove();} dialogs.clear();
      if (previewUrl) {imageUrls.revokeObjectURL(previewUrl); previewUrl = null;}
    }};
}
