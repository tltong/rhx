import {imageGenerationClient} from "../../utils/llm/image_generation_client.js?v=20261021-image-generation-v1";
import {generateLlmImage} from "../../utils/llm/llm_util.js?v=20261021-image-generation-v1";
import {DEFAULT_IMAGE_SETTINGS, normalizeImageSettings, resolveImageRequest} from "../../utils/llm/image_generation_settings.js?v=20261021-image-generation-v1";
export {IMAGE_MODELS, IMAGE_SIZES, IMAGE_QUALITIES, DEFAULT_IMAGE_SETTINGS} from "../../utils/llm/image_generation_settings.js?v=20261021-image-generation-v1";

export function createImageGenerationFeature({client = imageGenerationClient, generate = generateLlmImage} = {}) {
  return {
    getImageGenerationConfig: () => client.request("getConfig"),
    saveImageGenerationConfig: input => client.request("saveConfig", normalizeImageSettings(input)),
    generateImage(input, options = {}) {
      // Validate supplied overrides without filling omitted fields: the Functions
      // feature reads the current stored defaults for each request.
      resolveImageRequest(input, DEFAULT_IMAGE_SETTINGS);
      const request = {prompt: input.prompt.trim()};
      for (const key of Object.keys(DEFAULT_IMAGE_SETTINGS)) if (input[key] !== undefined) request[key] = input[key];
      return generate(request, {...options, provider: "openai"});
    },
  };
}
const feature = createImageGenerationFeature();
export const {getImageGenerationConfig, saveImageGenerationConfig, generateImage} = feature;
