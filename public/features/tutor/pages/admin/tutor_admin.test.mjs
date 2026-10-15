import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {mountTutorAdmin} from "./tutor_admin.js";

class Element {
  constructor(tagName = "div") {
    this.tagName = tagName;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.classes = new Set();
    this.classList = {toggle: (name, active) => active ? this.classes.add(name) : this.classes.delete(name)};
    this.value = "";
    this.textContent = "";
    this.disabled = false;
    this.hidden = false;
  }
  get valueAsNumber() {return this.value.trim() ? Number(this.value) : NaN;}
  append(...elements) {this.children.push(...elements);}
  replaceChildren(...elements) {this.children = elements;}
  setAttribute(name, value) {this.attributes.set(name, value);}
  setCustomValidity(message) {this.validationMessage = message;}
  reportValidity() {this.reportedValidity = true;}
  focus() {this.focused = true;}
  addEventListener(name, listener) {this.listeners.set(name, listener);}
  async submit() {return this.listeners.get("submit")?.({preventDefault() {}});}
  async click() {if (!this.disabled) return this.listeners.get("click")?.();}
  async edit(value) {
    assert.equal(this.disabled, false, "Disabled controls cannot be edited.");
    this.value = String(value);
    return this.listeners.get("input")?.();
  }
}
const flatten = element => [element, ...element.children.flatMap(flatten)];
const savedConfig = (input = {
  miniQuestionCount: 6, promptInstructions: "Ask one reasoning step at a time.",
  correctAnswerMessage: {English: "Correct!", Malay: "Bagus!"},
  incorrectAnswerMessage: {English: "Try again.", Malay: "Cuba lagi."},
}) => ({...input, updatedAt: new Date("2026-10-14T00:00:00Z"), updatedBy: "admin-1"});

function harness({getConfig = async () => null, listLanguages = async () => ["English", "Malay"], saveConfig} = {}) {
  const ids = [
    "tutor-form", "tutor-status", "tutor-updated-at", "mini-question-count", "mini-question-count-error",
    "prompt-instructions", "tutor-language-fields", "tutor-language-status",
    "save-tutor-config", "retry-tutor-load", "reload-tutor-languages",
  ];
  const elements = new Map(ids.map(id => [id, new Element()]));
  const root = {
    getElementById: id => elements.get(id),
    createElement: tag => new Element(tag),
  };
  const saves = [];
  const page = mountTutorAdmin({root, getConfig, listLanguages, saveConfig: async input => {
    saves.push(structuredClone(input));
    return saveConfig ? saveConfig(input) : savedConfig(input);
  }});
  const get = id => elements.get(id) || flatten(elements.get("tutor-language-fields")).find(element => element.id === id);
  const fields = () => flatten(get("tutor-language-fields")).filter(element => element.tagName === "textarea");
  const message = (language, key) => fields().find(element => element.name === key + "." + language);
  const completeMessages = async () => {
    for (const field of fields()) await field.edit("Feedback for " + field.name);
  };
  return {page, saves, get, fields, message, completeMessages};
}

test("loads the Syllabus Scope languages and renders two blank feedback fields per language", async () => {
  let languageCalls = 0;
  const h = harness({listLanguages: async () => {languageCalls++; return ["English", "Malay", "中文"];}});
  assert.equal(h.get("save-tutor-config").disabled, true);
  assert.equal(h.get("mini-question-count").disabled, true);
  await h.page.ready;
  assert.equal(languageCalls, 1);
  assert.equal(h.get("mini-question-count").valueAsNumber, 3);
  assert.equal(h.get("prompt-instructions").value, "");
  assert.equal(h.fields().length, 6);
  assert.equal(h.get("tutor-updated-at").textContent, "Never saved");
  for (const language of ["English", "Malay", "中文"]) {
    for (const key of ["correctAnswerMessage", "incorrectAnswerMessage"]) {
      const field = h.message(language, key);
      assert.equal(field.value, "");
      assert.equal(field.disabled, false);
      assert.equal(field.required, true);
      assert.equal(field.dir, "auto");
    }
  }
  assert.deepEqual(h.saves, []);
});

test("loads saved values and saves all configuration fields through the Tutor API", async () => {
  const h = harness({getConfig: async () => savedConfig()});
  await h.page.ready;
  assert.equal(h.get("mini-question-count").valueAsNumber, 6);
  assert.equal(h.message("English", "correctAnswerMessage").value, "Correct!");
  assert.equal(h.message("Malay", "incorrectAnswerMessage").value, "Cuba lagi.");
  assert.match(h.get("tutor-updated-at").textContent, /Last saved/);
  await h.get("mini-question-count").edit(3);
  await h.get("prompt-instructions").edit(" Guide the student carefully. ");
  await h.message("Malay", "incorrectAnswerMessage").edit("Cuba sekali lagi.");
  await h.get("tutor-form").submit();
  assert.deepEqual(h.saves, [{
    miniQuestionCount: 3, promptInstructions: "Guide the student carefully.",
    correctAnswerMessage: {English: "Correct!", Malay: "Bagus!"},
    incorrectAnswerMessage: {English: "Try again.", Malay: "Cuba sekali lagi."},
  }]);
  assert.equal(h.get("tutor-status").textContent, "Tutor configuration saved.");
});

