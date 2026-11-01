const test = require('node:test');
const assert = require('node:assert');
const { buildErrorCard, isWrapper, safeUrl } = require('../src/panels/error-card');
const { parseOpenUri, previewPrompt, PROMPT_MAX } = require('../src/uri/uri-parse');

test('safeUrl drops credentials and query', () => {
  assert.strictEqual(safeUrl('http://u:p@host:4000/v1?key=1'), 'http://host:4000/v1');
  assert.strictEqual(safeUrl('http://host:4000/'), 'http://host:4000');
  assert.strictEqual(safeUrl(''), '');
});

test('isWrapper: .cmd/.bat only on Windows', () => {
  assert.strictEqual(isWrapper('C:\\x\\claude.cmd', {}, 'win32'), true);
  assert.strictEqual(isWrapper('C:\\x\\claude.BAT', {}, 'win32'), true);
  assert.strictEqual(isWrapper('C:\\x\\claude-bin.exe', {}, 'win32'), false);
  assert.strictEqual(isWrapper('/x/claude.cmd', {}, 'linux'), false);
});

test('error card: base URL line, wrapper warning with claudePath button, always a settings.json button', () => {
  const plain = buildErrorCard({ claudePath: 'C:\\x\\claude-bin.exe', env: { ANTHROPIC_BASE_URL: 'http://h:4000' }, platform: 'win32' });
  assert.ok(plain.checks[0].includes('http://h:4000'));
  assert.strictEqual(plain.warning, '');
  assert.deepStrictEqual(plain.buttons.map((b) => b.target), ['json']);
  const wrapped = buildErrorCard({ claudePath: 'C:\\x\\claude.cmd', env: {}, platform: 'win32' });
  assert.ok(wrapped.warning);
  assert.deepStrictEqual(wrapped.buttons.map((b) => b.target), ['claudePath', 'json']);
  assert.ok(wrapped.checks[0].includes('לא מוגדר'));
});

test('parseOpenUri reads prompt and session, caps the prompt, rejects bad input', () => {
  assert.deepStrictEqual(parseOpenUri('/open', 'prompt=hi%20there&session=abc-12345678'), { prompt: 'hi there', session: 'abc-12345678' });
  assert.strictEqual(parseOpenUri('/open', `prompt=${'a'.repeat(PROMPT_MAX + 50)}`).prompt.length, PROMPT_MAX);
  assert.strictEqual(parseOpenUri('/other', '').error, 'unknown-path');
  assert.strictEqual(parseOpenUri('/open', 'session=../x').error, 'bad-session');
  assert.deepStrictEqual(parseOpenUri('/open', ''), { prompt: '', session: '' });
});

test('previewPrompt flattens whitespace and truncates', () => {
  assert.strictEqual(previewPrompt('a\n\n b'), 'a b');
  assert.strictEqual(previewPrompt('x'.repeat(10), 5), 'xxxxx…');
});
