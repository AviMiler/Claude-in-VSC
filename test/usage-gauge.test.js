const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const {
  resolveOllamaUrl, normalizeModelName, windowFromPs, fetchPs, readOllama, loadState, ollamaModelName,
  rememberWindow, cachedWindow, clearWindowCache,
} = require('../src/models/ollama');
const { gaugeWindow, windowNotice, contextDetail, describeUsage } = require('../src/panels/context-meter');
const L = require('../webview/chat/usage-gauge-logic');

test('resolveOllamaUrl: the setting is used as is; empty or off means no read (never derived)', () => {
  assert.strictEqual(resolveOllamaUrl({ ollamaUrl: 'http://o:9/' }), 'http://o:9');
  assert.strictEqual(resolveOllamaUrl({ ollamaUrl: 'OFF' }), '');
  assert.strictEqual(resolveOllamaUrl({ ollamaUrl: '' }), '');
  assert.strictEqual(resolveOllamaUrl({ gatewayUrl: 'http://172.27.5.5:11436' }), '');
});

test('normalizeModelName drops the [1m] suffix, a provider prefix and adds :latest', () => {
  assert.strictEqual(normalizeModelName('qwen3.8:27b[1m]'), 'qwen3.8:27b');
  assert.strictEqual(normalizeModelName('ollama_chat/Qwen3.8:27b'), 'qwen3.8:27b');
  assert.strictEqual(normalizeModelName('llama3'), 'llama3:latest');
  assert.strictEqual(normalizeModelName(''), '');
});

test('windowFromPs matches the current model; not loaded or empty gives null', () => {
  const ps = { models: [
    { name: 'gemma4:26b', model: 'gemma4:26b', context_length: 32000 },
    { name: 'qwen3.8:27b', model: 'qwen3.8:27b', context_length: 64000 },
  ] };
  assert.strictEqual(windowFromPs(ps, 'qwen3.8:27b[1m]'), 64000);
  assert.strictEqual(windowFromPs(ps, 'gemma4:26b'), 32000);
  assert.strictEqual(windowFromPs(ps, 'llama3'), null);
  assert.strictEqual(windowFromPs({ models: [] }, 'qwen3.8:27b'), null);
  assert.strictEqual(windowFromPs({ models: [{ name: 'qwen3.8:27b', context_length: 0 }] }, 'qwen3.8:27b'), null);
  assert.strictEqual(windowFromPs(null, 'qwen3.8:27b'), null);
});

