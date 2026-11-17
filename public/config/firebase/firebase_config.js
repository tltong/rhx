const configurationError = "Firebase configuration is unavailable. Load /__/firebase/init.js after the Firebase SDK and before using Firebase services.";

// Firebase Hosting initializes the default app with this site's Web app settings.
// Resolve it when needed, rather than reading the SDK during module import.
export function getConfiguredFirebaseApp() {
  if (typeof globalThis.firebase?.app !== "function") {
    throw new Error(configurationError);
  }

  try {
    return globalThis.firebase.app();
  } catch (cause) {
    throw new Error(configurationError, {cause});
  }
}

export function getFirebaseConfig() {
  const config = getConfiguredFirebaseApp().options;
  if (typeof config?.projectId !== "string" || !config.projectId.trim()) {
    throw new Error(configurationError);
  }
  return config;
}
