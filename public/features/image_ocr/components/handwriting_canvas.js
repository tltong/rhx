export function mountHandwritingCanvas({canvas, undoButton, clearButton, onChange = () => {}, penWidth = 3} = {}) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser does not support a drawing canvas.");
  function validatePenWidth(value) {
    if (!Number.isFinite(value) || value < 1 || value > 6) throw new Error("Pen thickness must be between 1 and 6 pixels.");
    return value;
  }
  let selectedPenWidth = validatePenWidth(penWidth);
  const strokes = [], listeners = [];
  let active = null, enabled = true, disposed = false;
  function listen(element, type, fn) {element.addEventListener(type, fn); listeners.push(() => element.removeEventListener(type, fn));}
  function controls() {
    undoButton.disabled = clearButton.disabled = disposed || !enabled || !strokes.length || !!active;
    canvas.setAttribute("aria-disabled", String(disposed || !enabled));
  }
  function paintStroke(stroke) {
    context.strokeStyle = context.fillStyle = "#172033";
    context.lineWidth = stroke.width; context.lineCap = context.lineJoin = "round";
    const first = stroke.points[0];
    context.beginPath(); context.arc(first.x, first.y, stroke.width / 2, 0, Math.PI * 2); context.fill();
    if (stroke.points.length < 2) return;
    context.beginPath(); context.moveTo(first.x, first.y);
    for (const point of stroke.points.slice(1)) context.lineTo(point.x, point.y);
    context.stroke();
  }
  function render() {
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
    strokes.forEach(paintStroke);
  }
  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return {x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * canvas.width / rect.width)),
      y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * canvas.height / rect.height))};
  }
  function finish(event, cancel = false) {
    if (!active || event.pointerId !== active.pointerId) return;
    if (cancel) strokes.pop();
    else active.stroke.points.push(point(event));
    const pointerId = active.pointerId; active = null;
    if (canvas.hasPointerCapture?.(pointerId)) canvas.releasePointerCapture(pointerId);
    render(); controls(); onChange(strokes.length > 0);
  }
  listen(canvas, "pointerdown", event => {
    if (disposed || !enabled || active || event.button !== 0 && event.pointerType !== "touch") return;
    event.preventDefault();
    const stroke = {width: selectedPenWidth * canvas.width / canvas.getBoundingClientRect().width, points: [point(event)]};
    strokes.push(stroke); active = {pointerId: event.pointerId, stroke};
    canvas.setPointerCapture(event.pointerId); paintStroke(stroke); controls(); onChange(true);
  });
  listen(canvas, "pointermove", event => {
    if (!active || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    const events = event.getCoalescedEvents?.() || [];
    const previous = active.stroke.points.at(-1);
    context.beginPath(); context.moveTo(previous.x, previous.y);
    for (const sample of events.length ? events : [event]) {const next = point(sample); active.stroke.points.push(next); context.lineTo(next.x, next.y);}
    context.stroke();
  });
  listen(canvas, "pointerup", event => finish(event));
  listen(canvas, "pointercancel", event => finish(event, true));
  listen(canvas, "lostpointercapture", event => {if (active?.pointerId === event.pointerId) finish(event, true);});
  listen(undoButton, "click", () => {if (!enabled || disposed || active) return; strokes.pop(); render(); controls(); onChange(strokes.length > 0);});
  listen(clearButton, "click", () => {if (!enabled || disposed || active) return; strokes.length = 0; render(); controls(); onChange(false);});
  render(); controls();
  return {
    hasInk: () => strokes.length > 0,
    isDrawing: () => !!active,
    setPenWidth(value) {if (!disposed) selectedPenWidth = validatePenWidth(value);},
    setEnabled(value) {enabled = !!value; if (!enabled && active) finish({pointerId: active.pointerId}, true); controls();},
    async toBlob() {
      if (disposed || active || !strokes.length) throw new Error("Write something on the canvas before testing OCR.");
      // Include each stroke's round caps, including dots, without reading every pixel.
      let left = canvas.width, top = canvas.height, right = 0, bottom = 0;
      for (const stroke of strokes) {
        const radius = stroke.width / 2;
        for (const point of stroke.points) {
          left = Math.min(left, point.x - radius); top = Math.min(top, point.y - radius);
          right = Math.max(right, point.x + radius); bottom = Math.max(bottom, point.y + radius);
        }
      }
      left = Math.max(0, Math.floor(left)); top = Math.max(0, Math.floor(top));
      right = Math.min(canvas.width, Math.ceil(right)); bottom = Math.min(canvas.height, Math.ceil(bottom));
      const width = right - left, height = bottom - top, padding = 24;
      const image = canvas.ownerDocument.createElement("canvas");
      image.width = width + padding * 2; image.height = height + padding * 2;
      const imageContext = image.getContext("2d");
      if (!imageContext) throw new Error("Your browser could not prepare the handwriting image.");
      imageContext.fillStyle = "#ffffff"; imageContext.fillRect(0, 0, image.width, image.height);
      // Copy at native resolution; leave the writing canvas and its undo history intact.
      imageContext.drawImage(canvas, left, top, width, height, padding, padding, width, height);
      return new Promise((resolve, reject) => image.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not convert the canvas to an image.")), "image/png"));
    },
    dispose() {
      if (disposed) return;
      if (active) finish({pointerId: active.pointerId}, true);
      disposed = true; listeners.forEach(remove => remove()); strokes.length = 0; render(); controls();
    },
  };
}
