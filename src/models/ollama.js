// The real context window of the loaded model, read from Ollama's `GET /api/ps`
// (`models[].context_length`; measured on the user's machine: qwen3.8:27b = 64000). Used only by the
// usage gauge (src/panels/context-meter.js). A network read outside the gateway: recorded in
// DECISIONS.md (2026-11-08, "usage gauge: Ollama /api/ps"), pending the user's confirmation.
// GET only, nothing stored on disk, short timeout; any failure returns null and the gauge falls back
// to the configured window, then the CLI's own value.

const TIMEOUT_MS = 2000;

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

// Pure: the context_length of the /api/ps entry whose name (or model) matches, else null.
function windowFromPs(ps, model) {
  const want = normalizeModelName(model);
  const list = ps && Array.isArray(ps.models) ? ps.models : [];
  if (!want) return null;
  for (const m of list) {
    if (!m || typeof m !== 'object') continue;
    if (normalizeModelName(m.name) !== want && normalizeModelName(m.model) !== want) continue;
    const n = m.context_length;
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  return null;
}

// Resolves to { window, note }: window is a positive integer or null, note says why for the log.
// Never rejects.
async function fetchOllamaWindow(baseUrl, model, fetchImpl = fetch) {
  if (!baseUrl) return { window: null, note: 'off' };
  if (!model) return { window: null, note: 'no model name' };
  try {
    const res = await fetchImpl(`${baseUrl}/api/ps`, { method: 'GET', signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return { window: null, note: `HTTP ${res.status}` };
    const window = windowFromPs(await res.json(), model);
    return { window, note: window ? 'ok' : `${normalizeModelName(model)} not loaded` };
  } catch (err) {
    return { window: null, note: `unreachable (${err && err.name === 'TimeoutError' ? 'timeout' : (err && err.message) || err})` };
  }
}

module.exports = { resolveOllamaUrl, normalizeModelName, windowFromPs, fetchOllamaWindow };
