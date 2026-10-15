async function tutorSetDocumentId({questionId, language}) {
  const key = JSON.stringify([questionId, language]);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return "set-" + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export {tutorSetDocumentId};
