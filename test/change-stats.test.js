const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { createEditLog, addEvent } = require('../src/diff/edit-log');
const { fileStats, lineDiffCounts, splitLines, MAX_CELLS } = require('../src/diff/change-stats');
const { changesCardMessage, relPath } = require('../src/diff/changes-card');
const r = require('../src/panels/replay-log');

const tool = (id, name, input) => ({ kind: 'tool', id, name, input, final: true });

test('splitLines: empty text has no lines; a final newline ends the last line', () => {
  assert.deepStrictEqual(splitLines(''), []);
  assert.deepStrictEqual(splitLines('a\nb\n'), ['a', 'b']);
  assert.deepStrictEqual(splitLines('a\r\nb'), ['a', 'b']);
});

test('lineDiffCounts: an LCS line diff, not a naive count', () => {
  assert.deepStrictEqual(lineDiffCounts('a\nb\nc', 'a\nB\nc'), { added: 1, removed: 1 });
  assert.deepStrictEqual(lineDiffCounts('a\nc', 'a\nb\nc'), { added: 1, removed: 0 });
  assert.deepStrictEqual(lineDiffCounts('x\na\ny\nb', 'a\nz\nb'), { added: 1, removed: 2 });
  assert.deepStrictEqual(lineDiffCounts('', 'one\ntwo'), { added: 2, removed: 0 });
  assert.deepStrictEqual(lineDiffCounts('same', 'same'), { added: 0, removed: 0 });
});

test('lineDiffCounts: past the cell limit it falls back to removed-all / added-all', () => {
  const n = Math.ceil(Math.sqrt(MAX_CELLS)) + 1;
  const a = Array.from({ length: n }, (_, i) => `a${i}`);
  const b = Array.from({ length: n }, (_, i) => (i % 2 ? `a${i}` : `b${i}`));
  b[0] = 'first'; b[n - 1] = 'last'; // no common ends to trim
  const t0 = Date.now();
  assert.deepStrictEqual(lineDiffCounts(a.join('\n'), b.join('\n')), { added: n, removed: n });
  assert.ok(Date.now() - t0 < 2000);
});

test('fileStats: sums fragments per file in first-change order', () => {
  const log = createEditLog();
  addEvent(log, tool('1', 'Edit', { file_path: '/p/a.js', old_string: 'x\ny', new_string: 'x\nY\nz' }));
  addEvent(log, tool('2', 'MultiEdit', { file_path: '/p/b.js', edits: [{ old_string: '1', new_string: '2' }, { old_string: '3\n4', new_string: '' }] }));
  addEvent(log, tool('3', 'Edit', { file_path: '/p/a.js', old_string: 'q', new_string: 'q\nr' }));
  assert.deepStrictEqual(fileStats(log), [
    { path: '/p/a.js', added: 3, removed: 1 },
    { path: '/p/b.js', added: 1, removed: 3 },
  ]);
});

test('fileStats: a Write is all added at first, then compared with the known content', () => {
  const log = createEditLog();
  addEvent(log, tool('1', 'Write', { file_path: '/p/n.txt', content: 'a\nb\nc\n' }));
  addEvent(log, tool('2', 'Edit', { file_path: '/p/n.txt', old_string: 'b', new_string: 'B' }));
  addEvent(log, tool('3', 'Write', { file_path: '/p/n.txt', content: 'a\nB\nc\nd\n' }));
  // 3 added; then +1 -1; then only "d" is new against a / B / c.
  assert.deepStrictEqual(fileStats(log), [{ path: '/p/n.txt', added: 5, removed: 1 }]);
});

test('fileStats: cached counts equal uncached ones, and a rebuild diffs only new fragments', () => {
  const log = createEditLog();
  addEvent(log, tool('1', 'Write', { file_path: '/p/n.txt', content: 'a\nb\nc\n' }));
  addEvent(log, tool('2', 'Edit', { file_path: '/p/n.txt', old_string: 'b', new_string: 'B' }));
  addEvent(log, tool('3', 'MultiEdit', { file_path: '/p/m.js', edits: [{ old_string: '1', new_string: '2' }, { old_string: '3\n4', new_string: '' }] }));
  let calls = 0;
  const diff = (a, b) => { calls += 1; return lineDiffCounts(a, b); };
  const cache = new WeakMap();
  const uncached = () => fileStats(log, { cache: new WeakMap() });

  assert.deepStrictEqual(fileStats(log, { cache, diff }), uncached());
  assert.strictEqual(calls, 4); // one per fragment
  assert.deepStrictEqual(fileStats(log, { cache, diff }), uncached());
  assert.strictEqual(calls, 4); // nothing recomputed

  addEvent(log, tool('4', 'Write', { file_path: '/p/n.txt', content: 'a\nB\nc\nd\n' }));
  assert.deepStrictEqual(fileStats(log, { cache, diff }), uncached());
  assert.strictEqual(calls, 5); // only the new Write
  assert.deepStrictEqual(fileStats(log, { cache, diff }), [
    { path: '/p/n.txt', added: 5, removed: 1 },
    { path: '/p/m.js', added: 1, removed: 3 },
  ]);
});

test('fileStats: a cached Write count is redone when its earlier content changed', () => {
  // A repeated tool id replaces an entry in place, so a later Write's earlier content differs.
  const log = createEditLog();
  addEvent(log, tool('1', 'Write', { file_path: '/p/n.txt', content: 'a\n' }));
  addEvent(log, tool('2', 'Write', { file_path: '/p/n.txt', content: 'a\nb\n' }));
  const cache = new WeakMap();
  assert.deepStrictEqual(fileStats(log, { cache }), [{ path: '/p/n.txt', added: 2, removed: 0 }]);
  addEvent(log, tool('1', 'Write', { file_path: '/p/n.txt', content: 'x\ny\n' }));
  assert.deepStrictEqual(fileStats(log, { cache }), fileStats(log, { cache: new WeakMap() }));
  assert.deepStrictEqual(fileStats(log, { cache }), [{ path: '/p/n.txt', added: 4, removed: 2 }]);
});

test('changesCardMessage: relative paths inside the folder, full paths outside', () => {
  const cwd = path.resolve('/work/proj');
  const inside = path.join(cwd, 'src', 'a.js');
  const outside = path.resolve('/other/b.js');
  assert.strictEqual(relPath(cwd, inside), path.join('src', 'a.js'));
  assert.strictEqual(relPath(cwd, outside), outside);
  const log = createEditLog();
  addEvent(log, tool('1', 'Edit', { file_path: inside, old_string: 'x', new_string: 'y' }));
  assert.deepStrictEqual(changesCardMessage(log, cwd), {
    type: 'changesCard',
    files: [{ path: inside, added: 1, removed: 1, rel: path.join('src', 'a.js') }],
  });
  assert.deepStrictEqual(changesCardMessage(createEditLog(), cwd).files, []);
});

test('the changes card is a replay snapshot: the last one is kept', () => {
  const log = r.createReplayLog();
  r.record(log, { type: 'changesCard', files: [{ path: 'a', added: 1, removed: 0 }] });
  r.record(log, { type: 'changesCard', files: [] });
  const { snapshots } = r.replay(log);
  assert.deepStrictEqual(snapshots.filter((s) => s.type === 'changesCard'), [{ type: 'changesCard', files: [] }]);
});
