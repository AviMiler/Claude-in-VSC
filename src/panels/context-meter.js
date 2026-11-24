// Usage gauge (the context meter): how full the model's window is now, with a breakdown per
// category for the card (PLAN.md section 9, "Usage gauge in the prompt line"), and the model's load
// state in Ollama (the L-1 indicator, PLAN.md section 11).
// Usage comes from the control request `get_context_usage` (DEPENDENCIES.md section 2 #16):
// `totalTokens`, `maxTokens`, `model`, `categories`, `memoryFiles`, `mcpTools`.
// The window is the model's REAL one from Ollama's /api/ps (src/models/ollama.js), read at conversation
// open, before a model switch and after each result; the CLI is started with it (launchWindowFor ->
// src/models/launch.js) unless the user set CLAUDE_CODE_MAX_CONTEXT_TOKENS. The gauge shows the real
// window when known, else the last one seen, else the window the CLI was started with, else the CLI's
// own maxTokens. One /api/ps answer feeds both the window and the load state.
const { pickLaunchWindow } = require('../models/launch');
const { resolveOllamaUrl, readOllama, cachedWindow, ollamaModelName } = require('../models/ollama');
const { readCliSettingsEnv } = require('../models/gateway');

const TIMEOUT_MS = 15000;

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');

// Pure: the response to { used, max, cliMax, model } or null when it does not carry both numbers.
// window: the model's window when known (a positive integer) or null; it is the maximum whatever the
// CLI's own maxTokens says, which stays only as the last resort and as cliMax.
function parseContextUsage(response, window = null) {
  const used = response && response.totalTokens;
  const cliMax = response && response.maxTokens;
  if (!(Number.isFinite(used) && Number.isFinite(cliMax) && cliMax > 0)) return null;
  return { used, max: window || cliMax, cliMax, model: typeof response.model === 'string' ? response.model : '' };
}

// Pure: which window the gauge shows and why. fresh: from this /api/ps answer; cached: the last one
// seen for the model; launch: what the process was started with ({ window, source } or null).
function gaugeWindow({ fresh = null, cached = null, launch = null } = {}) {
  if (fresh) return { window: fresh, source: 'ollama' };
  if (cached) return { window: cached, source: 'cached' };
  if (launch && launch.window) return { window: launch.window, source: launch.source };
  return { window: null, source: 'cli' };
}

// Pure: the Hebrew notice when the real window differs from what the CLI runs with, else null.
// N1: the user set a window (it stays). N2: the CLI got the fallback or an older value; applies at the next start.
function windowNotice(launch, real) {
  if (!launch || !real || real === launch.window) return null;
  if (launch.source === 'explicit') {
    return `הגדרתם חלון של ${fmt(launch.window)} אסימונים, אבל החלון האמיתי של המודל ב-Ollama הוא ${fmt(real)}. נשאר הערך שהגדרתם.`;
  }
  return `החלון האמיתי של המודל הוא ${fmt(real)} אסימונים (Claude Code הופעל עם ${fmt(launch.window)}). השינוי יחול מההפעלה הבאה.`;
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

// Whether a conversation should read /api/ps before starting its CLI: only when the read is on.
function needsWindowRead(settings) {
  return Boolean(resolveOllamaUrl({ ollamaUrl: settings && settings.ollamaUrl }));
}

// The model name to look up in /api/ps for `model` (see ollamaModelName); '' when unknown.
function lookupName(conv, settings, model = conv.model) {
  return ollamaModelName(model, {
    environmentVariables: settings.environmentVariables,
    env: process.env,
    cliEnv: readCliSettingsEnv(),
    lastReported: conv.lastReportedModel,
  });
}

// Reads /api/ps for the model (default: the conversation's) and fills the window cache. Never rejects:
// { window, load, note, base, name }, nulls when the read is off or fails.
async function readWindow(conv, model = conv.model) {
  const logger = conv.services.logger;
  try {
    const settings = conv.services.settings.get();
    const base = resolveOllamaUrl(settings);
    const name = lookupName(conv, settings, model);
    const read = await readOllama(base, name);
    if (base) logger.info('context', `ollama /api/ps: ${read.note} (model ${name || '?'})`);
    return { ...read, base, name };
  } catch (err) {
    logger.warn('context', `ollama read failed: ${err.message}`);
    return { window: null, load: null, note: 'failed', base: '', name: '' };
  }
}

// Synchronous: the window for the next CLI start from the settings and the cache only (a read is
// started elsewhere: conversation open, before a model switch). { window, source, real }.
function launchWindowFor(conv) {
  const settings = conv.services.settings.get();
  const base = resolveOllamaUrl(settings);
  const real = base ? cachedWindow(base, lookupName(conv, settings)) : null;
  return pickLaunchWindow({ explicit: settings.explicitWindow || null, real });
}

// Posts the "window differs" notice (windowNotice) once per process and text; conv.launch is what the process got.
function announceWindow(conv, real) {
  const text = windowNotice(conv.launch, real);
  if (!text || conv.windowNoticed.has(text)) return;
  conv.windowNoticed.add(text);
  conv.post({ type: 'notice', text });
}

// Asks the CLI, reads /api/ps once, then posts { type: 'context', used, max, source, ...detail, ollama }
// to the webview (ollama: null = unknown/hidden, { loaded: false }, or { loaded: true, until, permanent }
// for the L-1 indicator); failures are only logged.
// Called after `initialize` (also after a model switch, which restarts the CLI) and after each result.
function refreshContextMeter(conversation) {
  const proc = conversation.proc;
  if (!proc) return;
  const logger = conversation.services.logger;
  proc.request('get_context_usage', {}, TIMEOUT_MS).then(
    async (response) => {
      logger.info('context', describeUsage(response));
      if (response && typeof response.model === 'string' && response.model) conversation.lastReportedModel = response.model;
      const read = await readWindow(conversation);
      if (proc !== conversation.proc) return;
      const cached = read.base ? cachedWindow(read.base, read.name) : null;
      const { window, source } = gaugeWindow({ fresh: read.window, cached, launch: conversation.launch });
      const usage = parseContextUsage(response, window);
      if (!usage) return;
      const capped = usage.max !== usage.cliMax ? ` (CLI max=${usage.cliMax})` : '';
      logger.info('context', `used=${usage.used} max=${usage.max} source=${source}${capped} model=${usage.model || '?'}`);
      announceWindow(conversation, read.window);
      conversation.post({ type: 'context', used: usage.used, max: usage.max, source, ...contextDetail(response), ollama: read.load });
    },
    (err) => logger.warn('context', `get_context_usage failed: ${err.message}`),
  ).catch((err) => logger.warn('context', `usage gauge failed: ${err.message}`));
}

module.exports = {
  parseContextUsage, gaugeWindow, windowNotice, contextDetail, describeUsage,
  needsWindowRead, readWindow, launchWindowFor, announceWindow, refreshContextMeter,
};
