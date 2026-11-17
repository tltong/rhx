import {getFirebaseApp} from "../../utils/firebase/firebase_ops.js";

function capability() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
export function createDemoClient({getApp = getFirebaseApp, makeToken = capability} = {}) {
  let token = null;
  async function send(action, input = {}, selectedToken = token) {
    if (!selectedToken) throw new Error("Start a new demo to continue.");
    const app = getApp();
    if (typeof app.functions !== "function") throw new Error("The demo connection could not initialize. Reload and try again.");
    const response = await app.functions("us-central1").httpsCallable("demo", {timeout: 180000})({action, token: selectedToken, input});
    return response.data;
  }
  return {
    async start() {token ||= makeToken(); return send("startDemo");},
    request: send,
    async finish() {
      const endedToken = token; token = null;
      let lastError;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {return await send("finishDemo", {}, endedToken);}
        catch (error) {
          if (/(invalid-argument|permission-denied|unauthenticated|failed-precondition)$/.test(error.code || "")) throw error;
          lastError = error;
          if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 300 * 2 ** attempt));
        }
      }
      throw lastError;
    },
    abandon() {token = null;},
  };
}
export const demo = createDemoClient();
