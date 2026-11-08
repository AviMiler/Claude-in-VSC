const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { resolveOllamaUrl, normalizeModelName, windowFromPs, fetchOllamaWindow } = require('../src/models/ollama');
const { pickWindow, contextDetail } = require('../src/panels/context-meter');
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

test('fetchOllamaWindow: GET /api/ps, and every failure resolves to null with a note', async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    if (req.url !== '/api/ps') { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ models: [{ name: 'qwen3.8:27b', model: 'qwen3.8:27b', context_length: 64000 }] }));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.deepStrictEqual(await fetchOllamaWindow(base, 'qwen3.8:27b'), { window: 64000, note: 'ok' });
    assert.deepStrictEqual(await fetchOllamaWindow(base, 'gemma4:26b'), { window: null, note: 'gemma4:26b not loaded' });
    assert.deepStrictEqual(seen, ['GET /api/ps', 'GET /api/ps']);
    assert.strictEqual((await fetchOllamaWindow(`${base}/nope`, 'qwen3.8:27b')).note, 'HTTP 404');
    assert.strictEqual((await fetchOllamaWindow('', 'qwen3.8:27b')).note, 'off');
  } finally {
    server.close();
  }
  const down = await fetchOllamaWindow('http://127.0.0.1:1', 'qwen3.8:27b');
  assert.strictEqual(down.window, null);
  assert.match(down.note, /^unreachable/);
});

test('pickWindow: Ollama, then the configured window, then the CLI', () => {
  assert.deepStrictEqual(pickWindow(64000, 32000), { window: 64000, source: 'ollama' });
  assert.deepStrictEqual(pickWindow(null, 32000), { window: 32000, source: 'settings' });
  assert.deepStrictEqual(pickWindow(null, null), { window: null, source: 'cli' });
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
  assert.deepStrictEqual(contextDetail({}), { categories: [], memoryFiles: null, mcpServers: null });
  assert.deepStrictEqual(contextDetail(null), { categories: [], memoryFiles: null, mcpServers: null });
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
  assert.match(L.sourceText('settings'), /לפי ההגדרות/);
  assert.strictEqual(L.sourceText('nope'), L.sourceText('cli'));
  assert.strictEqual(L.gaugeLabel(23400, 64000), 'הקשר בשימוש: 37% (23,400 מתוך 64,000 אסימונים). לחיצה לפירוט');
});
