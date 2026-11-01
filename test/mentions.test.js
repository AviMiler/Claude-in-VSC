const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const m = require('../src/panels/mentions');

test('foldersOf derives every parent folder once', () => {
  assert.deepStrictEqual(m.foldersOf(['a/b/c.js', 'a/d.js', 'e.js']).sort(), ['a/', 'a/b/']);
});

test('rankPaths: basename prefix, then basename contains, then path contains', () => {
  const entries = ['src/panels/conversation.js', 'src/', 'docs/convo-notes.md', 'test/conversation.test.js', 'lib/x.js'];
  const r = m.rankPaths(entries, 'conv').map((x) => x.path);
  assert.deepStrictEqual(r, ['docs/convo-notes.md', 'test/conversation.test.js', 'src/panels/conversation.js']);
  assert.deepStrictEqual(m.rankPaths(entries, 'panels').map((x) => x.path), ['src/panels/conversation.js']);
  assert.deepStrictEqual(m.rankPaths(entries, 'src').map((x) => [x.path, x.isDir])[0], ['src/', true]);
  assert.deepStrictEqual(m.rankPaths(entries, 'nope'), []);
  assert.strictEqual(m.rankPaths(entries, '', 2).length, 2);
});

test('parseGitList drops blanks and CR', () => {
  assert.deepStrictEqual(m.parseGitList('a.js\r\n\r\nb/c.js\n'), ['a.js', 'b/c.js']);
});

test('mentionText quotes paths with spaces', () => {
  assert.strictEqual(m.mentionText('a/b.js'), '@a/b.js');
  assert.strictEqual(m.mentionText('my dir/b.js'), '@"my dir/b.js"');
});

test('listEntries without git ignore skips node_modules and .git, and lists folders', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-mention-'));
  try {
    fs.mkdirSync(path.join(dir, 'src'));
    fs.mkdirSync(path.join(dir, 'node_modules'));
    fs.writeFileSync(path.join(dir, 'src', 'a.js'), '');
    fs.writeFileSync(path.join(dir, 'node_modules', 'x.js'), '');
    const entries = await m.listEntries(dir, false);
    assert.deepStrictEqual(entries.sort(), ['src/', 'src/a.js']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
