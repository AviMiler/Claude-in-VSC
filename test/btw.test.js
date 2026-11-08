const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { buildBtwPrompt, buildBtwArgs, parseBtwOutput, runBtw, btwCwd, BTW_TIMEOUT_MS } = require('../src/cli/btw');
const os = require('os');

test('btw args: no tools, no persistence, no resume, print mode with json output', () => {
  const a = buildBtwArgs({ model: 'sonnet' });
  assert.deepStrictEqual(a.slice(0, 5), ['-p', '--output-format', 'json', '--tools', '']);
  assert.ok(a.includes('--no-session-persistence'));
  assert.ok(!a.includes('--resume') && !a.includes('--input-format'));
  assert.strictEqual(a[a.indexOf('--model') + 1], 'sonnet');
});

test('parseBtwOutput: result, error flag, array form, garbage, empty', () => {
  assert.deepStrictEqual(parseBtwOutput('{"type":"result","result":" hi "}'), { text: 'hi' });
  assert.ok(parseBtwOutput('{"is_error":true,"result":"boom"}').error.includes('boom'));
  assert.deepStrictEqual(parseBtwOutput('[{"type":"system"},{"type":"result","result":"x"}]'), { text: 'x' });
  assert.ok(parseBtwOutput('not json').error);
  assert.ok(parseBtwOutput('{"result":""}').error);
});

// The fake CLI echoes the flags it received, so this proves what the extension asked for (not
// what the real CLI does with them; see dev/check-btw-and-files.txt).
test('runBtw against the fake CLI: answer comes back, stdin carries the question', async () => {
  const claudePath = path.join(__dirname, '..', 'dev', process.platform === 'win32' ? 'fake-claude.cmd' : 'fake-claude.js');
  const r = await runBtw({ claudePath, question: 'שלום?' }).promise;
  assert.ok(r.text.includes('btw: שלום?'), JSON.stringify(r));
  assert.ok(r.text.includes('tools=""') && r.text.includes('resume=false') && r.text.includes('persist=false'), r.text);
});

test('runBtw reports a CLI error result and a missing executable', async () => {
  const claudePath = path.join(__dirname, '..', 'dev', process.platform === 'win32' ? 'fake-claude.cmd' : 'fake-claude.js');
  const bad = await runBtw({ claudePath, question: 'FAIL' }).promise;
  assert.ok(bad.error.includes('fake btw failure'));
  const missing = await runBtw({ claudePath: path.join(__dirname, 'no-such-claude-binary'), question: 'x' }).promise;
  assert.ok(missing.error);
});

test('btw runs in a neutral temp folder and waits long enough for a cold model load', () => {
  const dir = btwCwd();
  assert.ok(dir.startsWith(os.tmpdir()), dir);
  assert.ok(require('fs').statSync(dir).isDirectory());
  assert.ok(BTW_TIMEOUT_MS >= 1200000);
});

test('buildBtwPrompt: empty history keeps the question and carries the no-tools hint', () => {
  const p = buildBtwPrompt([], 'מה זה let?');
  assert.ok(p.endsWith('מה זה let?'));
  assert.ok(/no tools/i.test(p));
  assert.ok(!p.includes('The conversation so far'));
});

test('buildBtwPrompt: a follow-up includes the earlier turns, then the new message', () => {
  const p = buildBtwPrompt([{ q: 'one?', a: 'answer one' }, { q: 'two?', a: 'answer two' }], 'three?');
  assert.ok(p.indexOf('User: one?') < p.indexOf('Assistant: answer one'));
  assert.ok(p.indexOf('answer one') < p.indexOf('User: two?'));
  assert.ok(p.endsWith('New message from the user:\nthree?'));
});

test('buildBtwPrompt: the oldest turns are dropped beyond the size limit, the newest kept', () => {
  const big = 'x'.repeat(10000);
  const p = buildBtwPrompt([{ q: 'oldest', a: big }, { q: 'middle', a: big }, { q: 'newest', a: big }], 'now');
  assert.ok(!p.includes('User: oldest'));
  assert.ok(p.includes('User: newest'));
  assert.ok(p.endsWith('now'));
});
