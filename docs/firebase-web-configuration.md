# Firebase web configuration

The web app uses the default Firebase app initialized by Firebase Hosting's
`/__/firebase/init.js`. Its settings come from the deployed project's registered
Web app in Firebase Console, under **Project settings → General → Your apps**.
Do not copy an API key or project ID into the web source or web environment variables.

Pages load the Firebase compat SDKs, then `/__/firebase/init.js`, then the app's
module scripts. `public/init_fb.js` connects the shared Firestore helpers to that
existing app. `getFirebaseConfig()` reads its options when needed, so direct HTTP
function URLs use the same project as Firestore, Authentication, and callable
functions. There is no production fallback if Hosting initialization is missing.
The current production deployment target remains `readyherox`.

Firebase web settings, including the web API key, are public browser configuration.
Authentication and security rules control access to data. Backend secrets and
deployment credentials are separate from these web settings.

For local development, serve the app through Firebase Hosting's emulator using an
explicit project (`firebase emulators:start --only hosting --project <project-id>`),
or initialize the default compat app with explicit local settings before the app
modules run. Selecting a Hosting emulator project alone does not connect Firestore
or Authentication to their emulators; configure those SDK connections separately.
A plain static file server does not supply `/__/firebase/init.js`.

Verification:

```sh
node --test public/config/firebase/firebase_config.test.mjs
```

The browser bootstrap check uses local SDK copies in the directory selected by
`SUBJECT_ASSESSMENT_TEST_SDK_DIR`. With `public/` served at
`http://127.0.0.1:8769`, run:

```sh
node scripts/test-tutor-firebase-bootstrap-browser.cjs
```

It uses the real compat SDKs with simulated Hosting initialization and callable
responses. It does not read or write production data.
