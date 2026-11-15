import * as news from "../../student_news_module.js?v=20261115-news-student-v1";
import {mountNewsProgress} from "../../components/news_progress.js?v=20261115-news-lookup-progress-v1";

// Shared by the preview and student article readers. A reference is either an
// owned previewGenerationId or the current student's assignmentId/articleLanguage.
export function mountNewsVocabulary({root = document, host, apis = news, pollMs = 2500, onReady = () => {}} = {}) {
  const status = root.createElement("p"), retry = root.createElement("button"), dialog = root.createElement("dialog"), heading = root.createElement("h3"),
    articleMeaningLabel = root.createElement("p"), articleMeaning = root.createElement("p"), otherLanguages = root.createElement("section"),
    label = root.createElement("label"), select = root.createElement("select"), meaning = root.createElement("p"), meaningProgressHost = root.createElement("div"), retryMeaning = root.createElement("button"), close = root.createElement("button");
  status.className = "help-text"; status.setAttribute("role", "status"); retry.type = "button"; retry.className = "secondary"; retry.textContent = "Retry vocabulary"; retry.hidden = true;
  dialog.className = "news-meaning-dialog"; articleMeaningLabel.className = "news-article-meaning-label"; articleMeaning.className = "news-article-meaning"; heading.tabIndex = -1;
  otherLanguages.className = "news-other-languages"; label.textContent = "Meaning in another language"; label.append(select); select.className = "news-meaning-language"; select.setAttribute("aria-label", "Meaning language");
  meaning.setAttribute("role", "status"); meaning.setAttribute("aria-live", "polite"); meaning.className = "news-word-meaning";
  close.type = "button"; close.textContent = "Close"; close.className = "secondary news-meaning-close";
  retryMeaning.type = "button"; retryMeaning.textContent = "Retry meaning"; retryMeaning.className = "news-meaning-retry"; retryMeaning.hidden = true;
  meaningProgressHost.id = host.id + "-meaning-progress"; meaningProgressHost.className = "news-meaning-progress";
  const meaningProgress = mountNewsProgress({root, host: meaningProgressHost, kind: "meaning"});
  otherLanguages.append(label, meaningProgressHost, meaning, retryMeaning); dialog.append(heading, articleMeaningLabel, articleMeaning, otherLanguages, close); host.append(status, retry, dialog);
  let reference = null, editionId = null, articleLanguage = null, selected = null, activeTerm = null, lastLanguage = null, languages = [], disposed = false,
    version = 0, meaningVersion = 0, vocabularyTimer, meaningTimer, sourceKey = null, lookupKey = null, requestQueue = Promise.resolve();
  function stopMeaning() {meaningVersion++; clearTimeout(meaningTimer); activeTerm = null; lookupKey = null; meaningProgress.reset(); if (dialog.open) dialog.close();}
  function languageOptions(value = "") {
    const normalized = value => String(value).normalize("NFKC").trim().toLowerCase();
    const available = languages.filter(language => normalized(language) !== normalized(articleLanguage));
    if (available.includes(lastLanguage)) {available.splice(available.indexOf(lastLanguage), 1); available.unshift(lastLanguage);}
    select.replaceChildren();
    for (const language of ["", ...available]) {const option = root.createElement("option"); option.value = language; option.textContent = language || "Choose another language"; select.append(option);}
    select.value = available.includes(value) ? value : "";
    otherLanguages.hidden = available.length === 0;
  }
  async function loadVocabulary(retryFailed = false) {
    if (disposed || !reference) return;
    const revision = version; retry.hidden = true;
    try {
      const result = await apis.getNewsVocabulary({...reference, ...(retryFailed ? {retry: true} : {})});
      if (disposed || revision !== version) return;
      if (result.editionId !== editionId) throw new Error("The article changed. Reload its vocabulary.");
      languages = result.languages; lastLanguage = result.lastMeaningLanguage; languageOptions();
      if (result.status === "ready") {
        selected = result; status.textContent = result.actualCount ? "Select a highlighted word or phrase to see its meaning." : "";
        onReady(); return;
      }
      if (result.status === "failed") {status.textContent = result.errorMessage || "Vocabulary could not be prepared."; retry.hidden = false; return;}
      status.textContent = "Preparing vocabulary..."; vocabularyTimer = setTimeout(() => loadVocabulary(), pollMs);
    } catch (error) {if (!disposed && revision === version) {status.textContent = error.message || "Could not load vocabulary."; retry.hidden = false;}}
  }
  function showMeaning(result, token, input) {
    if (disposed || token !== meaningVersion) return;
    meaningProgress.update(result);
    if (result.status === "ready") {meaning.textContent = result.meaning; retryMeaning.hidden = true; return;}
    if (result.status === "failed") {meaning.textContent = result.errorMessage || "Meaning could not be prepared."; retryMeaning.hidden = false; return;}
    meaning.textContent = "Preparing meaning...";
    meaningTimer = setTimeout(async () => {
      try {showMeaning(await apis.getNewsMeaning(input), token, input);}
      catch (error) {if (!disposed && token === meaningVersion) {meaningProgress.connectionLost(); meaning.textContent = error.message || "Could not check the meaning."; retryMeaning.hidden = false;}}
    }, pollMs);
  }
  function requestMeaning() {
    if (!activeTerm || !selected || disposed) return;
    if (!select.value) {meaningVersion++; clearTimeout(meaningTimer); meaning.textContent = ""; retryMeaning.hidden = true; lookupKey = null; meaningProgress.reset(); return;}
    clearTimeout(meaningTimer); const token = ++meaningVersion;
    const input = {...reference, setId: selected.setId, termId: activeTerm.id, meaningLanguage: select.value};
    const nextKey = JSON.stringify([editionId, selected.setId, activeTerm.id, select.value]);
    if (nextKey === lookupKey) meaningProgress.resume(); else meaningProgress.start({language: select.value});
    lookupKey = nextKey;
    lastLanguage = select.value; languageOptions(select.value); meaning.textContent = "Preparing meaning..."; retryMeaning.hidden = true;
    // Serialize selection requests so a slow earlier response cannot overwrite
    // the student's newer language preference. The selector remains usable.
    requestQueue = requestQueue.catch(() => {}).then(async () => {
      if (disposed || token !== meaningVersion) return;
      try {showMeaning(await apis.requestNewsMeaning(input), token, input);}
      catch (error) {if (!disposed && token === meaningVersion) {meaningProgress.connectionLost(); meaning.textContent = error.message || "Could not prepare the meaning."; retryMeaning.hidden = false;}}
    });
  }
  function openMeaning(item) {
    stopMeaning(); activeTerm = item; heading.textContent = item.term; languageOptions();
    articleMeaningLabel.textContent = "Meaning in " + articleLanguage; articleMeaning.textContent = item.articleMeaning;
    meaning.textContent = ""; retryMeaning.hidden = true;
    dialog.setAttribute("aria-label", "Meaning of " + item.term); dialog.showModal(); heading.focus({preventScroll: true}); dialog.scrollTop = 0;
  }
  function renderText(element, page) {
    element.replaceChildren(); let offset = 0;
    for (const item of selected?.items.filter(item => item.pagePosition === page.position) || []) {
      if (item.startOffset < offset || item.endOffset > page.text.length || page.text.slice(item.startOffset, item.endOffset) !== item.term) continue;
      element.append(root.createTextNode(page.text.slice(offset, item.startOffset)));
      const button = root.createElement("button"); button.type = "button"; button.className = "news-vocabulary-term"; button.textContent = item.term;
      button.dataset.termId = item.id; button.setAttribute("aria-haspopup", "dialog"); button.addEventListener("click", () => openMeaning(item)); element.append(button); offset = item.endOffset;
    }
    element.append(root.createTextNode(page.text.slice(offset)));
  }
  const closePanel = () => {stopMeaning();}, retrySelection = () => loadVocabulary(true);
  const cancelled = () => {meaningVersion++; clearTimeout(meaningTimer); activeTerm = null; lookupKey = null; meaningProgress.reset();};
  select.addEventListener("change", requestMeaning); close.addEventListener("click", closePanel); retry.addEventListener("click", retrySelection); retryMeaning.addEventListener("click", requestMeaning); dialog.addEventListener("cancel", cancelled);
  return {renderText,
    setArticle(articleReference, article) {
      const next = JSON.stringify([articleReference, article.editionId]); if (next === sourceKey) return;
      sourceKey = next; reference = {...articleReference}; editionId = article.editionId; articleLanguage = article.language; selected = null; version++; clearTimeout(vocabularyTimer); stopMeaning();
      status.textContent = "Preparing vocabulary..."; retry.hidden = true; loadVocabulary();
    },
    refresh() {version++; clearTimeout(vocabularyTimer); selected = null; stopMeaning(); onReady(); loadVocabulary();},
    clear() {version++; sourceKey = null; reference = null; editionId = null; selected = null; clearTimeout(vocabularyTimer); stopMeaning(); status.textContent = ""; retry.hidden = true;},
    dispose() {disposed = true; version++; clearTimeout(vocabularyTimer); stopMeaning(); meaningProgress.dispose(); select.removeEventListener("change", requestMeaning); close.removeEventListener("click", closePanel); retry.removeEventListener("click", retrySelection); retryMeaning.removeEventListener("click", requestMeaning); dialog.removeEventListener("cancel", cancelled); host.replaceChildren();},
  };
}
