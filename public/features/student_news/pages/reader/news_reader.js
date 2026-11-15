import * as news from "../../student_news_module.js?v=20261115-news-student-v1";
import {onStudentAuthStateChanged} from "../../../student/student_module.js?v=20261110-student-profile-v1";
import {mountNewsVocabulary} from "../common/news_vocabulary.js?v=20261115-news-lookup-progress-v1";
import {mountNewsQuestions} from "../common/news_questions.js?v=20261115-news-student-v1";
import {isTransientNewsError, newsFetchErrorMessage} from "../../domain/news_transport.js?v=20261115-news-recovery-v1";
import {mountNewsProgress} from "../../components/news_progress.js?v=20261115-news-lookup-progress-v1";

export function mountStudentNewsReader({root = document, apis = news, location = window.location, history = window.history, pollMs = 2500, retryDelayMs = 1000} = {}) {
  const el = id => root.getElementById(id), form = el("news-reader-language-form"), select = el("news-reader-language"), status = el("news-reader-status"), retry = el("news-reader-retry"), articleHost = el("news-reader-article"), open = el("news-reader-open");
  const params = new URLSearchParams(location.search); let assignmentId = params.get("assignmentId"), newsType = params.get("newsType") || "international", uid = null,
    revision = 0, operation = 0, disposed = false, timer, overview, displayed, page = 0, preparing = false, questionBusy = false, pending = null, lastResult = null, fetchRetries = 0;
  const progress = mountNewsProgress({root, host: el("news-reader-progress")});
  const languageProgress = mountNewsProgress({root, host: el("news-reader-language-progress"), kind: "language"});
  let activeProgress = progress;
  const vocabulary = mountNewsVocabulary({root, host: el("news-reader-vocabulary"), apis, pollMs, onReady: () => {if (displayed) renderPage();}});
  const questions = mountNewsQuestions({root, host: el("news-reader-questions"), apis, pollMs,
    onBusyChange: value => {questionBusy = value; controls();}, onResult: result => {
      if (result.completion) {lastResult = {...lastResult, completed: true, rewards: result.completion.rewards}; showRewards(result.completion.rewards); status.textContent = "Completed. Your answers and rewards are saved.";}
    }});
  function controls() {select.disabled = preparing || questionBusy || !!pending && !assignmentId; open.disabled = preparing || questionBusy || !select.value; retry.disabled = preparing || questionBusy;}
  function showRewards(earned) {
    const settings = lastResult?.rewardSettings || overview?.rewardSettings;
    el("news-reader-rewards").textContent = earned ? "Completed · " + earned.totalCoins + " coins earned (completion: " + earned.completionCoins + ", all correct: " + earned.allCorrectCoins + ")."
      : settings ? "Finish the article and submit all three answers to earn " + settings.completionCoins + " coins. Get all three correct for " + settings.allCorrectCoins + " additional coins." : "Submit all three answers to complete this article.";
  }
  function link(label, url) {const a = root.createElement("a"); a.textContent = label; try {if (new URL(url).protocol === "https:") a.href = url;} catch {} a.target = "_blank"; a.rel = "noopener noreferrer"; return a;}
  function renderPage() {
    const content = displayed.pages[page], host = el("news-reader-page"); host.replaceChildren();
    if (content.text) {const p = root.createElement("p"); vocabulary.renderText(p, content); host.append(p);}
    for (const image of content.images) {
      const figure = root.createElement("figure"), img = root.createElement("img"), caption = root.createElement("figcaption"); img.src = image.url; img.alt = image.altText; img.referrerPolicy = "no-referrer";
      if (image.sourceType === "ai") caption.textContent = "AI-generated illustration";
      else {caption.append(root.createTextNode("Representative photo · " + image.credit + " · "), link(image.license || "Photo source", image.licenseUrl || image.sourceUrl)); if (image.sourceUrl) caption.append(root.createTextNode(" · "), link("Photo source", image.sourceUrl));}
      figure.append(img, caption); host.append(figure);
    }
    el("news-reader-position").textContent = "Page " + (page + 1) + " of " + displayed.pages.length;
    el("news-reader-previous").disabled = page === 0; el("news-reader-next").disabled = page === displayed.pages.length - 1; el("news-reader-nav").hidden = displayed.pages.length === 1;
  }
  function options(languages, selected = "") {
    select.replaceChildren(); for (const language of ["", ...new Set([...languages, ...(selected ? [selected] : [])])]) {
      const option = root.createElement("option"); option.value = language; option.textContent = language || "Choose a language"; select.append(option);
    }
    select.value = selected; controls();
  }
  function remember(language) {
    const next = new URLSearchParams({newsType, assignmentId, language}); history.replaceState(null, "", location.pathname + "?" + next);
  }
  function show(result, language) {
    lastResult = result; assignmentId = result.assignmentId || assignmentId; if (assignmentId) remember(language);
    activeProgress.update(result);
    if (result.status === "ready") {
      preparing = false; pending = null; displayed = result.article; articleHost.hidden = false; page = Math.min(page, displayed.pages.length - 1);
      el("news-reader-heading").textContent = displayed.newsType === "local" ? "Local News — " + displayed.country : "International News";
      select.value = displayed.language; open.textContent = "Read in this language";
      el("news-reader-title").textContent = displayed.title; el("news-reader-meta").textContent = displayed.language + " · " + displayed.actualWordCount + " words · Published " + new Date(displayed.publishedAt).toLocaleDateString();
      const sources = el("news-reader-sources"); sources.replaceChildren(); for (const source of displayed.sources) {const p = root.createElement("p"); p.append(link(source.publisher + ": " + source.title, source.url)); sources.append(p);}
      vocabulary.setArticle({assignmentId, articleLanguage: displayed.language}, displayed); questions.setArticle({assignmentId, articleLanguage: displayed.language}, displayed);
      renderPage(); showRewards(result.rewards); status.textContent = result.completed ? "Completed. You can reread the article and review your answers." : "Read the article, then submit all three answers."; retry.hidden = true; controls(); return;
    }
    if (result.status === "failed") {preparing = false; status.textContent = result.errorMessage || "Article preparation failed. Retry to resume."; retry.hidden = false; controls(); return;}
    status.textContent = "Your article is being prepared. You can return later to continue."; controls(); timer = setTimeout(() => load(language), pollMs);
  }
  async function load(language, retryFailed = false) {
    if (!uid || disposed) return;
    if (questionBusy) {clearTimeout(timer); timer = setTimeout(() => load(language, retryFailed), pollMs); return;}
    const token = revision, sequence = ++operation; clearTimeout(timer); preparing = true; retry.hidden = true;
    activeProgress.resume();
    if (!lastResult || ["ready", "failed"].includes(lastResult.status)) status.textContent = "Fetching your article...";
    controls();
    try {
      let result;
      if (assignmentId) result = await (retryFailed ? apis.retryStudentNews : apis.getStudentNewsAssignment)({assignmentId, language});
      else {
        pending ||= {newsType, language, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, clientRequestId: crypto.randomUUID()};
        result = await apis.requestStudentNews(pending);
      }
      if (!disposed && token === revision && sequence === operation) {fetchRetries = 0; show(result, language);}
    } catch (error) {
      if (!disposed && token === revision && sequence === operation) {
        if (isTransientNewsError(error) && fetchRetries < 3) {
          const delay = retryDelayMs * 2 ** fetchRetries++;
          status.textContent = "Connection interrupted. Checking your saved article again...";
          activeProgress.connectionLost(true);
          // Check the existing assignment after an uncertain retry response.
          // Never repeatedly restart its generator because transport failed.
          timer = setTimeout(() => load(language), delay); controls();
        } else {preparing = false; status.textContent = newsFetchErrorMessage(error); activeProgress.connectionLost(); retry.hidden = false; controls();}
      }
    }
  }
  async function start({studentId}) {
    if (uid === studentId) return; stop(); uid = studentId; const token = revision; status.textContent = "Loading news options...";
    try {
      if (!["international", "local"].includes(newsType)) throw Error("Choose international or local news from your dashboard.");
      overview = await apis.getStudentNewsOverview(); if (token !== revision || disposed) return;
      el("news-reader-heading").textContent = newsType === "international" ? "International News" : "Local News — " + overview.country;
      const selected = params.get("language") || ""; options(overview.languages, assignmentId ? selected : ""); form.hidden = false;
      if (assignmentId && selected) await load(selected);
      else status.textContent = overview.languages.length ? "Choose the language you want to read in." : "News languages are not available yet.";
    } catch (error) {if (token === revision) {status.textContent = newsFetchErrorMessage(error); retry.hidden = false;}}
  }
  function stop() {revision++; operation++; uid = null; clearTimeout(timer); preparing = false; fetchRetries = 0; pending = null; displayed = null; lastResult = null; overview = null; articleHost.hidden = true; form.hidden = true; retry.hidden = true; progress.reset(); languageProgress.reset(); activeProgress = progress; el("news-reader-page").replaceChildren(); el("news-reader-title").textContent = ""; vocabulary.clear(); questions.clear();}
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (preparing || questionBusy || !select.value) return;
    page = 0; fetchRetries = 0; progress.reset(); languageProgress.reset();
    activeProgress = displayed && select.value !== displayed.language ? languageProgress : progress;
    activeProgress.start({language: select.value}); load(select.value);
  });
  select.addEventListener("change", controls);
  retry.addEventListener("click", () => {fetchRetries = 0; if (!overview) {const studentId = uid; uid = null; start({studentId});} else load(pending?.language || select.value, true);});
  el("news-reader-previous").addEventListener("click", () => {if (page > 0) {page--; renderPage();}});
  el("news-reader-next").addEventListener("click", () => {if (displayed && page < displayed.pages.length - 1) {page++; renderPage();}});
  return {start, stop, dispose() {disposed = true; stop(); progress.dispose(); languageProgress.dispose(); vocabulary.dispose(); questions.dispose();}};
}
if (typeof document !== "undefined" && document.getElementById("news-reader-article")) {
  const reader = mountStudentNewsReader();
  onStudentAuthStateChanged(user => {if (user) reader.start({studentId: user.uid}); else {reader.stop(); window.location.replace("/index.html");}});
  window.addEventListener("beforeunload", () => reader.dispose());
  window.addEventListener("pageshow", event => {if (event.persisted) window.location.reload();});
}