test("rejects invalid counts and blank feedback before saving with field-level errors", async () => {
  const h = harness();
  await h.page.ready;
  await h.completeMessages();
  for (const value of ["", "0", "-1", "1.5", "Infinity", String(Number.MAX_SAFE_INTEGER + 1)]) {
    await h.get("mini-question-count").edit(value);
    await h.get("tutor-form").submit();
    assert.equal(h.get("mini-question-count-error").hidden, false);
    assert.equal(h.get("mini-question-count").attributes.get("aria-invalid"), "true");
  }
  await h.get("mini-question-count").edit(6);
  await h.message("English", "correctAnswerMessage").edit("  ");
  await h.get("tutor-form").submit();
  assert.equal(h.message("English", "correctAnswerMessage").focused, true);
  assert.match(h.message("English", "correctAnswerMessage").validationMessage, /feedback message in English/);
  assert.deepEqual(h.saves, []);
  await h.message("English", "correctAnswerMessage").edit("Well done.");
  assert.equal(h.message("English", "correctAnswerMessage").validationMessage, "");
  await h.get("tutor-form").submit();
  assert.equal(h.saves.length, 1);
});

test("configuration or language load failures prevent saving and support retry", async () => {
  for (const failConfig of [true, false]) {
    let attempt = 0;
    const h = harness({
      getConfig: async () => {
        if (failConfig && !attempt) throw new Error("Config unavailable");
        return savedConfig();
      },
      listLanguages: async () => {
        if (!failConfig && !attempt) throw new Error("Languages unavailable");
        return ["English", "Malay"];
      },
    });
    await h.page.ready;
    assert.equal(h.get("save-tutor-config").disabled, true);
    assert.equal(h.get("mini-question-count").disabled, true);
    assert.equal(h.get("retry-tutor-load").hidden, false);
    assert.match(h.get("tutor-status").textContent, /unavailable/);
    await h.get("tutor-form").submit();
    assert.deepEqual(h.saves, []);
    attempt++;
    await h.get("retry-tutor-load").click();
    assert.equal(h.get("retry-tutor-load").hidden, true);
    assert.equal(h.get("save-tutor-config").disabled, false);
    assert.equal(h.get("mini-question-count").valueAsNumber, 6);
  }
});

test("initial loading waits for both the configuration and language list", async () => {
  let resolveLanguages;
  const h = harness({getConfig: async () => savedConfig(), listLanguages: () => new Promise(resolve => {resolveLanguages = resolve;})});
  await Promise.resolve();
  assert.equal(h.get("save-tutor-config").disabled, true);
  await h.get("tutor-form").submit();
  assert.deepEqual(h.saves, []);
  resolveLanguages(["English", "Malay"]);
  await h.page.ready;
  assert.equal(h.get("save-tutor-config").disabled, false);
});

test("an empty language list prevents invalid saves and can be refreshed after adding languages", async () => {
  let available = [];
  const h = harness({listLanguages: async () => available});
  await h.page.ready;
  assert.equal(h.fields().length, 0);
  assert.equal(h.get("save-tutor-config").disabled, true);
  assert.match(h.get("tutor-language-status").textContent, /Add languages in Syllabus Scope/);
  available = ["English"];
  await h.get("reload-tutor-languages").click();
  assert.equal(h.fields().length, 2);
  assert.equal(h.get("save-tutor-config").disabled, false);
  assert.deepEqual(h.saves, []);
});

test("saved translations absent from current scopes remain editable and are preserved when saving", async () => {
  const config = savedConfig({
    miniQuestionCount: 3, promptInstructions: "",
    correctAnswerMessage: {English: "Good", French: "Bien"},
    incorrectAnswerMessage: {English: "Try again", French: "Essayez encore"},
  });
  const h = harness({getConfig: async () => config, listLanguages: async () => ["English"]});
  await h.page.ready;
  assert.equal(h.message("French", "correctAnswerMessage").value, "Bien");
  const notes = flatten(h.get("tutor-language-fields")).filter(element => element.className === "language-note");
  assert.equal(notes.length, 1);
  await h.get("tutor-form").submit();
  assert.equal(h.saves[0].correctAnswerMessage.French, "Bien");
  assert.equal(h.saves[0].incorrectAnswerMessage.French, "Essayez encore");
});

