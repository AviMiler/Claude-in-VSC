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

test('rankPaths: absolute path on every item, folder query lists direct children only', () => {
  const entries = ['src/', 'src/a.js', 'src/sub/', 'src/sub/b.js', 'top.js'];
  const r = m.rankPaths(entries, 'src/', 30, 'C:\\proj');
  assert.deepStrictEqual(r.map((x) => x.path).sort(), ['src/a.js', 'src/sub/']);
  assert.strictEqual(r[0].abs.startsWith('C:/proj/src/'), true);
  assert.strictEqual(m.rankPaths(entries, 'top', 30, '/home/u')[0].abs, '/home/u/top.js');
});

test('relativeQuery strips the cwd prefix of a drilled-down folder', () => {
  assert.strictEqual(m.relativeQuery('C:\\proj', 'C:/proj/src/'), 'src/');
  assert.strictEqual(m.relativeQuery('C:\\proj', 'src'), 'src');
  assert.strictEqual(m.relativeQuery('', 'src'), 'src');
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
