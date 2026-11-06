#!/usr/bin/env bash
# Uses the same verified temporary ADC/proxy setup as deploy-firebase.sh.
set +x
set -euo pipefail
umask 077
[[ $# -eq 0 || ( $# -eq 1 && "$1" == --apply ) ]] || { echo 'Usage: scripts/migrate-topic-frameworks.sh [--apply]' >&2; exit 2; }
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

# Always outside the application repository, regardless of TMPDIR.
deploy_tmp="$(mktemp -d /tmp/rhx-topic-migration.XXXXXXXX)"
cleanup() { rm -rf -- "$deploy_tmp"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
# Resolve only preinstalled packages. No packages are installed by this maintenance script.
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

node --require "$deploy_tmp/auth-proxy.cjs" "$repo_dir/scripts/migrate-topic-frameworks.cjs" "$@"
