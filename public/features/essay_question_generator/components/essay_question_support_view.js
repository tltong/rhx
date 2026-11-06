// Shared by student practice, completed review and admin generation preview.
export function renderEssayQuestionSupport({root = document, container, question, onReady = () => {}, helpingWordsHeading = "Helping words and phrases"}) {
  if (!container) {onReady(); return () => {};}
  const key = JSON.stringify(question.support ?? null);
  if (container.dataset?.supportKey === key) return () => {};
  if (container.dataset) container.dataset.supportKey = key;
  container.replaceChildren();
  const support = question.support;
  let disposed = false, ready = false, timer;
  const finish = () => {if (!ready && !disposed) {ready = true; clearTimeout(timer); onReady();}};
  if (support?.pictureStatus === "ready" && support.picture) {
    const figure = root.createElement("figure"), link = root.createElement("a"), image = root.createElement("img");
    figure.style.margin = "16px 0"; figure.style.lineHeight = "1.6";
    link.href = support.picture.url; link.target = "_blank"; link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", "Open a larger picture");
    image.alt = support.picture.description || question.questionText || "Picture supporting the essay question"; image.style.maxWidth = "100%"; image.style.height = "auto";
    image.width = 640; image.decoding = "async";
    const caption = root.createElement("figcaption"); caption.textContent = "Select the picture to enlarge it.";
    const details = root.createElement("details"), summary = root.createElement("summary"), description = root.createElement("p");
    summary.textContent = "Picture description"; description.textContent = support.picture.description; description.dir = "auto";
    details.append(summary, description);
    const hasDescription = Boolean(support.picture.description);
    const fallback = () => {
      if (disposed) return;
      link.hidden = true;
      if (hasDescription) details.open = true;
      caption.textContent = hasDescription ? "The picture could not load. Use its description and the written question."
        : "The picture could not load. Use the written question."; finish();
    };
    image.onload = finish; image.onerror = fallback;
    timer = setTimeout(fallback, 15000);
    image.src = support.picture.url;
    link.append(image); figure.append(link, caption);
    if (hasDescription) figure.append(details);
    container.append(figure);
  } else finish();
  if (support?.helpingWordsStatus === "ready" && support.helpingWords?.length) {
    const section = root.createElement("section"), heading = root.createElement("h3"), help = root.createElement("p"), list = root.createElement("ul");
    heading.textContent = helpingWordsHeading;
    help.textContent = "Optional suggestions — use any that help you write your essay.";
    for (const word of support.helpingWords) {const item = root.createElement("li"); item.textContent = word; item.dir = "auto"; list.append(item);}
    section.append(heading, help, list); container.append(section);
  }
  return () => {disposed = true; clearTimeout(timer);};
}
