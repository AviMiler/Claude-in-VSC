// Usage gauge (the context meter): how full the model's window is now, with a breakdown per
// category for the card (PLAN.md section 9, "Usage gauge in the prompt line").
// Usage comes from the control request `get_context_usage` (DEPENDENCIES.md section 2 #16):
// `totalTokens`, `maxTokens`, `model`, `categories`, `memoryFiles`, `mcpTools`.
// The window, in order: the real one from Ollama's /api/ps for the loaded model
// (src/models/ollama.js), else CLAUDE_CODE_MAX_CONTEXT_TOKENS from claudeLocal.environmentVariables
// (src/models/launch.js passes it with CLAUDE_CODE_DISABLE_1M_CONTEXT), else the CLI's maxTokens.
// The window is a ceiling on the CLI's maxTokens, so a CLI that still assumes 1M for a
// "<model>[1m]" name (CHANGELOG F-9) cannot make the gauge show 1,000,000.
const { contextWindow } = require('../models/launch');
const { resolveOllamaUrl, normalizeModelName, fetchOllamaWindow } = require('../models/ollama');

const TIMEOUT_MS = 15000;

// The last real window seen per model, in memory only: Ollama unloads an idle model (keep_alive),
// and its window does not change while it is unloaded.
const lastOllamaWindow = new Map();

// Pure: the response to { used, max, cliMax, model } or null when it does not carry both numbers.
// window: the window to cap at (a positive integer) or null.
function parseContextUsage(response, window = null) {
  const used = response && response.totalTokens;
  const cliMax = response && response.maxTokens;
  if (!(Number.isFinite(used) && Number.isFinite(cliMax) && cliMax > 0)) return null;
  const max = window && window < cliMax ? window : cliMax;
  return { used, max, cliMax, model: typeof response.model === 'string' ? response.model : '' };
}

// Pure: which window applies. ollama and configured are positive integers or null.
function pickWindow(ollama, configured) {
  if (ollama) return { window: ollama, source: 'ollama' };
  if (configured) return { window: configured, source: 'settings' };
  return { window: null, source: 'cli' };
}

// Pure: the card's data from the response, defensively (the shape is the CLI's, not ours):
// categories [{ name, tokens, deferred }], memoryFiles (count or null), mcpServers (count or null).
function contextDetail(response) {
  const r = response && typeof response === 'object' ? response : {};
  const categories = (Array.isArray(r.categories) ? r.categories : [])
    .filter((c) => c && typeof c.name === 'string' && Number.isFinite(c.tokens) && c.tokens >= 0)
    .map((c) => ({ name: c.name, tokens: Math.round(c.tokens), deferred: c.isDeferred === true }));
  const memoryFiles = Array.isArray(r.memoryFiles) ? r.memoryFiles.length : null;
  const mcpServers = Array.isArray(r.mcpTools)
    ? new Set(r.mcpTools.map((t) => t && t.serverName).filter((s) => typeof s === 'string' && s)).size
    : null;
  return { categories, memoryFiles, mcpServers };
}

// The real window for the model, from Ollama or the last value seen this window; null when unknown.
async function realWindow(settings, model, logger) {
  const base = resolveOllamaUrl({ ollamaUrl: settings.ollamaUrl });
  if (!base) return null; // the read is off (setting empty or 'off')
  const key = `${base} ${normalizeModelName(model)}`;
  const { window, note } = await fetchOllamaWindow(base, model);
  if (window) {
    lastOllamaWindow.set(key, window);
    return window;
  }
  const cached = lastOllamaWindow.get(key) || null;
  logger.info('context', `ollama /api/ps: ${note}${cached ? `, using the last seen window ${cached}` : ''}`);
  return cached;
}

// Asks the CLI, then posts { type: 'context', used, max, source, ...detail } to the webview;
// failures are only logged. The configured window is read from the settings now; a changed setting
// applies to the CLI from the next process start, so the two can differ only until then.
// Called after `initialize` (also after a model switch, which restarts the CLI) and after each result.
function refreshContextMeter(conversation) {
  const proc = conversation.proc;
  if (!proc) return;
  const logger = conversation.services.logger;
  proc.request('get_context_usage', {}, TIMEOUT_MS).then(
    async (response) => {
      const settings = conversation.services.settings.get();
      const model = (response && typeof response.model === 'string' && response.model) || conversation.model;
      const ollama = await realWindow(settings, model, logger);
      const { window, source: wanted } = pickWindow(ollama, contextWindow(settings.environmentVariables));
      const usage = parseContextUsage(response, window);
      if (!usage || proc !== conversation.proc) return;
      const source = window && usage.max === window ? wanted : 'cli';
      const capped = usage.max !== usage.cliMax ? ` (CLI max=${usage.cliMax}, capped)` : '';
      logger.info('context', `used=${usage.used} max=${usage.max} source=${source}${capped} model=${usage.model || '?'}`);
      conversation.post({ type: 'context', used: usage.used, max: usage.max, source, ...contextDetail(response) });
    },
    (err) => logger.warn('context', `get_context_usage failed: ${err.message}`),
  ).catch((err) => logger.warn('context', `usage gauge failed: ${err.message}`));
}

module.exports = { parseContextUsage, pickWindow, contextDetail, refreshContextMeter };
