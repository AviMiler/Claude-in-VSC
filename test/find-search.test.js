const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const f = require('../webview/chat/find-logic');
const d = require('../webview/chat/drawer-logic');
const t = require('../src/history/transcripts');
const { projectDir } = require('../src/util/paths');

test('findOffsets: case-insensitive, non-overlapping, empty query finds nothing', () => {
  assert.deepStrictEqual(f.findOffsets('Hello hello HELLO', 'hello'), [0, 6, 12]);
  assert.deepStrictEqual(f.findOffsets('aaaa', 'aa'), [0, 2]);
  assert.deepStrictEqual(f.findOffsets('abc', ''), []);
  assert.deepStrictEqual(f.findOffsets('שלום עולם', 'עולם'), [5]);
});

test('step wraps around both ways and handles no matches', () => {
  assert.strictEqual(f.step(2, 3, 1), 0);
  assert.strictEqual(f.step(0, 3, -1), 2);
  assert.strictEqual(f.step(0, 0, 1), -1);
});

test('filterRows: a past session matches by title or by the content ids; open ones by title only', () => {
  const past = [{ id: 'a', title: 'refactor' }, { id: 'b', title: 'other' }, { id: 'c', title: 'third' }];
  const open = [{ id: 'o', title: 'other open', status: 'idle' }];
  const rows = d.filterRows(open, past, 'all', 'refactor', new Set(['b']));
  assert.deepStrictEqual(rows.past.map((r) => r.id), ['a', 'b']);
  assert.strictEqual(rows.open.length, 0);
  assert.strictEqual(d.filterRows(open, past, 'all', '', new Set(['b'])).past.length, 3);
  assert.strictEqual(d.filterRows(open, past, 'all', 'zzz', undefined).past.length, 0);
});

test('searchSessions finds a word in user and assistant text only, newest first, and needs 2+ characters', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-search-'));
  try {
    const cwd = path.join(home, 'proj');
    const env = { ...process.env, CLAUDE_CONFIG_DIR: home, USERPROFILE: home, HOME: home };
    const dir = projectDir(cwd, env);
    fs.mkdirSync(dir, { recursive: true });
    const line = (o) => `${JSON.stringify(o)}\n`;
    const ids = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333'];
    fs.writeFileSync(path.join(dir, `${ids[0]}.jsonl`), line({ type: 'user', message: { role: 'user', content: 'please fix the Banana parser' } }));
    fs.writeFileSync(path.join(dir, `${ids[1]}.jsonl`), line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'the banana is ripe' }] } }));
    // The word only inside a tool call's input: not conversation text.
    fs.writeFileSync(path.join(dir, `${ids[2]}.jsonl`), line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: { command: 'echo banana' } }] } }));
    const old = new Date(Date.now() - 100000);
    fs.utimesSync(path.join(dir, `${ids[0]}.jsonl`), old, old);
    assert.deepStrictEqual(await t.searchSessions(cwd, 'BANANA', env), [ids[1], ids[0]]);
    assert.deepStrictEqual(await t.searchSessions(cwd, 'b', env), []);
    assert.deepStrictEqual(await t.searchSessions(cwd, 'kiwi', env), []);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
