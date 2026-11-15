const STAGES = {
  source: [10, "Finding a news story"],
  deduplicate: [25, "Checking for repeated news"],
  publish: [30, "Saving the story"],
  text: [40, "Writing your article"],
  word_count: [58, "Adjusting article length"],
  vocabulary: [68, "Preparing vocabulary and meanings"],
  images: [75, "Preparing images"],
  finish: [98, "Finishing your article"],
};

export function mountNewsProgress({host, root = document, kind = "article"} = {}) {
  const heading = root.createElement("div"), label = root.createElement("span"), percentage = root.createElement("span"), bar = root.createElement("progress"), stage = root.createElement("p"), detail = root.createElement("p");
  host.classList.add("news-generation-progress"); heading.className = "news-progress-heading"; percentage.className = "news-progress-percentage";
  label.id = host.id + "-label"; label.textContent = kind === "meaning" ? "Meaning lookup" : kind === "language" ? "Article language switch" : "Article preparation"; stage.id = host.id + "-stage"; stage.className = "news-progress-stage";
  stage.setAttribute("role", "status"); stage.setAttribute("aria-live", "polite"); stage.setAttribute("aria-atomic", "true");
  detail.id = host.id + "-detail"; detail.className = "news-progress-detail";
  bar.max = 100; bar.setAttribute("aria-labelledby", label.id); bar.setAttribute("aria-describedby", stage.id + " " + detail.id);
  heading.append(label, percentage); host.append(heading, bar, stage, detail);
  let value = 0, active = false, imageNote = "", targetLanguage = "";
  const text = (element, value) => {if (element.textContent !== value) element.textContent = value;};
  function render(next, message, state = "active") {
    value = state === "ready" ? 100 : Math.max(value, Math.min(98, next)); active = true; host.hidden = false; host.dataset.state = state;
    bar.value = value; bar.textContent = value + "%";
    bar.setAttribute("aria-valuetext", (state === "ready" ? "100%" : "Estimated " + value + "%") + ". " + message + (imageNote ? ". " + imageNote : ""));
    text(percentage, (state === "ready" ? "" : "~") + value + "%"); text(stage, message);
    text(detail, state === "ready" ? kind === "meaning" ? "Your meaning is ready." : kind === "language" && targetLanguage ? "Your article is ready in " + targetLanguage + "." : "Your article is ready to read." : (imageNote ? imageNote + " · " : "") + "Estimated progress. Some steps take longer.");
  }
  function reset() {value = 0; active = false; imageNote = ""; targetLanguage = ""; host.hidden = true; bar.value = 0; stage.textContent = ""; detail.textContent = ""; percentage.textContent = "";}
  function start({language = ""} = {}) {
    reset(); targetLanguage = language;
    render(5, kind === "meaning" ? "Checking for a saved meaning" + (language ? " in " + language : "") : kind === "language" ? "Checking for a saved article" + (language ? " in " + language : " version") : "Checking for an available article");
  }
  function update(result) {
    if (result.status === "ready" || result.status === "completed" && result.article) {imageNote = ""; render(100, kind === "meaning" ? "Meaning ready" : kind === "language" ? "Language version ready" : "Article ready", "ready"); return;}
    let [base, message] = STAGES[result.stage] || [5, "Preparing your article"];
    if (kind === "meaning") {
      base = result.status === "queued" ? 25 : 65;
      message = (result.status === "queued" ? "Getting your meaning ready" : "Preparing the meaning") + (targetLanguage ? " in " + targetLanguage : "");
    } else if (kind === "language") {
      const version = targetLanguage ? "the " + targetLanguage + " version" : "this language version";
      message = {text: "Preparing " + version, word_count: "Adjusting the length of " + version, vocabulary: "Preparing vocabulary" + (targetLanguage ? " in " + targetLanguage : ""), images: "Reusing article images", finish: "Finishing " + version}[result.stage] || message;
    }
    const total = kind !== "meaning" && Number.isInteger(result.progress?.total) && result.progress.total > 0 ? result.progress.total : 0;
    const prepared = total && Number.isInteger(result.progress?.prepared) ? Math.min(total, Math.max(0, result.progress.prepared)) : 0;
    imageNote = total ? "Images ready: " + prepared + " of " + total : "";
    const estimate = result.stage === "images" && total ? base + Math.floor(20 * prepared / total) : base;
    render(estimate, result.status === "failed" ? message + " — paused" : message, result.status === "failed" ? "paused" : "active");
  }
  function resume() {if (!active) start(); else host.dataset.state = "active";}
  function connectionLost(retrying = false) {
    render(value || 5, retrying ? "Reconnecting to check your " + (kind === "meaning" ? "meaning" : kind === "language" ? "language version" : "saved progress") : "Could not check progress. Retry to continue.", "paused");
  }
  reset();
  return {start, update, resume, connectionLost, reset, dispose() {reset(); host.replaceChildren();}};
}
