const test = require('node:test');
const assert = require('node:assert');
const { redact, formatLine, shouldLog, createBuffer, MAX_LINE } = require('../src/util/log-buffer');

test('redact masks keys, bearer tokens and env-style secrets', () => {
  assert.strictEqual(redact('key sk-abcdefgh12345 end'), 'key *** end');
  assert.strictEqual(redact('Authorization: Bearer abc.def-ghi12345'), 'Authorization: ***');
  assert.strictEqual(redact('ANTHROPIC_AUTH_TOKEN=xyz123 ok'), '*** ok');
  assert.strictEqual(redact('API_KEY: hunter2'), '***');
});

test('redact keeps one line and cuts long text', () => {
  assert.strictEqual(redact('a\nb\r\nc'), 'a b c');
  const out = redact('x'.repeat(MAX_LINE + 10));
  assert.ok(out.endsWith(`(${MAX_LINE + 10} chars)`));
});

test('formatLine has timestamp, level mark and tag', () => {
  const d = new Date(2026, 0, 1, 9, 8, 7, 6);
  assert.strictEqual(formatLine(d, 'info', 'spawn', 'x'), '09:08:07.006 [spawn] x');
  assert.strictEqual(formatLine(d, 'warn', 'mcp', 'x'), '09:08:07.006 WARN [mcp] x');
});

test('shouldLog hides debug unless the level is debug', () => {
  assert.strictEqual(shouldLog('debug', 'info'), false);
  assert.strictEqual(shouldLog('debug', undefined), false);
  assert.strictEqual(shouldLog('debug', 'debug'), true);
  assert.strictEqual(shouldLog('info', 'info'), true);
  assert.strictEqual(shouldLog('error', 'info'), true);
});

test('buffer keeps only the newest lines', () => {
  const b = createBuffer(3);
  for (const l of ['1', '2', '3', '4']) b.push(l);
  assert.strictEqual(b.text(), '2\n3\n4');
  assert.strictEqual(b.size(), 3);
});
