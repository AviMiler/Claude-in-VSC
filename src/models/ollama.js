// The model's real context window and whether it is loaded, read from Ollama's `GET /api/ps`
// (`models[].context_length`, `expires_at`; measured on the user's machine: qwen3.8:27b = 64000).
// Feeds the CLI's launch window (src/models/launch.js), the usage gauge and the load indicator
// (src/panels/context-meter.js). A network read outside the gateway: recorded in DECISIONS.md
// (2026-11-08, "usage gauge: Ollama /api/ps"). GET only, nothing stored on disk (the last window per
// model is kept in memory), short timeout; any failure gives nulls and the callers fall back.

const TIMEOUT_MS = 2000;
// An unload time further ahead than this is `keep_alive: -1` (Ollama reports a year in the 2300s).
const PERMANENT_MS = 365 * 24 * 3600 * 1000;
const DEFAULT_MODEL = 'default';

// The Ollama base URL, or '' when the read is off.
// ollamaUrl: the claudeLocal.ollamaUrl setting (package.json default: the current environment's
// address, changeable by the user). Empty or 'off' disables the read; the address is never guessed.
function resolveOllamaUrl({ ollamaUrl = '' } = {}) {
  const explicit = String(ollamaUrl || '').trim();
  if (!explicit || explicit.toLowerCase() === 'off') return '';
  return explicit.replace(/\/+$/, '');
}

// "ollama_chat/Qwen3.8:27b[1m]" -> "qwen3.8:27b"; a name without a tag gets ":latest" like Ollama.
function normalizeModelName(name) {
  let n = String(name || '').trim().toLowerCase().replace(/\[[^\]]*\]$/, '');
  n = n.slice(n.lastIndexOf('/') + 1);
  if (!n) return '';
  return n.includes(':') ? n : `${n}:latest`;
}

// --- the last window seen per model (memory only: Ollama unloads an idle model, its window stays) ---

const windowCache = new Map();
const cacheKey = (base, model) => `${base} ${normalizeModelName(model)}`;

// Remembers a positive integer window for this Ollama address and model; anything else is ignored.
function rememberWindow(base, model, n) {
  if (base && normalizeModelName(model) && Number.isInteger(n) && n > 0) windowCache.set(cacheKey(base, model), n);
}

// The last window seen for this address and model, or null.
function cachedWindow(base, model) {
  return (base && normalizeModelName(model) && windowCache.get(cacheKey(base, model))) || null;
}

// For tests: the cache lives as long as the extension host.
function clearWindowCache() {
  windowCache.clear();
}

// --- the /api/ps answer ------------------------------------------------------------------------

// Pure: the /api/ps entry whose name (or model) matches, else null.
function findEntry(ps, model) {
  const want = normalizeModelName(model);
  const list = ps && Array.isArray(ps.models) ? ps.models : [];
  if (!want) return null;
  for (const m of list) {
    if (!m || typeof m !== 'object') continue;
    if (normalizeModelName(m.name) === want || normalizeModelName(m.model) === want) return m;
  }
  return null;
}

// Pure: the context_length of the matching entry, else null.
function windowFromPs(ps, model) {
  const entry = findEntry(ps, model);
  const n = entry && entry.context_length;
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Pure: null when the load state is unknown (no usable answer or no model name); { loaded: false }
// when the model has no entry or its unload time has passed; else { loaded: true, until, permanent }
// with `until` the unload time in ms (null when Ollama gave none) and `permanent` for keep_alive -1.
function loadState(ps, model, now = Date.now()) {
  if (!ps || !Array.isArray(ps.models) || !normalizeModelName(model)) return null;
  const entry = findEntry(ps, model);
  if (!entry) return { loaded: false };
  const until = Date.parse(entry.expires_at);
  if (!Number.isFinite(until)) return { loaded: true, until: null, permanent: false };
  if (until <= now) return { loaded: false };
  return { loaded: true, until, permanent: until - now > PERMANENT_MS };
}

// Resolves to { ps, note }: ps is the parsed answer or null, note says why for the log. Never rejects.
async function fetchPs(baseUrl, fetchImpl = fetch) {
  if (!baseUrl) return { ps: null, note: 'off' };
  try {
    const res = await fetchImpl(`${baseUrl}/api/ps`, { method: 'GET', signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return { ps: null, note: `HTTP ${res.status}` };
    return { ps: await res.json(), note: 'ok' };
  } catch (err) {
    return { ps: null, note: `unreachable (${err && err.name === 'TimeoutError' ? 'timeout' : (err && err.message) || err})` };
  }
}

// One request, three results: { window, load, note }. window is the model's real window from this
// answer (null when unknown; a found one is remembered), load is loadState (null = unknown). Never rejects.
async function readOllama(baseUrl, model, fetchImpl = fetch) {
  if (!baseUrl) return { window: null, load: null, note: 'off' };
  if (!normalizeModelName(model)) return { window: null, load: null, note: 'no model name' };
  const { ps, note } = await fetchPs(baseUrl, fetchImpl);
  if (!ps) return { window: null, load: null, note };
  const window = windowFromPs(ps, model);
  rememberWindow(baseUrl, model, window);
  return { window, load: loadState(ps, model), note: window ? 'ok' : `${normalizeModelName(model)} not loaded` };
}

// The model name to look up in /api/ps. A chosen model is used as is; for the default model the CLI
// resolves the name itself, so: ANTHROPIC_MODEL from the extension's environmentVariables, the process
// environment, the CLI's settings.json env, then the last model name the CLI reported; '' when unknown.
function ollamaModelName(model, { environmentVariables, env, cliEnv, lastReported } = {}) {
  if (model && model !== DEFAULT_MODEL) return model;
  const pick = (o) => (o && typeof o.ANTHROPIC_MODEL === 'string' ? o.ANTHROPIC_MODEL.trim() : '');
  return pick(environmentVariables) || pick(env) || pick(cliEnv) || String(lastReported || '').trim();
}

module.exports = {
  resolveOllamaUrl, normalizeModelName, windowFromPs, loadState, fetchPs, readOllama, ollamaModelName,
  rememberWindow, cachedWindow, clearWindowCache,
};
