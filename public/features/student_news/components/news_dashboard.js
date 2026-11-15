import * as news from "../student_news_module.js?v=20261115-news-student-v1";
const READER = "/features/student_news/pages/reader/news_reader.html";
export function mountStudentNewsDashboard({host, root = document, apis = news, pollMs = 5000} = {}) {
  const heading = root.createElement("h2"), help = root.createElement("p"), status = root.createElement("p"), refresh = root.createElement("button"), cards = root.createElement("div"),
    history = root.createElement("details"), summary = root.createElement("summary"), historyStatus = root.createElement("p"), historyList = root.createElement("ul"), more = root.createElement("button");
  heading.textContent = "Today’s News"; help.textContent = "Read one international article and one local article each day."; status.setAttribute("role", "status");
  refresh.type = "button"; refresh.className = "secondary"; refresh.textContent = "Refresh news"; cards.className = "news-daily-cards";
  summary.textContent = "Reading history"; historyStatus.setAttribute("role", "status"); more.type = "button"; more.textContent = "Load more articles"; more.hidden = true;
  history.append(summary, historyStatus, historyList, more); history.className = "news-reading-history"; host.append(heading, help, status, cards, refresh, history); host.hidden = true;
  let uid = null, generation = 0, request = 0, timer, midnight, country = "", historyLoaded = false, historyBusy = false, cursor = null;
  function readerLink(item, type) {
    const params = new URLSearchParams({newsType: type});
    if (item?.assignmentId) {params.set("assignmentId", item.assignmentId); if (item.readingLanguage) params.set("language", item.readingLanguage);}
    return READER + "?" + params;
  }
  function render(result) {
    cards.replaceChildren();
    for (const type of ["international", "local"]) {
      const item = result.slots[type], card = root.createElement("article"), title = root.createElement("h3"), state = root.createElement("p"), description = root.createElement("p"), link = root.createElement("a"), reward = root.createElement("p");
      card.className = "news-daily-card"; card.dataset.newsType = type; title.textContent = type === "international" ? "International News" : "Local News — " + (item?.country || result.country || country);
      const labels = {preparing: "Preparing", ready: "Continue reading", failed: "Preparation needs a retry", completed: "Completed"};
      state.className = "news-card-state"; state.textContent = item ? labels[item.status] || "Continue reading" : "Ready to read";
      description.textContent = item?.title || (type === "international" ? "Discover a story from around the world." : "Discover a story from your country.");
      link.href = readerLink(item, type); link.className = "news-action"; link.textContent = item?.status === "completed" ? "View article" : item ? "Continue reading" : "Read";
      const settings = item?.rewardSettings || result.rewardSettings;
      reward.className = "help-text"; reward.textContent = item?.rewards ? item.rewards.totalCoins + " coins earned" : settings ? "Completion: " + settings.completionCoins + " coins · All correct: +" + settings.allCorrectCoins : "";
      if (item?.score !== null && item?.score !== undefined) reward.textContent = "Score: " + item.score + "/3 · " + reward.textContent;
      card.append(title, state, description, reward, link); cards.append(card);
    }
  }
  async function load() {
    if (!uid) return; const version = generation, sequence = ++request; clearTimeout(timer); clearTimeout(midnight); refresh.disabled = true;
    try {
      const result = await apis.getStudentNewsOverview(); if (version !== generation || sequence !== request) return;
      render(result); status.textContent = result.languages.length ? "" : "News languages are not available yet.";
      if (Object.values(result.slots).some(item => item?.status === "preparing")) timer = setTimeout(load, pollMs);
      if (result.windowEndAt) midnight = setTimeout(load, Math.max(1000, Math.min(2147483647, new Date(result.windowEndAt).getTime() - Date.now() + 250)));
    } catch (error) {if (version === generation && sequence === request) status.textContent = error.message || "Could not load news. Refresh to try again.";}
    finally {if (version === generation && sequence === request) refresh.disabled = false;}
  }
  async function loadHistory(reset = false) {
    if (!uid || historyBusy) return; const version = generation; historyBusy = true; more.disabled = true; historyStatus.textContent = "Loading reading history...";
    if (reset) {cursor = null; historyList.replaceChildren();}
    try {
      const result = await apis.listStudentNewsHistory({limit: 10, ...(cursor ? {cursor} : {})}); if (version !== generation) return;
      for (const item of result.items) {
        const li = root.createElement("li"), link = root.createElement(item.canOpen === false ? "span" : "a"), detail = root.createElement("span");
        if (item.canOpen !== false) link.href = readerLink(item, item.newsType); link.textContent = item.title || (item.newsType === "local" ? "Local news" : "International news");
        detail.textContent = " · " + item.localDate + " · " + (item.canOpen === false ? "Preparation expired" : item.status === "completed" ? "Completed" : "Continue reading");
        li.append(link, detail); historyList.append(li);
      }
      cursor = result.nextCursor; historyLoaded = true; more.hidden = !cursor; more.textContent = "Load more articles"; historyStatus.textContent = historyList.children.length ? "" : "Your articles will appear here after you start reading.";
    } catch (error) {if (version === generation) {historyStatus.textContent = error.message || "Could not load reading history."; more.hidden = false; more.textContent = "Retry loading history";}}
    finally {if (version === generation) {historyBusy = false; more.disabled = false;}}
  }
  const toggle = () => {if (history.open && !historyLoaded) loadHistory();};
  const reload = () => {load(); if (history.open) loadHistory(true);};
  const visible = () => {if (!root.hidden && uid) load();};
  refresh.addEventListener("click", reload); more.addEventListener("click", () => loadHistory()); history.addEventListener("toggle", toggle);
  root.addEventListener("visibilitychange", visible);
  function stop() {generation++; request++; uid = null; clearTimeout(timer); clearTimeout(midnight); host.hidden = true; cards.replaceChildren(); historyList.replaceChildren(); history.open = false; historyLoaded = false; historyBusy = false; cursor = null; more.hidden = true;}
  return {start({studentId, country: selectedCountry}) {if (uid !== studentId) stop(); uid = studentId; country = selectedCountry; host.hidden = false; status.textContent = "Loading news..."; return load();}, refresh: load, stop,
    dispose() {stop(); root.removeEventListener("visibilitychange", visible); host.replaceChildren();}};
}
