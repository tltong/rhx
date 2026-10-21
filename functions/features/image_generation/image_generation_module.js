const {DEFAULT_IMAGE_SETTINGS, normalizeImageSettings, resolveImageRequest} = require("../../utils/llm/image_generation_settings");
const {generateLlmImage} = require("../../utils/llm/llm_util");
const {isSiteAdmin} = require("../site_admin/site_admin_module");
const {getAuth} = require("firebase-admin/auth");
const {getFirebaseApp} = require("../../utils/firebase/firebase_ops");
const {FirestoreImageGenerationConfigRepository} = require("./infrastructure/firestore_image_generation_config_repository");

function createImageGenerationFeature({repository = new FirestoreImageGenerationConfigRepository(),
  generate = generateLlmImage, checkAdmin = isSiteAdmin,
  getUser = uid => getAuth(getFirebaseApp()).getUser(uid)} = {}) {
  return {
    async getImageGenerationConfig() {return repository.getConfig();},
    async saveImageGenerationConfig(input, {updatedBy} = {}) {
      const settings = normalizeImageSettings(input);
      if (typeof updatedBy !== "string" || !updatedBy.trim()) throw Object.assign(new Error("Sign in to save image settings."), {code: "unauthenticated"});
      const user = await getUser(updatedBy);
      if (user.disabled || !user.emailVerified || !user.email || !await checkAdmin(user.email)) {
        throw Object.assign(new Error("A verified site administrator is required to save image settings."), {code: "permission-denied"});
      }
      return repository.saveConfig(settings, user.uid);
    },
    async generateImage(input, options = {}) {
      const configuration = await repository.getConfig() || DEFAULT_IMAGE_SETTINGS;
      const request = resolveImageRequest(input, configuration);
      return generate(request, {...options, provider: "openai"});
    },
  };
}
module.exports = {...createImageGenerationFeature(), createImageGenerationFeature};
