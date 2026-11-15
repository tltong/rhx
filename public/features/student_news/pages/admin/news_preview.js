import * as news from "../../student_news_module.js?v=20261115-news-student-v1";
import {mountNewsVocabulary} from "../common/news_vocabulary.js?v=20261115-news-lookup-progress-v1";
import {mountNewsQuestions} from "../common/news_questions.js?v=20261115-news-student-v1";
import {mountNewsProgress} from "../../components/news_progress.js?v=20261115-news-lookup-progress-v1";
export function mountNewsPreview({root = document, apis = news, pollMs = 2500, onBusyChange = () => {}} = {}) {
  const byId = id => root.getElementById(id), status = byId("news-preview-status"), form = byId("news-preview-form"), fields = byId("news-preview-fields"),
    type = byId("news-preview-type"), country = byId("news-preview-country"), level = byId("news-preview-level"), grade = byId("news-preview-grade"), language = byId("news-preview-language"), story = byId("news-preview-story"), articleLanguage = byId("news-preview-article-language"),
    generate = byId("news-preview-generate"), retry = byId("news-preview-retry"), add = byId("news-preview-add"), article = byId("news-preview-article"), previous = byId("news-preview-previous"), next = byId("news-preview-next");
  let configState = {loaded: false, busy: false, dirty: false}, loaded = false, busy = false, disposed = false, timer, current = null, displayed = null, pending = null, pendingLanguage = null, languages = [], page = 0, optionSequence = 0, listeners = [];
  let vocabularyConfigDirty = false;
  let questionBusy = false;
  const progress = mountNewsProgress({root, host: byId("news-preview-progress")});
  const languageProgress = mountNewsProgress({root, host: byId("news-preview-language-progress"), kind: "language"});
  let activeProgress = progress;
  const vocabulary = mountNewsVocabulary({root, host: byId("news-preview-vocabulary"), apis, pollMs, onReady: () => {if (!disposed && displayed) renderPage();}});
  const questions = mountNewsQuestions({root, host: byId("news-preview-questions"), apis, pollMs, onBusyChange: value => {questionBusy = value; controls();}});
  function listen(element, event, callback) {element.addEventListener(event, callback); listeners.push(() => element.removeEventListener(event, callback));}
  function message(value, error = false) {status.textContent = value; status.classList.toggle("is-error", error);}
  function controls() {
    const working = current && ["queued", "running"].includes(current.status), pendingRequest = !!pending && !current;
    fields.disabled = disposed || busy || questionBusy || working || !!pendingLanguage || !loaded || !configState.loaded || configState.busy;
    for (const field of [type, level, grade, language, story]) field.disabled = pendingRequest;
    country.disabled = type.value !== "local" || pendingRequest; country.required = type.value === "local";
    byId("news-preview-options").disabled = disposed || busy || working || pendingRequest || !!pendingLanguage;
    generate.disabled = configState.dirty || !language.value;
    generate.textContent = pending && !current ? "Retry preview request" : "Generate preview";
    articleLanguage.disabled = disposed || busy || questionBusy || working || !!pendingLanguage || configState.busy || !displayed;
    retry.disabled = disposed || busy; add.disabled = disposed || busy || !!pendingLanguage || current?.status !== "completed" || !!current?.pooled;
    add.textContent = current?.pooled ? "Added to pool" : "Add to pool";
    previous.disabled = page <= 0; next.disabled = page >= (displayed?.article?.pages.length || 1) - 1;
  }
  function setBusy(value) {busy = value; onBusyChange(value); controls();}
  function options(select, values, placeholder = null) {
    const selected = select.value; select.replaceChildren();
    if (placeholder !== null) {const option = root.createElement("option"); option.value = ""; option.textContent = placeholder; select.append(option);}
    for (const value of values) {const option = root.createElement("option"); option.value = typeof value === "string" ? value : value.value; option.textContent = typeof value === "string" ? value : value.title; select.append(option);}
    if ([...select.options].some(option => option.value === selected)) select.value = selected;
  }
  function articleLanguages() {
    const available = [...languages], active = displayed?.article.language;
    if (active && !available.includes(active)) available.push(active);
    options(articleLanguage, available);
    if (active) articleLanguage.value = active;
  }
  async function loadStories() {
    const sequence = ++optionSequence;
    const selected = story.value;
    options(story, [], "Find a new story through web search");
    if (type.value === "local" && !country.value) return;
    try {
      const result = await apis.listNewsStories({newsType: type.value, country: type.value === "local" ? country.value : null});
      if (disposed || sequence !== optionSequence) return;
      options(story, result.stories.map(item => ({value: item.storyId, title: item.title})), "Find a new story through web search");
      if (result.stories.some(item => item.storyId === selected)) story.value = selected;
    } catch (error) {if (!disposed && sequence === optionSequence) message(error.message || "Could not load pooled stories.", true);}
  }
  async function loadOptions() {
    if (disposed || busy) return;
    setBusy(true); message("Loading preview options...");
    try {
      const result = await apis.getNewsPreviewOptions(); if (disposed) return;
      options(country, result.countries, "Choose a country"); options(language, result.languages); languages = result.languages; articleLanguages();
      loaded = true; await loadStories();
      if (!disposed) message(result.languages.length ? "Choose a grade and language, then generate a preview." : "Add languages in Syllabus Scope before generating news.");
    } catch (error) {if (!disposed) {loaded = false; message(error.message || "Could not load preview options.", true);}}
    finally {setBusy(false); byId("news-preview-options").disabled = disposed || busy;}
  }
  function link(label, address) {
    const a = root.createElement("a"); a.textContent = label;
    try {if (new URL(address).protocol === "https:") a.href = address;} catch { /* Render a label only for an invalid URL. */ }
    a.target = "_blank"; a.rel = "noopener noreferrer"; return a;
  }
  function renderPage() {
    const value = displayed.article.pages[page], container = byId("news-preview-page"); container.replaceChildren();
    if (value.text) {const paragraph = root.createElement("p"); vocabulary.renderText(paragraph, value); container.append(paragraph);}
    for (const image of value.images) {
      const figure = root.createElement("figure"), img = root.createElement("img"), caption = root.createElement("figcaption");
      img.src = image.url; img.alt = image.altText; img.referrerPolicy = "no-referrer";
      if (image.sourceType === "ai") caption.textContent = "AI-generated illustration";
      else {caption.append(root.createTextNode("Representative photo · " + image.credit + " · "), link(image.license || "Licence", image.licenseUrl || image.sourceUrl));
        if (image.sourceUrl) caption.append(root.createTextNode(" · "), link("Photo source", image.sourceUrl));}
      figure.append(img, caption); container.append(figure);
    }
    byId("news-preview-position").textContent = "Page " + (page + 1) + " of " + displayed.article.pages.length;
    previous.parentElement.hidden = displayed.article.pages.length === 1; controls();
  }
  function show(result) {
    activeProgress.update(result);
    current = result; retry.hidden = result.status !== "failed";
    if (result.status === "completed") {
      clearTimeout(timer); displayed = result; page = Math.min(page, result.article.pages.length - 1); article.hidden = false; articleLanguages();
      vocabulary.setArticle({previewGenerationId: result.generationId}, result.article);
      questions.setArticle({previewGenerationId: result.generationId}, result.article);
      byId("news-preview-title").textContent = result.article.title;
      byId("news-preview-meta").textContent = result.article.language + " · " + result.article.actualWordCount + " words · Target: " + result.article.targetWordCount + " · Published " + new Date(result.article.publishedAt).toLocaleDateString();
      const sources = byId("news-preview-sources"); sources.replaceChildren();
      const title = root.createElement("h3"); title.textContent = "Sources"; sources.append(title);
      for (const source of result.article.sources) {const line = root.createElement("p"); line.append(link(source.publisher + ": " + source.title, source.url)); sources.append(line);}
      renderPage(); message(result.pooled ? "Article is in the shared pool." : "Preview ready. Add it to the pool when you want to share it."); setBusy(false); return;
    }
    if (result.status === "failed") {articleLanguages(); retry.textContent = "Retry preparation"; message(result.errorMessage || "Preparation failed. Retry to resume.", true); setBusy(false); return;}
    message("Preparing your preview. You can follow its progress below.");
    timer = setTimeout(poll, pollMs);
  }
  async function poll() {
    if (disposed || !current?.generationId) return;
    try {const result = await apis.getNewsPreview({generationId: current.generationId}); if (!disposed) show(result);}
    catch (error) {if (!disposed) {activeProgress.connectionLost(); message(error.message || "Could not check preparation. Check again to resume monitoring.", true); retry.hidden = false; retry.textContent = "Check preparation"; setBusy(false);}}
  }
  async function start(event) {
    event.preventDefault(); if (disposed || busy || pendingLanguage || !loaded || !configState.loaded || configState.busy || configState.dirty || !form.reportValidity()) return;
    if (!pending) pending = {newsType: type.value, country: type.value === "local" ? country.value : null, level: level.value,
      standard: Number(grade.value), language: language.value, storyId: story.value || null, clientRequestId: crypto.randomUUID()};
    clearTimeout(timer); current = null; displayed = null; vocabulary.clear(); questions.clear(); languageProgress.reset(); activeProgress = progress; progress.start(); page = 0; article.hidden = true; retry.hidden = true; setBusy(true); message("Starting news preparation...");
    try {const result = await apis.generateNewsPreview(pending); if (disposed) return; pending = null; show(result);}
    catch (error) {if (!disposed) {activeProgress.connectionLost(); message(error.message || "Could not start preparation. Retry the same request.", true); setBusy(false);}}
  }
  async function prepareLanguage() {
    clearTimeout(timer); activeProgress.resume(); setBusy(true); retry.hidden = true; message("Preparing the " + pendingLanguage.language + " version of this story...");
    try {
      const result = await apis.requestNewsPreviewLanguage(pendingLanguage);
      if (disposed) return;
      pendingLanguage = null; show(result);
    } catch (error) {
      if (!disposed) {activeProgress.connectionLost(); articleLanguages(); message(error.message || "Could not switch languages. Retry the same request.", true); retry.hidden = false; retry.textContent = "Retry language switch"; setBusy(false);}
    }
  }
  async function switchLanguage() {
    if (disposed || busy || pendingLanguage || !displayed || !articleLanguage.value) return;
    if (articleLanguage.value === displayed.article.language) {show(displayed); return;}
    pendingLanguage = {generationId: displayed.generationId, language: articleLanguage.value};
    progress.reset(); activeProgress = languageProgress; languageProgress.start({language: pendingLanguage.language});
    await prepareLanguage();
  }
  async function retryPreparation() {
    if (!disposed && !busy && pendingLanguage) {await prepareLanguage(); return;}
    if (disposed || busy || !current) return;
    activeProgress.resume(); setBusy(true); retry.hidden = true;
    try {const result = current.status === "failed" ? await apis.retryNewsPreview({generationId: current.generationId}) : await apis.getNewsPreview({generationId: current.generationId}); if (!disposed) show(result);}
    catch (error) {if (!disposed) {activeProgress.connectionLost(); message(error.message, true); retry.hidden = false; setBusy(false);}}
  }
  async function publish() {
    if (disposed || busy || pendingLanguage || !current || current.status !== "completed" || current.pooled) return;
    setBusy(true); message("Adding article to the pool...");
    try {await apis.addNewsPreviewToPool({generationId: current.generationId}); if (!disposed) {current.pooled = true; message("Article added to the shared pool."); await loadStories();}}
    catch (error) {if (!disposed) message(error.message || "Could not add to the pool. Retry this action.", true);}
    finally {if (!disposed) setBusy(false);}
  }
  listen(form, "submit", start); listen(type, "change", () => {controls(); loadStories();}); listen(country, "change", loadStories); listen(articleLanguage, "change", switchLanguage);
  listen(byId("news-preview-options"), "click", loadOptions); listen(retry, "click", retryPreparation); listen(add, "click", publish);
  listen(previous, "click", () => {if (page > 0) {page--; renderPage();}}); listen(next, "click", () => {if (page < displayed.article.pages.length - 1) {page++; renderPage();}});
  controls();
  return {ready: loadOptions(), setConfigurationState(value) {const wasDirty = configState.dirty; configState = value; controls();
    if (value.dirty) vocabularyConfigDirty = true;
    if (vocabularyConfigDirty && !value.dirty && !busy && !value.busy) {vocabularyConfigDirty = false; if (displayed) vocabulary.refresh();}
    if (value.dirty && !busy && !value.busy) message("Save configuration changes before generating a preview.");
    else if (wasDirty && !value.dirty && !busy && !value.busy) message("Settings saved. The next preview will use them.");},
    setLanguages(values) {if (Array.isArray(values)) {languages = values; options(language, values); articleLanguages(); controls();}},
    dispose() {disposed = true; clearTimeout(timer); progress.dispose(); languageProgress.dispose(); vocabulary.dispose(); questions.dispose(); listeners.forEach(remove => remove()); controls();}};
}
