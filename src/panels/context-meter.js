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
    .filter((c) => c && typeof c.name === 'string' && c.name.trim() && Number.isFinite(c.tokens) && c.tokens >= 0)
    .map((c) => ({ name: c.name, tokens: Math.round(c.tokens), deferred: c.isDeferred === true }));
  const memoryFiles = Array.isArray(r.memoryFiles) ? r.memoryFiles.length : null;
  const mcpTools = Array.isArray(r.mcpTools) ? r.mcpTools.filter((t) => t && typeof t === 'object') : null;
  const mcpServers = mcpTools
    ? new Set(mcpTools.map((t) => t.serverName).filter((s) => typeof s === 'string' && s)).size
    : null;
  // Per-server token totals from the per-tool list (when the CLI gives tokens per tool); a tool with
  // isLoaded === false is deferred (not in the window until loaded).
  const byServer = new Map();
  for (const t of mcpTools || []) {
    if (!Number.isFinite(t.tokens) || t.tokens <= 0) continue;
    const name = typeof t.serverName === 'string' && t.serverName ? t.serverName : '';
    const s = byServer.get(name) || { name, tokens: 0, deferredTokens: 0, tools: 0 };
    if (t.isLoaded === false) s.deferredTokens += Math.round(t.tokens);
    else s.tokens += Math.round(t.tokens);
    s.tools += 1;
    byServer.set(name, s);
  }
  const mcpDetail = [...byServer.values()];
  // A category the CLI left out but whose per-tool list carries tokens is added from that list.
  const has = (name, deferred) => categories.some((c) => c.name.toLowerCase().replace(/\s*\(deferred\)$/, '') === name && c.deferred === deferred);
  const sum = (list) => list.reduce((a, n) => a + n, 0);
  const mcpLoaded = sum(mcpDetail.map((s) => s.tokens));
  const mcpDeferred = sum(mcpDetail.map((s) => s.deferredTokens));
  if (mcpLoaded > 0 && !has('mcp tools', false)) categories.push({ name: 'MCP tools', tokens: mcpLoaded, deferred: false });
  if (mcpDeferred > 0 && !has('mcp tools', true)) categories.push({ name: 'MCP tools', tokens: mcpDeferred, deferred: true });
  const sysTokens = sum((Array.isArray(r.systemTools) ? r.systemTools : [])
    .map((t) => (t && Number.isFinite(t.tokens) && t.tokens > 0 ? Math.round(t.tokens) : 0)));
  if (sysTokens > 0 && !has('system tools', false)) categories.push({ name: 'System tools', tokens: sysTokens, deferred: false });
  return { categories, memoryFiles, mcpServers, mcpDetail };
}

// Pure: one compact diagnostic line of the raw response (names and sizes only, no content), so the
// real shape can be read from the log: categories as name=tokens, top-level keys, MCP tools count/tokens.
function describeUsage(response) {
  const r = response && typeof response === 'object' ? response : {};
  const cats = (Array.isArray(r.categories) ? r.categories : [])
    .map((c) => `${c && c.name}${c && c.isDeferred ? '(deferred)' : ''}=${c && c.tokens}`).join(', ');
  const parts = [`categories: ${cats || '-'}`, `keys: ${Object.keys(r).join(',') || '-'}`];
  if (Array.isArray(r.mcpTools)) {
    const total = r.mcpTools.reduce((a, t) => a + (t && Number.isFinite(t.tokens) ? t.tokens : 0), 0);
    parts.push(`mcpTools: ${r.mcpTools.length} tools ${total}`);
  }
  if (Array.isArray(r.systemTools)) {
    const total = r.systemTools.reduce((a, t) => a + (t && Number.isFinite(t.tokens) ? t.tokens : 0), 0);
    parts.push(`systemTools: ${r.systemTools.length} tools ${total}`);
  }
  const line = parts.join(' | ');
  return line.length > 400 ? `${line.slice(0, 397)}...` : line;
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
      logger.info('context', describeUsage(response));
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

module.exports = { parseContextUsage, pickWindow, contextDetail, describeUsage, refreshContextMeter };