// A local /api/ps; the body is a value or a function, every request is recorded.
async function psServer(body, seen = []) {
  const server = http.createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    if (req.url !== '/api/ps') { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(typeof body === 'function' ? body() : body));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

const QWEN = (extra = {}) => ({ name: 'qwen3.8:27b', model: 'qwen3.8:27b', context_length: 64000, ...extra });

test('fetchPs: one GET /api/ps; every failure resolves to ps null with a note, never rejects', async () => {
  const seen = [];
  const { server, base } = await psServer({ models: [QWEN()] }, seen);
  try {
    const ok = await fetchPs(base);
    assert.strictEqual(ok.note, 'ok');
    assert.strictEqual(ok.ps.models[0].context_length, 64000);
    assert.deepStrictEqual(seen, ['GET /api/ps']);
    assert.deepStrictEqual(await fetchPs(`${base}/nope`), { ps: null, note: 'HTTP 404' });
    assert.deepStrictEqual(await fetchPs(''), { ps: null, note: 'off' });
  } finally {
    server.close();
  }
  const down = await fetchPs('http://127.0.0.1:1');
  assert.strictEqual(down.ps, null);
  assert.match(down.note, /^unreachable/);
});

test('loadState: loaded with the unload time, permanent when far ahead, not loaded, unknown', () => {
  const now = Date.parse('2026-11-24T10:00:00Z');
  const ps = (...models) => ({ models });
  const at = (expires_at) => ps(QWEN({ expires_at }));
  assert.deepStrictEqual(loadState(at('2026-11-24T10:05:00Z'), 'qwen3.8:27b', now), { loaded: true, until: Date.parse('2026-11-24T10:05:00Z'), permanent: false });
  assert.deepStrictEqual(loadState(at('2026-11-24T12:05:00.123456789+02:00'), 'qwen3.8:27b[1m]', now), { loaded: true, until: Date.parse('2026-11-24T10:05:00.123Z'), permanent: false }, 'Ollama prints nanoseconds and an offset');
  assert.deepStrictEqual(loadState(at('2318-02-01T00:00:00Z'), 'qwen3.8:27b', now), { loaded: true, until: Date.parse('2318-02-01T00:00:00Z'), permanent: true }, 'keep_alive -1');
  assert.strictEqual(loadState(at('2027-11-24T09:59:00Z'), 'qwen3.8:27b', now).permanent, false, 'just under 365 days ahead');
  assert.strictEqual(loadState(at('2027-11-25T10:00:01Z'), 'qwen3.8:27b', now).permanent, true, 'just over 365 days ahead');
  assert.deepStrictEqual(loadState(at('2026-11-24T09:59:00Z'), 'qwen3.8:27b', now), { loaded: false }, 'an unload time already passed');
  assert.deepStrictEqual(loadState(ps(QWEN()), 'qwen3.8:27b', now), { loaded: true, until: null, permanent: false }, 'no unload time given');
  assert.deepStrictEqual(loadState(ps(QWEN({ expires_at: 'garbage' })), 'qwen3.8:27b', now), { loaded: true, until: null, permanent: false });
  assert.deepStrictEqual(loadState(ps({ name: 'gemma4:26b', context_length: 32000 }), 'qwen3.8:27b', now), { loaded: false });
  assert.deepStrictEqual(loadState({ models: [] }, 'qwen3.8:27b', now), { loaded: false });
  assert.strictEqual(loadState(null, 'qwen3.8:27b', now), null, 'Ollama unreachable');
  assert.strictEqual(loadState({}, 'qwen3.8:27b', now), null, 'not an /api/ps answer');
  assert.strictEqual(loadState(ps(QWEN()), '', now), null, 'model name unknown');
});

test('ollamaModelName: a chosen model as is; for the default: ANTHROPIC_MODEL (settings, process, CLI settings), then what the CLI reported', () => {
  const none = { environmentVariables: {}, env: {}, cliEnv: {}, lastReported: '' };
  assert.strictEqual(ollamaModelName('gemma4:26b', { ...none, environmentVariables: { ANTHROPIC_MODEL: 'x' } }), 'gemma4:26b');
  assert.strictEqual(ollamaModelName('default', { ...none, environmentVariables: { ANTHROPIC_MODEL: 'a' }, env: { ANTHROPIC_MODEL: 'b' }, cliEnv: { ANTHROPIC_MODEL: 'c' }, lastReported: 'd' }), 'a');
  assert.strictEqual(ollamaModelName('default', { ...none, env: { ANTHROPIC_MODEL: 'b' }, cliEnv: { ANTHROPIC_MODEL: 'c' }, lastReported: 'd' }), 'b');
  assert.strictEqual(ollamaModelName('default', { ...none, cliEnv: { ANTHROPIC_MODEL: 'c' }, lastReported: 'd' }), 'c');
  assert.strictEqual(ollamaModelName('default', { ...none, lastReported: 'qwen3.8:27b[1m]' }), 'qwen3.8:27b[1m]');
  assert.strictEqual(ollamaModelName('default', none), '');
  assert.strictEqual(ollamaModelName('default', { ...none, environmentVariables: { ANTHROPIC_MODEL: ' ' }, lastReported: 'd' }), 'd', 'a blank value is skipped');
});

test('window cache: per Ollama address and normalised model name; only positive integers; cleared on demand', () => {
  clearWindowCache();
  rememberWindow('http://o:1', 'qwen3.8:27b[1m]', 64000);
  assert.strictEqual(cachedWindow('http://o:1', 'ollama_chat/qwen3.8:27b'), 64000);
  assert.strictEqual(cachedWindow('http://o:2', 'qwen3.8:27b'), null, 'another server');
  assert.strictEqual(cachedWindow('http://o:1', 'gemma4:26b'), null, 'another model');
  rememberWindow('http://o:1', 'qwen3.8:27b', 0);
  rememberWindow('http://o:1', 'qwen3.8:27b', null);
  rememberWindow('', 'qwen3.8:27b', 1000);
  rememberWindow('http://o:1', '', 1000);
  assert.strictEqual(cachedWindow('http://o:1', 'qwen3.8:27b'), 64000, 'bad values change nothing');
  assert.strictEqual(cachedWindow('', 'qwen3.8:27b'), null);
  clearWindowCache();
  assert.strictEqual(cachedWindow('http://o:1', 'qwen3.8:27b'), null);
});

test('readOllama: one /api/ps feeds the window, the load state and the cache; failures give nulls', async () => {
  clearWindowCache();
  const seen = [];
  const soon = new Date(Date.now() + 3600e3).toISOString();
  const { server, base } = await psServer({ models: [QWEN({ expires_at: soon })] }, seen);
  try {
    const r = await readOllama(base, 'qwen3.8:27b[1m]');
    assert.deepStrictEqual(r, { window: 64000, load: { loaded: true, until: Date.parse(soon), permanent: false }, note: 'ok' });
    assert.deepStrictEqual(seen, ['GET /api/ps'], 'a single request');
    assert.strictEqual(cachedWindow(base, 'qwen3.8:27b'), 64000);
    const other = await readOllama(base, 'gemma4:26b');
    assert.deepStrictEqual(other, { window: null, load: { loaded: false }, note: 'gemma4:26b not loaded' });
    assert.strictEqual(cachedWindow(base, 'gemma4:26b'), null);
    assert.deepStrictEqual(await readOllama(base, ''), { window: null, load: null, note: 'no model name' });
    assert.deepStrictEqual(await readOllama('', 'qwen3.8:27b'), { window: null, load: null, note: 'off' });
    assert.strictEqual(seen.length, 2);
  } finally {
    server.close();
  }
  const down = await readOllama('http://127.0.0.1:1', 'qwen3.8:27b');
  assert.strictEqual(down.window, null);
  assert.strictEqual(down.load, null);
  assert.match(down.note, /^unreachable/);
});

test('gaugeWindow: a fresh Ollama value, then the cached one, then what the process started with, then the CLI', () => {
  const explicit = { window: 48000, source: 'explicit', real: null };
  const fallback = { window: 64000, source: 'fallback', real: null };
  assert.deepStrictEqual(gaugeWindow({ fresh: 32000, cached: 16000, launch: explicit }), { window: 32000, source: 'ollama' });
  assert.deepStrictEqual(gaugeWindow({ fresh: null, cached: 16000, launch: explicit }), { window: 16000, source: 'cached' });
  assert.deepStrictEqual(gaugeWindow({ fresh: null, cached: null, launch: explicit }), { window: 48000, source: 'explicit' });
  assert.deepStrictEqual(gaugeWindow({ fresh: null, cached: null, launch: fallback }), { window: 64000, source: 'fallback' });
  assert.deepStrictEqual(gaugeWindow({ fresh: null, cached: null, launch: null }), { window: null, source: 'cli' });
});

test('windowNotice: N1 when an explicit value differs from the real window, N2 when a started process differs; else none', () => {
  const explicit = { window: 48000, source: 'explicit', real: 32000 };
  const started = { window: 64000, source: 'fallback', real: null };
  assert.strictEqual(windowNotice(explicit, 32000), 'הגדרתם חלון של 48,000 אסימונים, אבל החלון האמיתי של המודל ב-Ollama הוא 32,000. נשאר הערך שהגדרתם.');
  assert.strictEqual(windowNotice(started, 32768), 'החלון האמיתי של המודל הוא 32,768 אסימונים (Claude Code הופעל עם 64,000). השינוי יחול מההפעלה הבאה.');
  assert.strictEqual(windowNotice({ ...explicit, window: 32000 }, 32000), null, 'explicit and equal');
  assert.strictEqual(windowNotice(started, 64000), null);
  assert.strictEqual(windowNotice(started, null), null, 'real window unknown');
  assert.strictEqual(windowNotice(null, 32000), null);
});

test('contextDetail keeps valid categories and counts memory files and MCP servers', () => {
  const d = contextDetail({
    categories: [
      { name: 'Messages', tokens: 1200.4, color: 'x' },
      { name: 'System tools', tokens: 900, isDeferred: true },
      { name: 'bad', tokens: -1 },
      { tokens: 5 },
    ],
    memoryFiles: [{ path: 'a' }, { path: 'b' }],
    mcpTools: [{ name: 't1', serverName: 's1' }, { name: 't2', serverName: 's1' }, { name: 't3', serverName: 's2' }],
  });
  assert.deepStrictEqual(d.categories, [{ name: 'Messages', tokens: 1200, deferred: false }, { name: 'System tools', tokens: 900, deferred: true }]);
  assert.strictEqual(d.memoryFiles, 2);
  assert.strictEqual(d.mcpServers, 2);
  assert.deepStrictEqual(contextDetail({}), { categories: [], memoryFiles: null, mcpServers: null, mcpDetail: [] });
  assert.deepStrictEqual(contextDetail(null), { categories: [], memoryFiles: null, mcpServers: null, mcpDetail: [] });
});

test('contextDetail: MCP and system tools tokens come from the per-tool lists when the categories omit them', () => {
  const d = contextDetail({
    categories: [{ name: 'Messages', tokens: 100 }, { name: '  ', tokens: 5 }, { name: null, tokens: 5 }],
    mcpTools: [
      { name: 'a', serverName: 'claude-local-nav', tokens: 300, isLoaded: true },
      { name: 'b', serverName: 'claude-local-nav', tokens: 200 },
      { name: 'c', serverName: 'claude-local-nav', tokens: 50, isLoaded: false },
      { name: 'd', serverName: 'x' },
    ],
    systemTools: [{ name: 'Read', tokens: 400 }, { name: 'Bad' }],
  });
  assert.deepStrictEqual(d.mcpDetail, [{ name: 'claude-local-nav', tokens: 500, deferredTokens: 50, tools: 3 }]);
  assert.deepStrictEqual(d.categories, [
    { name: 'Messages', tokens: 100, deferred: false },
    { name: 'MCP tools', tokens: 500, deferred: false },
    { name: 'MCP tools', tokens: 50, deferred: true },
    { name: 'System tools', tokens: 400, deferred: false },
  ]);
  // Not duplicated when the CLI already reports the categories.
  const e = contextDetail({ categories: [{ name: 'MCP tools', tokens: 500 }, { name: 'System tools', tokens: 400 }], mcpTools: [{ serverName: 's', tokens: 500 }], systemTools: [{ tokens: 400 }] });
  assert.deepStrictEqual(e.categories.map((c) => c.name), ['MCP tools', 'System tools']);
});

test('describeUsage: one compact line with categories, keys and tool totals; short for any input', () => {
  const line = describeUsage({ totalTokens: 1, categories: [{ name: 'Messages', tokens: 22090 }, { name: 'MCP tools', tokens: 5, isDeferred: true }], mcpTools: [{ tokens: 10 }, { tokens: 20 }] });
  assert.strictEqual(line, 'categories: Messages=22090, MCP tools(deferred)=5 | keys: totalTokens,categories,mcpTools | mcpTools: 2 tools 30');
  assert.strictEqual(describeUsage(null), 'categories: - | keys: -');
  assert.ok(describeUsage({ categories: Array.from({ length: 80 }, (_, i) => ({ name: `C${i}`, tokens: i })) }).length <= 400);
});

test('breakdown: MCP tools row and per-server detail; nameless categories are dropped', () => {
  const b = L.breakdown({
    used: 3000, max: 64000,
    categories: [{ name: 'Messages', tokens: 2000 }, { name: 'MCP tools', tokens: 1000 }, { name: null, tokens: 7 }, { name: '', tokens: 7 }],
    mcpDetail: [{ name: 'claude-local-nav', tokens: 1000, deferredTokens: 0, tools: 4 }, { name: '', tokens: 0, deferredTokens: 40 }, null],
  });
  assert.deepStrictEqual(b.rows.map((r) => r.label), ['הודעות', 'כלי MCP', 'מקום פנוי']);
  assert.deepStrictEqual(b.mcp, [
    { label: 'שרת MCP: claude-local-nav', tokens: 1000 },
    { label: 'שרת MCP: ללא שם (לפי הצורך)', tokens: 40 },
  ]);
  assert.deepStrictEqual(L.breakdown({ used: 1, max: 10 }).mcp, []);
  for (const r of b.rows) assert.ok(!/null|undefined/.test(r.label));
});

test('gauge level: orange from 70%, red from 85%', () => {
  assert.strictEqual(L.percent(23400, 64000), 37);
  assert.strictEqual(L.percent(90000, 64000), 100);
  assert.strictEqual(L.percent(1, 0), 0);
  assert.strictEqual(L.level(69), 'ok');
  assert.strictEqual(L.level(70), 'warn');
  assert.strictEqual(L.level(84), 'warn');
  assert.strictEqual(L.level(85), 'danger');
});

test('breakdown: Hebrew rows in order, buffer and free space recomputed against the real window', () => {
  const b = L.breakdown({
    used: 20000, max: 64000,
    categories: [
      { name: 'System tools', tokens: 11000 },
      { name: 'Messages', tokens: 5000 },
      { name: 'System prompt', tokens: 3000 },
      { name: 'Memory files', tokens: 1000 },
      { name: 'Custom thing', tokens: 0 },
      { name: 'System tools', tokens: 7000, deferred: true },
      { name: 'Autocompact buffer', tokens: 13000 },
      { name: 'Free space', tokens: 950000 },
    ],
  });
  assert.deepStrictEqual(b.rows.map((r) => r.key), ['messages', 'system-prompt', 'system-tools', 'memory', 'buffer', 'free']);
  assert.deepStrictEqual(b.rows.map((r) => r.label), ['הודעות', 'הנחיית מערכת', 'כלי מערכת', 'קובצי זיכרון', 'שמור לכיווץ אוטומטי', 'מקום פנוי']);
  assert.strictEqual(b.rows.find((r) => r.key === 'free').tokens, 64000 - 20000 - 13000);
  assert.strictEqual(b.rows[0].pct, '7.8%');
  assert.deepStrictEqual(b.deferred, [{ label: 'כלי מערכת שנטענים לפי הצורך', tokens: 7000 }]);
  assert.strictEqual(b.pct, 31);
  assert.strictEqual(b.level, 'ok');
  // The bar: every row but free, widths in percent of the window.
  const seg = L.segments(b.rows, b.max);
  assert.deepStrictEqual(seg.map((s) => s.key), ['messages', 'system-prompt', 'system-tools', 'memory', 'buffer']);
  assert.ok(Math.abs(seg.reduce((a, s) => a + s.width, 0) - ((20000 + 13000) / 64000) * 100) < 1e-9);
});

test('breakdown: the buffer never exceeds the room left; unknown names pass through; no categories', () => {
  const full = L.breakdown({ used: 60000, max: 64000, categories: [{ name: 'Messages', tokens: 60000 }, { name: 'Autocompact buffer', tokens: 13000 }, { name: 'Weird', tokens: 5 }] });
  assert.strictEqual(full.rows.find((r) => r.key === 'buffer').tokens, 4000);
  assert.strictEqual(full.rows.find((r) => r.key === 'free').tokens, 0);
  assert.strictEqual(full.rows.find((r) => r.key === 'other').label, 'Weird');
  assert.strictEqual(full.rows.find((r) => r.key === 'other').pct, '<0.1%');
  assert.strictEqual(full.level, 'danger');
  const bare = L.breakdown({ used: 23400, max: 64000, categories: [] });
  assert.deepStrictEqual(bare.rows.map((r) => [r.label, r.tokens]), [['בשימוש', 23400], ['מקום פנוי', 40600]]);
  assert.strictEqual(L.breakdown({ used: 1, max: 0 }), null);
  assert.strictEqual(L.breakdown(null), null);
});

test('facts, source and accessible label texts', () => {
  assert.strictEqual(L.factsLine(2, 1), 'קובצי זיכרון: 2 · שרתי MCP מחוברים: 1');
  assert.strictEqual(L.factsLine(null, null), '');
  assert.match(L.sourceText('ollama'), /Ollama/);
  assert.match(L.sourceText('explicit'), /הגדרתם/);
  assert.match(L.sourceText('cached'), /אחרון/);
  assert.match(L.sourceText('fallback'), /64,000/);
  const distinct = new Set(['ollama', 'explicit', 'cached', 'fallback', 'cli'].map(L.sourceText));
  assert.strictEqual(distinct.size, 5, 'every source has its own text');
  assert.strictEqual(L.sourceText('nope'), L.sourceText('cli'));
  assert.strictEqual(L.gaugeLabel(23400, 64000), 'הקשר בשימוש: 37% (23,400 מתוך 64,000 אסימונים). לחיצה לפירוט');
});

test('loadChangeIn: the wait until the unload time passes, else null (nothing to schedule)', () => {
  const now = new Date(2026, 10, 24, 10, 0).getTime();
  assert.strictEqual(L.loadChangeIn({ loaded: true, until: now + 300000, permanent: false }, now), 300000);
  assert.strictEqual(L.loadChangeIn({ loaded: true, until: now - 1, permanent: false }, now), null, 'already passed');
  assert.strictEqual(L.loadChangeIn({ loaded: true, until: now + 400 * 86400e3, permanent: true }, now), null, 'permanent');
  assert.strictEqual(L.loadChangeIn({ loaded: true, until: null, permanent: false }, now), null);
  assert.strictEqual(L.loadChangeIn({ loaded: false }, now), null);
  assert.strictEqual(L.loadChangeIn(null, now), null);
});

test('hhmm: local time with two digits', () => {
  assert.strictEqual(L.hhmm(new Date(2026, 10, 24, 9, 5).getTime()), '09:05');
  assert.strictEqual(L.hhmm(new Date(2026, 10, 24, 23, 59, 59).getTime()), '23:59');
  assert.strictEqual(L.hhmm(new Date(2026, 10, 24, 0, 0).getTime()), '00:00');
});

test('loadText and loadTitle: loaded until a time, permanent, not loaded (also once the time passed), hidden', () => {
  const now = new Date(2026, 10, 24, 10, 0).getTime();
  const until = new Date(2026, 10, 24, 10, 5).getTime();
  assert.strictEqual(L.loadText({ loaded: true, until, permanent: false }, now), 'טעון עד 10:05');
  assert.strictEqual(L.loadTitle({ loaded: true, until, permanent: false }, now), 'המודל טעון בזיכרון השרת. אם לא יהיה בו שימוש, Ollama יפרוק אותו בשעה 10:05.');
  assert.strictEqual(L.loadText({ loaded: true, until: now + 400 * 86400e3, permanent: true }, now), 'טעון קבוע');
  assert.match(L.loadTitle({ loaded: true, until: now + 400 * 86400e3, permanent: true }, now), /יישאר טעון/);
  assert.strictEqual(L.loadText({ loaded: true, until: null, permanent: false }, now), 'טעון');
  assert.strictEqual(L.loadText({ loaded: false }, now), 'לא טעון');
  assert.strictEqual(L.loadTitle({ loaded: false }, now), 'המודל לא טעון כרגע. הבקשה הבאה תטען אותו, וזה עשוי לקחת זמן.');
  assert.strictEqual(L.loadText({ loaded: true, until: now - 1, permanent: false }, now), 'לא טעון', 'a replayed old message');
  assert.strictEqual(L.loadTitle({ loaded: true, until: now - 1, permanent: false }, now), L.loadTitle({ loaded: false }, now));
  assert.strictEqual(L.loadText(null, now), '');
  assert.strictEqual(L.loadText(undefined, now), '');
  assert.strictEqual(L.loadTitle(null, now), '');
});
