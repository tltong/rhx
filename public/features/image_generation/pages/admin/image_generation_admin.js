import {DEFAULT_IMAGE_SETTINGS, IMAGE_SIZES, getImageGenerationConfig, saveImageGenerationConfig,
  generateImage} from "../../image_generation_module.js?v=20261021-image-generation-v1";
import {normalizeImageSettings} from "../../../../utils/llm/image_generation_settings.js?v=20261021-image-generation-v1";
import {getCurrentFirebaseAuthRawUser, onFirebaseAuthStateChanged} from "../../../../utils/firebase/firebase_auth.js";

export function mountImageGenerationAdmin({root = document, getConfig = getImageGenerationConfig,
  saveConfig = saveImageGenerationConfig, generate = generateImage,
  createUrl = blob => URL.createObjectURL(blob), revokeUrl = url => URL.revokeObjectURL(url)} = {}) {
  const byId = id => root.getElementById(id);
  const form = byId("image-config-form"), model = byId("image-model"), quality = byId("image-quality");
  const size = byId("image-size"), custom = byId("image-custom-size"), transparent = byId("image-transparent");
  const saveButton = byId("image-save"), retry = byId("image-retry-load"), prompt = byId("image-prompt"), generateButton = byId("image-generate");
  const fields = [model, quality, size, custom, transparent, prompt], listeners = [];
  const controller = new AbortController();
  let loaded = false, busy = false, disposed = false, imageUrl = null;
  function listen(element, event, fn) {element.addEventListener(event, fn); listeners.push(() => element.removeEventListener(event, fn));}
  function status(id, message, error = false) {const el = byId(id); el.textContent = message; el.hidden = !message; el.classList.toggle("is-error", error);}
  function controls() {
    for (const field of [...fields, saveButton, generateButton]) field.disabled = !loaded || busy || disposed;
    retry.disabled = busy || disposed;
    byId("image-custom-dimensions").hidden = size.value !== "custom";
    custom.disabled = custom.disabled || size.value !== "custom";
    form.setAttribute("aria-busy", String(busy));
    byId("image-test-panel").setAttribute("aria-busy", String(busy));
  }
  function readForm() {return normalizeImageSettings({model: model.value, quality: quality.value,
    size: size.value === "custom" ? custom.value.trim() : size.value, transparentBackground: transparent.checked});}
  function render(config) {
    const settings = normalizeImageSettings(config || DEFAULT_IMAGE_SETTINGS);
    model.value = settings.model; quality.value = settings.quality; transparent.checked = settings.transparentBackground;
    size.value = IMAGE_SIZES.includes(settings.size) ? settings.size : "custom";
    custom.value = settings.size;
    byId("image-updated-at").textContent = config?.updatedAt
      ? `Last saved: ${new Date(config.updatedAt).toLocaleString()} by ${config.updatedBy || "administrator"}` : "Defaults · Not yet saved";
    byId("image-draft-status").textContent = "Current default settings";
  }
  const errorText = error => (error.message || "The request failed.") + (error.requestId ? ` Request ID: ${error.requestId}` : "");
  function clearImage() {
    byId("image-result").hidden = true; byId("image-preview").removeAttribute("src"); byId("image-download").removeAttribute("href");
    if (imageUrl) revokeUrl(imageUrl);
    imageUrl = null;
  }
  async function load() {
    if (busy || disposed) return;
    busy = true; loaded = false; retry.hidden = true; controls(); status("image-config-status", "Loading image settings...");
    try {
      const config = await getConfig();
      if (disposed) return;
      render(config); loaded = true; status("image-config-status", config ? "Settings loaded." : "Initial defaults loaded. Save to configure shared defaults.");
    } catch (error) {if (!disposed) {retry.hidden = false; status("image-config-status", errorText(error), true);}}
    finally {busy = false; if (!disposed) controls();}
  }
  async function save(event) {
    event.preventDefault(); if (!loaded || busy || disposed) return;
    let settings;
    try {settings = readForm();} catch (error) {status("image-config-status", errorText(error), true); return;}
    busy = true; saveButton.textContent = "Saving..."; controls(); status("image-config-status", "Saving image settings...");
    try {
      const saved = await saveConfig(settings);
      if (!disposed) {render(saved); status("image-config-status", "Settings saved. Future requests will use these defaults.");}
    } catch (error) {if (!disposed) status("image-config-status", errorText(error), true);}
    finally {busy = false; if (!disposed) {saveButton.textContent = "Save settings"; controls();}}
  }
  async function testImage() {
    if (!loaded || busy || disposed) return;
    let settings;
    try {
      settings = readForm();
      if (!prompt.value.trim()) throw new Error("Enter an image prompt first.");
    } catch (error) {status("image-test-status", errorText(error), true); return;}
    busy = true; clearImage(); generateButton.textContent = "Generating..."; controls();
    status("image-test-status", "Generating your test image. This can take a few minutes.");
    try {
      const result = await generate({prompt: prompt.value.trim(), ...settings}, {signal: controller.signal});
      if (disposed) return;
      const image = result?.images?.[0];
      if (image?.mimeType !== "image/png" || typeof image.base64 !== "string" || !image.base64.length) throw new Error("The service returned no PNG image.");
      const resolved = normalizeImageSettings(result.settings);
      const bytes = Uint8Array.from(atob(image.base64), char => char.charCodeAt(0));
      imageUrl = createUrl(new Blob([bytes], {type: "image/png"}));
      byId("image-preview").src = imageUrl; byId("image-download").href = imageUrl;
      byId("image-result-settings").textContent = `${resolved.model} · ${resolved.size} · ${resolved.quality} quality · ${resolved.transparentBackground ? "Transparent" : "Opaque"} background`;
      byId("image-result").hidden = false; status("image-test-status", "Image generated. You can preview it and download the PNG.");
    } catch (error) {if (!disposed) status("image-test-status", errorText(error), true);}
    finally {busy = false; if (!disposed) {generateButton.textContent = "Generate test image"; controls();}}
  }
  for (const field of [model, quality, size, custom, transparent]) listen(field, "input", () => {
    if (!loaded || busy || disposed) return;
    byId("image-draft-status").textContent = "Unsaved changes · Tests use these settings"; controls();
  });
  listen(size, "change", controls); listen(form, "submit", save); listen(retry, "click", load); listen(generateButton, "click", testImage);
  render(null); controls();
  return {ready: load(), dispose() {if (disposed) return; disposed = true; controller.abort(); listeners.forEach(remove => remove()); clearImage(); prompt.value = ""; controls();}};
}

if (typeof document !== "undefined" && document.getElementById("image-generation-admin")) {
  const uid = getCurrentFirebaseAuthRawUser()?.uid;
  const page = mountImageGenerationAdmin();
  const unsubscribe = onFirebaseAuthStateChanged(user => {
    if (user?.uid === uid) return;
    page.dispose();
    const status = document.getElementById("image-config-status");
    status.hidden = false; status.textContent = "The signed-in account changed. Reload this page to continue.";
  });
  globalThis.addEventListener("pagehide", () => {unsubscribe(); page.dispose();}, {once: true});
}
