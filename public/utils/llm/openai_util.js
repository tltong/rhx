import {imageGenerationClient} from "./image_generation_client.js?v=20261021-image-generation-v1";
import {imageOcrClient} from "./image_ocr_client.js?v=20261021-ocr-canvas-v1";

export class OpenAIUtil {
  constructor({client = imageGenerationClient, ocrClient = imageOcrClient} = {}) {this.client = client; this.ocrClient = ocrClient;}
  generateImage(input, options = {}) {return this.client.request("generate", input, options);}
  extractTextFromImage(input, {operation = "extract", ...options} = {}) {return this.ocrClient.request(operation, input, options);}
}
export const openaiUtil = new OpenAIUtil();
export const generateOpenAIImage = (input, options) => openaiUtil.generateImage(input, options);
export const extractOpenAIImageText = (input, options) => openaiUtil.extractTextFromImage(input, options);
export default openaiUtil;
