const {getAuth} = require("firebase-admin/auth");
const {getFirebaseApp} = require("../../utils/firebase/firebase_ops");
const {extractLlmImageText} = require("../../utils/llm/llm_util");
const {DEFAULT_OCR_SETTINGS, normalizeOcrSettings, normalizeOcrInput, normalizeOcrImage} = require("../../utils/llm/image_ocr_settings");
const {isSiteAdmin} = require("../site_admin/site_admin_module");
const {FirestoreImageOcrConfigRepository} = require("./infrastructure/firestore_image_ocr_config_repository");
const {buildOcrRequest} = require("./application/build_ocr_request");

function createImageOcrFeature({repository = new FirestoreImageOcrConfigRepository(), extract = extractLlmImageText,
  checkAdmin = isSiteAdmin, getUser = uid => getAuth(getFirebaseApp()).getUser(uid)} = {}) {
  async function requireAdministrator({updatedBy} = {}) {
    if (typeof updatedBy !== "string" || !updatedBy.trim()) throw Object.assign(new Error("Sign in with a site-administrator account."), {code: "unauthenticated"});
    const user = await getUser(updatedBy);
    if (user.disabled || !user.emailVerified || !user.email || !await checkAdmin(user.email)) throw Object.assign(new Error("A verified site administrator is required."), {code: "permission-denied"});
    return user.uid;
  }
  function run(input, configuration, options = {}) {
    const timeoutMs = Math.min(options.timeoutMs ?? configuration.timeoutSeconds * 1000, configuration.timeoutSeconds * 1000);
    const {provider, ...request} = buildOcrRequest(input, configuration);
    return extract(request, {provider, signal: options.signal, timeoutMs});
  }
  return {
    getImageOcrConfig: () => repository.getConfig(),
    async saveImageOcrConfig(input, context) {
      const settings = normalizeOcrSettings(input);
      const uid = await requireAdministrator(context);
      return repository.saveConfig(settings, uid);
    },
    async extractTextFromImage(input, options = {}) {
      const snapshot = normalizeOcrInput(input);
      const settings = normalizeOcrSettings(await repository.getConfig() || DEFAULT_OCR_SETTINGS);
      return run(snapshot, settings, options);
    },
    async testImageOcr(input, context, options = {}) {
      const settings = normalizeOcrSettings(input?.configuration);
      const image = normalizeOcrImage(input?.image, settings.maxImageSizeMiB * 1024 * 1024);
      await requireAdministrator(context);
      return run({image}, settings, options);
    },
  };
}
module.exports = {...createImageOcrFeature(), createImageOcrFeature};