test("reloading languages preserves all draft edits, adds new language fields, and retains removed ones", async () => {
  let available = ["English", "Malay"];
  const h = harness({getConfig: async () => savedConfig(), listLanguages: async () => available});
  await h.page.ready;
  await h.get("mini-question-count").edit(9);
  await h.get("prompt-instructions").edit("Draft prompt");
  await h.message("English", "correctAnswerMessage").edit("Draft feedback");
  available = ["English", "中文"];
  await h.get("reload-tutor-languages").click();
  assert.equal(h.get("mini-question-count").valueAsNumber, 9);
  assert.equal(h.get("prompt-instructions").value, "Draft prompt");
  assert.equal(h.message("English", "correctAnswerMessage").value, "Draft feedback");
  assert.equal(h.message("Malay", "incorrectAnswerMessage").value, "Cuba lagi.");
  assert.equal(h.message("中文", "correctAnswerMessage").value, "");
  await h.get("tutor-form").submit();
  assert.deepEqual(h.saves, []);
});

test("failed language refreshes preserve draft values, block saves, and recover without losing edits", async () => {
  let fail = false;
  const h = harness({
    getConfig: async () => savedConfig(),
    listLanguages: async () => {if (fail) throw new Error("Scope unavailable"); return ["English", "Malay"];},
  });
  await h.page.ready;
  await h.message("English", "correctAnswerMessage").edit("Draft");
  fail = true;
  await h.get("reload-tutor-languages").click();
  assert.equal(h.message("English", "correctAnswerMessage").value, "Draft");
  assert.equal(h.get("save-tutor-config").disabled, true);
  await h.get("tutor-form").submit();
  assert.deepEqual(h.saves, []);
  assert.equal(h.get("tutor-status").textContent, "Scope unavailable");
  fail = false;
  await h.get("reload-tutor-languages").click();
  assert.equal(h.message("English", "correctAnswerMessage").value, "Draft");
  assert.equal(h.get("save-tutor-config").disabled, false);
});

test("failed saves preserve edits and pending saves disable controls and reject duplicate submissions", async () => {
  let attempts = 0;
  let resolveSave;
  const h = harness({getConfig: async () => savedConfig(), saveConfig: async input => {
    if (++attempts === 1) throw new Error("Save unavailable");
    return new Promise(resolve => {resolveSave = () => resolve(savedConfig(input));});
  }});
  await h.page.ready;
  await h.message("English", "correctAnswerMessage").edit("New feedback");
  await h.get("tutor-form").submit();
  assert.equal(h.message("English", "correctAnswerMessage").value, "New feedback");
  assert.equal(h.get("tutor-status").textContent, "Save unavailable");
  assert.equal(h.get("save-tutor-config").disabled, false);
  const pending = h.get("tutor-form").submit();
  assert.equal(h.get("save-tutor-config").disabled, true);
  assert.equal(h.get("reload-tutor-languages").disabled, true);
  assert.equal(h.message("English", "correctAnswerMessage").disabled, true);
  assert.equal(h.get("mini-question-count").disabled, true);
  await h.get("tutor-form").submit();
  assert.equal(h.saves.length, 2);
  resolveSave();
  await pending;
  assert.equal(h.get("save-tutor-config").disabled, false);
  assert.equal(h.message("English", "correctAnswerMessage").value, "New feedback");
});

test("language values are rendered as text rather than injected HTML", async () => {
  const language = '<img src=x onerror="alert(1)">';
  const h = harness({listLanguages: async () => [language]});
  await h.page.ready;
  const legend = flatten(h.get("tutor-language-fields")).find(element => element.tagName === "legend");
  assert.equal(legend.textContent, language);
  assert.equal(legend.children.length, 0);
  assert.equal(h.fields().length, 2);
});

test("the page uses the existing admin guard and is linked from Site Admin", async () => {
  const [html, siteAdmin, script] = await Promise.all([
    readFile(new URL("./tutor_admin.html", import.meta.url), "utf8"),
    readFile(new URL("../../../site_admin/pages/site_admin/site_admin.html", import.meta.url), "utf8"),
    readFile(new URL("./tutor_admin.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /document\.documentElement\.hidden = true/);
  assert.match(html, /data-site-admin-page/);
  assert.match(html, /data-page-module="\.\/tutor_admin\.js\?v=/);
  assert.match(html, /site_admin_page_loader\.js/);
  assert.match(siteAdmin, /href="\/features\/tutor\/pages\/admin\/tutor_admin\.html"/);
  assert.match(script, /listLanguages = listSyllabusScopeLanguages/);
});

