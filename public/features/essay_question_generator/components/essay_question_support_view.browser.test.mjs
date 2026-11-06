import assert from "node:assert/strict";
import {test} from "node:test";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("../../../../functions/node_modules/puppeteer");

test("mobile browser renders, enlarges and safely falls back from essay pictures", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/") {res.setHeader("Content-Type", "text/html"); res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="support"></div>'); return;}
    if (path === "/image.png") {res.setHeader("Content-Type", "image/png"); res.end(png); return;}
    if (path !== "/features/essay_question_generator/components/essay_question_support_view.js") {res.writeHead(404);res.end(); return;}
    res.setHeader("Content-Type", "text/javascript"); res.end(await readFile(new URL("./essay_question_support_view.js", import.meta.url)));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await puppeteer.launch({executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"]});
    const page = await browser.newPage(); await page.setViewport({width: 390, height: 844}); await page.goto(origin);
    const result = await page.evaluate(async origin => {
      const {renderEssayQuestionSupport} = await import(origin + "/features/essay_question_generator/components/essay_question_support_view.js");
      const container = document.getElementById("support");
      const question = {support: {pictureStatus: "ready", picture: {url: origin + "/image.png", description: "Children clean a park."}, helpingWordsStatus: "ready", helpingWords: ["பூங்கா", "helping friends", "<img src=x onerror=alert(1)>"]}};
      await new Promise(resolve => renderEssayQuestionSupport({container, question, onReady: resolve}));
      const image = container.querySelector("img"), anchor = container.querySelector("a");
      const good = {loaded: image.naturalWidth > 0, withinScreen: image.getBoundingClientRect().right <= innerWidth,
        alt: image.alt, target: anchor.target, suggestions: [...container.querySelectorAll("li")].map(item => item.textContent), imageCount: container.querySelectorAll("img").length};
      delete container.dataset.supportKey;
      const failedQuestion = structuredClone(question); failedQuestion.support.picture.url = origin + "/missing.png";
      await new Promise(resolve => renderEssayQuestionSupport({container, question: failedQuestion, onReady: resolve}));
      const fallbackVisible = container.querySelector("details").open;
      const imageHidden = container.querySelector("a").hidden;
      const fallbackText = container.querySelector("details").textContent;
      delete container.dataset.supportKey;
      const simpleQuestion = structuredClone(question);
      delete simpleQuestion.support.picture.description;
      simpleQuestion.questionText = "Write about friends cleaning a park.";
      await new Promise(resolve => renderEssayQuestionSupport({container, question: simpleQuestion, onReady: resolve}));
      const simple = {alt: container.querySelector("img").alt, descriptions: container.querySelectorAll("details").length};
      return {good, simple, fallbackVisible, imageHidden, fallbackText};
    }, origin);
    assert.equal(result.good.loaded, true); assert.equal(result.good.withinScreen, true); assert.equal(result.good.target, "_blank");
    assert.equal(result.good.imageCount, 1); assert.equal(result.good.suggestions.length, 3); assert.match(result.good.suggestions[2], /<img/);
    assert.equal(result.simple.alt, "Write about friends cleaning a park."); assert.equal(result.simple.descriptions, 0);
    assert.equal(result.fallbackVisible, true); assert.equal(result.imageHidden, true); assert.match(result.fallbackText, /Children clean a park/);
  } finally {await browser?.close(); await new Promise(resolve => server.close(resolve));}
});
