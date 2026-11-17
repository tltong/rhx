# DeepSeek environment configuration

The DeepSeek HTTP function reads `ALLOWED_WEB_ORIGINS` from its deployment
environment. Both the Firebase CORS middleware and the handler's response headers
use the same list, parsed once when the function loads.

Both project configuration files belong in the same codebase:

| Firebase deployment project | Functions configuration file | Allowed website origins |
| --- | --- | --- |
| `readyherox` | `functions/.env.readyherox` | `https://readyherox.web.app`, `https://readyherox.firebaseapp.com` |
| `rhx-staging` | `functions/.env.rhx-staging` | `https://rhx-staging.web.app`, `https://rhx-staging.firebaseapp.com` |

Firebase CLI selects the project-specific file using the deployment's Firebase
project ID. Git branches do not select configuration files. These values are
ordinary public website addresses and can be committed to Git. The existing
production `RENEWAL_RECOVERY_START_AT` setting is preserved.

The variable contains a comma-separated list of exact HTTPS origins, with no
trailing slash, path, query, fragment, wildcard, or credentials. Spaces around
entries and duplicate entries are accepted. Existing localhost and 127.0.0.1
HTTP origins with explicit ports remain allowed for development. An absent or
empty setting allows only those local origins; it never selects production
domains. Invalid entries prevent the function from loading.

CORS controls browser access to responses; it does not authenticate requests or
restrict non-browser clients. Existing handling of requests without an Origin
header is unchanged.

This change applies to `generateDeepseekText`. The image-generation and OCR HTTP
functions still have their own origin settings and require separate updates.
Apply new settings by deploying the function to the intended project. The
existing repository deployment script still explicitly targets `readyherox`.

The DeepSeek credential remains the project-specific Secret Manager secret
`DEEPSEEK_API_KEY`. Do not add API keys to these `.env` files. The API endpoint
and model selection are unchanged.

Run the configuration and DeepSeek checks with:

```sh
node --test functions/utils/http/web_origins.test.js functions/deepseek_cors.test.js functions/deepseek.test.js
```
