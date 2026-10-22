import assert from "node:assert/strict";
import {test} from "node:test";
import {mountHandwritingCanvas} from "./handwriting_canvas.js";
class Element {
  constructor() {this.listeners = new Map(); this.disabled = false;}
  addEventListener(type, fn) {this.listeners.set(type, fn);}
  removeEventListener(type) {this.listeners.delete(type);}
  setAttribute(key, value) {this[key] = value;}
  fire(type, event = {}) {this.listeners.get(type)?.({preventDefault() {}, ...event});}
}
function harness(options = {}) {
  const canvas = new Element(), undo = new Element(), clear = new Element(), paints = [], changes = [], captures = new Set(), images = [];
  const context = Object.fromEntries(["beginPath", "arc", "fill", "moveTo", "lineTo", "stroke", "fillRect"].map(name => [name, (...args) => paints.push({name, args, fillStyle: context.fillStyle})]));
  Object.assign(canvas, {width: 1200, height: 1600, getContext: () => context,
    getBoundingClientRect: () => ({left: 10, top: 20, width: 300, height: 400}), setPointerCapture: id => captures.add(id), hasPointerCapture: id => captures.has(id), releasePointerCapture: id => captures.delete(id),
    ownerDocument: {createElement: () => {
      const image = {paints: [], getContext: () => ({set fillStyle(value) {image.fillStyle = value;},
        fillRect: (...args) => image.paints.push({name: "fillRect", args}), drawImage: (...args) => image.paints.push({name: "drawImage", args})}),
        toBlob: (callback, type) => callback(options.failExport ? null : new Blob(["canvas png"], {type}))};
      images.push(image); return image;
    }}});
  const drawing = mountHandwritingCanvas({canvas, undoButton: undo, clearButton: clear, onChange: value => changes.push(value)});
  const pointer = (type, more = {}) => canvas.fire(type, {pointerId: 1, pointerType: "mouse", button: 0, clientX: 40, clientY: 60, ...more});
  return {canvas, undo, clear, paints, changes, drawing, pointer, captures, images};
}
test("canvas starts as white paper and blank exports are rejected", async () => {
  const h = harness(); assert.equal(h.drawing.hasInk(), false); assert.equal(h.undo.disabled, true); assert.equal(h.clear.disabled, true);
  assert.deepEqual(h.paints[0], {name: "fillRect", args: [0, 0, 1200, 1600], fillStyle: "#ffffff"});
  await assert.rejects(() => h.drawing.toBlob(), /Write something/);
});
test("mouse, touch and pen strokes use canvas coordinates and export PNG", async () => {
  for (const pointerType of ["mouse", "touch", "pen"]) {
    const h = harness(); h.pointer("pointerdown", {pointerType}); assert.equal(h.drawing.isDrawing(), true); assert.equal(h.undo.disabled, true);
    h.pointer("pointermove", {pointerType, clientX: 70, clientY: 100}); h.pointer("pointerup", {pointerType, clientX: 70, clientY: 100});
    assert.equal(h.drawing.hasInk(), true); assert.equal(h.drawing.isDrawing(), false); assert.equal(h.captures.size, 0);
    assert.ok(h.paints.some(p => p.name === "arc" && p.args[0] === 120 && p.args[1] === 160));
    assert.ok(h.paints.some(p => p.name === "lineTo" && p.args[0] === 240 && p.args[1] === 320));
    assert.equal((await h.drawing.toBlob()).type, "image/png"); assert.equal(h.undo.disabled, false);
  }
});
test("undo removes one complete stroke, clear removes all, and right-click does not draw", () => {
  const h = harness(); h.pointer("pointerdown", {button: 2}); assert.equal(h.drawing.hasInk(), false);
  h.pointer("pointerdown"); h.pointer("pointerup"); h.pointer("pointerdown"); h.pointer("pointerup");
  h.undo.fire("click"); assert.equal(h.drawing.hasInk(), true); h.undo.fire("click"); assert.equal(h.drawing.hasInk(), false);
  h.pointer("pointerdown"); h.pointer("pointerup"); h.clear.fire("click"); assert.equal(h.drawing.hasInk(), false); assert.equal(h.changes.at(-1), false);
});
test("pointer cancellation, capture loss and disabling cancel only the unfinished stroke", () => {
  for (const action of ["pointercancel", "lostpointercapture", "disable"]) {
    const h = harness(); h.pointer("pointerdown"); h.pointer("pointerup"); h.pointer("pointerdown");
    if (action === "disable") h.drawing.setEnabled(false); else h.pointer(action);
    assert.equal(h.drawing.hasInk(), true); assert.equal(h.drawing.isDrawing(), false); h.drawing.setEnabled(true);
    h.undo.fire("click"); assert.equal(h.drawing.hasInk(), false);
  }
});
test("secondary pointers cannot change an active stroke and disposed canvases release data/listeners", async () => {
  const h = harness(); h.pointer("pointerdown"); h.pointer("pointermove", {pointerId: 2}); h.pointer("pointerup", {pointerId: 2}); assert.equal(h.drawing.isDrawing(), true);
  h.drawing.dispose(); assert.equal(h.captures.size, 0); assert.equal(h.canvas.listeners.size, 0); assert.equal(h.clear.listeners.size, 0); assert.equal(h.drawing.hasInk(), false);
  await assert.rejects(() => h.drawing.toBlob(), /Write something/);
});
test("PNG exports crop surrounding whitespace with a white margin and leave the canvas intact", async () => {
  const h = harness(); h.pointer("pointerdown"); h.pointer("pointermove", {clientX: 70, clientY: 100}); h.pointer("pointerup", {clientX: 70, clientY: 100});
  const paintCount = h.paints.length;
  await h.drawing.toBlob();
  const image = h.images[0]; assert.equal(image.fillStyle, "#ffffff");
  assert.ok(image.width < h.canvas.width); assert.ok(image.height < h.canvas.height);
  const copy = image.paints.find(p => p.name === "drawImage").args;
  assert.equal(copy[0], h.canvas); assert.ok(copy[1] < 120 && copy[2] < 160); // Keep round caps.
  assert.ok(copy[1] + copy[3] > 240 && copy[2] + copy[4] > 320);
  assert.equal(copy[3], copy[7]); assert.equal(copy[4], copy[8]); // Never rescale the handwriting.
  assert.ok(copy[5] > 0 && copy[6] > 0); assert.equal(image.width, copy[3] + 2 * copy[5]); assert.equal(image.height, copy[4] + 2 * copy[6]);
  assert.equal(h.paints.length, paintCount); assert.equal(h.drawing.hasInk(), true);
  h.undo.fire("click"); assert.equal(h.drawing.hasInk(), false);
});
test("changing pen thickness affects new strokes while undo preserves the original thickness", () => {
  const h = harness(); h.drawing.setPenWidth(2); h.pointer("pointerdown"); h.pointer("pointerup");
  assert.equal(h.paints.filter(p => p.name === "arc").at(-1).args[2], 4);
  h.drawing.setPenWidth(5); h.pointer("pointerdown"); h.pointer("pointerup");
  assert.equal(h.paints.filter(p => p.name === "arc").at(-1).args[2], 10);
  h.undo.fire("click"); assert.equal(h.paints.filter(p => p.name === "arc").at(-1).args[2], 4);
  for (const value of [0, -1, 7, NaN, Infinity, "3"]) assert.throws(() => h.drawing.setPenWidth(value), /Pen thickness/);
});
test("unfinished strokes and failed PNG encodes cannot produce a successful export", async () => {
  const h = harness({failExport: true}); h.pointer("pointerdown");
  await assert.rejects(() => h.drawing.toBlob(), /Write something/); assert.equal(h.images.length, 0);
  h.pointer("pointerup"); await assert.rejects(() => h.drawing.toBlob(), /Could not convert/);
});
