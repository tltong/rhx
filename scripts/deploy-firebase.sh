#!/usr/bin/env bash
# Deploy with the verified Firebase 15.34.0 authentication-agent workaround.
set +x
set -euo pipefail
umask 077

usage() {
  echo "Usage: $0 {hosting|functions|all}"
  echo "       $0 function <exported-function-name>"
  echo "Requires FIREBASE_SERVICE_ACCOUNT_JSON; deploys to readyherox."
  echo "Optional RHX_FIREBASE_TOOLS_DIR selects a preinstalled npm package directory."
}

function_name=''
case "${1:-}" in
  hosting|functions|all)
    [[ $# -eq 1 ]] || { usage >&2; exit 2; }
    case "$1" in
      hosting) targets=hosting ;;
      functions) targets=functions ;;
      all) targets=hosting,functions ;;
    esac
    ;;
  function)
    [[ $# -eq 2 ]] || { usage >&2; exit 2; }
    function_name="$2"
    [[ "$function_name" =~ ^[A-Za-z][A-Za-z0-9_-]*$ ]] || {
      echo 'Invalid function name; specify one exported function name.' >&2; exit 2;
    }
    targets="functions:$function_name"
    ;;
  -h|--help) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
[[ -f "$repo_dir/firebase.json" ]] || { echo 'firebase.json is missing.' >&2; exit 1; }
[[ -n "${FIREBASE_SERVICE_ACCOUNT_JSON:-}" ]] || {
  echo 'FIREBASE_SERVICE_ACCOUNT_JSON is missing or empty.' >&2; exit 1;
}
[[ "${NODE_TLS_REJECT_UNAUTHORIZED:-}" != 0 ]] || {
  echo 'Refusing deployment with TLS verification disabled.' >&2; exit 1;
}
[[ -n "${HTTPS_PROXY:-}" ]] || {
  echo 'HTTPS_PROXY is required for the verified authentication workaround.' >&2; exit 1;
}
for executable in node npm; do
  command -v "$executable" >/dev/null || { echo "$executable is required." >&2; exit 1; }
done

if [[ -n "$function_name" ]]; then
  # Fail before creating credentials if the name is not an actual function export.
  node - "$repo_dir" "$function_name" <<'NODE'
const fs = require('fs');
const path = require('path');
const [repo, name] = process.argv.slice(2);
try {
  const config = JSON.parse(fs.readFileSync(path.join(repo, 'firebase.json'), 'utf8'));
  const codebases = [config.functions].flat().filter(Boolean);
  // Firebase also accepts codebase names after "functions:". Avoid ambiguity.
  if (codebases.some(c => (c.codebase || 'default') === name)) {
    throw new Error('Function name conflicts with a configured codebase name.');
  }
  let matches = 0;
  for (const codebase of codebases) {
    const exported = require(path.resolve(repo, codebase.source));
    if (Object.hasOwn(exported, name) && typeof exported[name] === 'function' &&
        (exported[name].__endpoint || exported[name].__trigger)) matches++;
  }
  if (matches !== 1) {
    throw new Error(matches ? 'Function is exported by multiple codebases.' :
      'Function is not exported by a configured Functions source.');
  }
} catch (error) {
  console.error(`Cannot deploy function ${name}: ${error.message}`);
  process.exit(2);
}
NODE
fi

# Always outside the application repository, regardless of TMPDIR.
deploy_tmp="$(mktemp -d /tmp/rhx-firebase-deploy.XXXXXXXX)"
cleanup() { rm -rf -- "$deploy_tmp"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
# Resolve only preinstalled packages. No npm install or npx runs at deployment time.
tools_dir="${RHX_FIREBASE_TOOLS_DIR:-$(dirname -- "$repo_dir")/.rhx-tools}"
global_modules="$(npm root -g)"
node - "$repo_dir" "$tools_dir" "$global_modules" "$deploy_tmp/dependencies.json" <<'NODE'
const fs = require('fs');
const path = require('path');
const {createRequire} = require('module');
const [repo, tools, globalModules, output] = process.argv.slice(2);
const anchors = [tools, repo, path.dirname(globalModules),
  ...require('module').globalPaths.map(p => path.dirname(p))];
const required = {'firebase-tools': '15.34.0', 'https-proxy-agent': '9.1.0', 'proxy-from-env': null};
const dependencies = {};
let missing = false;
for (const [name, version] of Object.entries(required)) {
  const observed = new Set();
  for (const anchor of anchors) {
    try {
      const resolver = createRequire(path.join(anchor, '__rhx_resolve__.cjs'));
      // Resolve the public entry through Node's exports, then read metadata
      // from disk: package.json need not be an exported subpath.
      const moduleEntry = resolver.resolve(name);
      let directory = path.dirname(moduleEntry);
      let pkg;
      while (true) {
        const manifest = path.join(directory, 'package.json');
        if (fs.existsSync(manifest)) {
          const candidate = JSON.parse(fs.readFileSync(manifest, 'utf8'));
          if (candidate.name === name) { pkg = candidate; break; }
        }
        const parent = path.dirname(directory);
        if (parent === directory) throw new Error('Installed package metadata not found');
        directory = parent;
      }
      observed.add(pkg.version);
      if (version && pkg.version !== version) continue;
      const entry = name === 'firebase-tools'
        ? path.join(directory, 'lib/bin/firebase.js')
        : moduleEntry;
      fs.accessSync(entry, fs.constants.R_OK);
      if (name === 'firebase-tools') {
        const api = resolver(path.join(directory, 'lib/apiv2'));
        if (typeof api.noKeepAliveAgent !== 'function') continue;
      } else if (name === 'https-proxy-agent') {
        const {HttpsProxyAgent} = resolver(name);
        if (typeof HttpsProxyAgent !== 'function') continue;
        // Construction validates the API without opening a connection.
        const agent = new HttpsProxyAgent(process.env.HTTPS_PROXY, {rejectUnauthorized: true});
        agent.destroy();
      } else {
        const {getProxyForUrl} = resolver(name);
        if (typeof getProxyForUrl !== 'function' ||
            typeof getProxyForUrl('https://www.googleapis.com/') !== 'string') continue;
      }
      dependencies[name] = {entry, directory, version: pkg.version};
      break;
    } catch { /* Try the next existing installation. */ }
  }
  if (!dependencies[name]) {
    missing = true;
    console.error(`Missing compatible dependency: ${name}${version ? '@' + version : ''}` +
      (observed.size ? ` (found ${[...observed].join(', ')})` : ''));
  }
}
if (missing) {
  console.error('Install dependencies during Codex Cloud environment setup, outside the repository:');
  console.error('npm install --prefix /workspace/.rhx-tools firebase-tools@15.34.0 https-proxy-agent@9.1.0 proxy-from-env');
  console.error('For another location, set RHX_FIREBASE_TOOLS_DIR to its npm prefix directory.');
  process.exit(1);
}
fs.writeFileSync(output, JSON.stringify(dependencies), {mode: 0o600});
NODE
export RHX_FIREBASE_DEPENDENCIES="$deploy_tmp/dependencies.json"
firebase_entry="$(node -e 'console.log(require(process.argv[1])["firebase-tools"].entry)' "$RHX_FIREBASE_DEPENDENCIES")"
export GOOGLE_APPLICATION_CREDENTIALS="$deploy_tmp/adc.json"
node <<'NODE'
const fs = require('fs');
try {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  JSON.parse(raw);
  fs.writeFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, raw, {
    mode: 0o600, flag: 'wx',
  });
} catch {
  console.error('Unable to create temporary ADC credentials from the environment variable.');
  process.exit(1);
}
NODE
unset FIREBASE_SERVICE_ACCOUNT_JSON FIREBASE_TOKEN

# The current frontend is static public/ content and needs no build. If a root
# frontend build script is introduced, run it before Hosting deployment.
if [[ ( "$targets" == hosting || "$targets" == hosting,functions ) && -f "$repo_dir/package.json" ]]; then
  if node -e 'const p=require(process.argv[1]);process.exit(typeof p.scripts?.build === "string" ? 0 : 1)' "$repo_dir/package.json"; then
    echo 'Building frontend...'
    (cd "$repo_dir" && npm run build)
  fi
fi

export XDG_CONFIG_HOME="$deploy_tmp/config"
export CI=true

# Exact override used in the successful authentication and Hosting deployment:
# replace Firebase's exported authentication agent, not Node's global agents.
cat >"$deploy_tmp/auth-proxy.cjs" <<'NODE'
const dependencies=require(process.env.RHX_FIREBASE_DEPENDENCIES);
const {HttpsProxyAgent}=require(dependencies['https-proxy-agent'].entry);
const {getProxyForUrl}=require(dependencies['proxy-from-env'].entry);
const api=require(dependencies['firebase-tools'].directory+'/lib/apiv2');
const original=api.noKeepAliveAgent;
const agent=new HttpsProxyAgent(process.env.HTTPS_PROXY,{rejectUnauthorized:true});
api.noKeepAliveAgent=function(url){
  const target=typeof url==='string'?new URL(url):url;
  return target.protocol==='https:'&&getProxyForUrl(target.href||String(target))?agent:original(url);
};
NODE

# Read the existing configuration, resolving source paths so Firebase's cache
# and debug files can live in the temporary directory, as in the verified run.
node - "$repo_dir" "$deploy_tmp/firebase.json" <<'NODE'
const fs = require('fs');
const path = require('path');
const [repo, output] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(path.join(repo, 'firebase.json'), 'utf8'));
for (const hosting of [config.hosting].flat().filter(Boolean)) {
  if (hosting.public) hosting.public = path.resolve(repo, hosting.public);
}
for (const functions of [config.functions].flat().filter(Boolean)) {
  if (functions.source) functions.source = path.resolve(repo, functions.source);
}
fs.writeFileSync(output, JSON.stringify(config));
NODE

echo "Deploying $targets to readyherox..."
cd "$deploy_tmp"
node --require "$deploy_tmp/auth-proxy.cjs" \
  "$firebase_entry" \
  deploy --only "$targets" --project readyherox \
  --config "$deploy_tmp/firebase.json" --non-interactive
