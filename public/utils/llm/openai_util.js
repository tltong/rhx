import {imageGenerationClient} from "./image_generation_client.js?v=20261021-image-generation-v1";

export class OpenAIUtil {
  constructor({client = imageGenerationClient} = {}) {this.client = client;}
  generateImage(input, options = {}) {return this.client.request("generate", input, options);}
}
export const openaiUtil = new OpenAIUtil();
export const generateOpenAIImage = (input, options) => openaiUtil.generateImage(input, options);
export default openaiUtil;
