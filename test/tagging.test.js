// Package K (PLAN.md section 10): the chips model, the single mention function and its dedupe,
// and the shared recent list. Pure modules, no vscode stub needed.
const test = require('node:test');
const assert = require('node:assert');
const chips = require('../src/tagging/chips');
const { createRecentFiles, mentionRows, mergeMentionRows } = require('../src/tagging/recent-files');

const on = { attachOpenFile: true, attachSelection: true };
const ctxOf = (path, lines = null, selText = '') => ({ path, name: path.split('/').pop(), lines, selText });
const ctx = ctxOf('C:/p/app.js', { start: 5, end: 10 }, 'sel text');

test('view: automatic file chip follows the open file; lines only in the chip\'s file', () => {
  const v = chips.view(ctx, on, {});
  assert.deepStrictEqual(v.file, { path: 'C:/p/app.js', name: 'app.js', isDir: false, manual: false, outside: false });
  assert.deepStrictEqual(v.lines, { start: 5, end: 10, name: 'app.js' });
  assert.strictEqual(v.reverted, false);
  // No file open: both chips empty.
  assert.deepStrictEqual(chips.view(null, on, {}), { file: null, lines: null, reverted: false });
  // Settings off: empty.
  const off = chips.view(ctx, { attachOpenFile: false, attachSelection: false }, {});
  assert.strictEqual(off.file, null);
  assert.strictEqual(off.lines, null);
});

test('view: a manual choice wins; the lines chip is empty when the selection is in another file', () => {
  const other = chips.view(ctx, on, { manual: { path: 'C:/p/b.js', isDir: false } });
  assert.strictEqual(other.file.path, 'C:/p/b.js');
  assert.strictEqual(other.file.manual, true);
  assert.strictEqual(other.lines, null);
  const same = chips.view(ctx, on, { manual: { path: 'c:/P/app.js', isDir: false } });
  assert.ok(same.lines, 'same file (case-insensitive): lines shown');
  const folder = chips.view(ctx, on, { manual: { path: 'C:/p/src', isDir: true } });
  assert.strictEqual(folder.file.isDir, true);
  assert.strictEqual(folder.file.name, 'src');
  assert.strictEqual(folder.lines, null);
  // A manual choice still shows when attachOpenFile is off.
  assert.ok(chips.view(null, { attachOpenFile: false }, { manual: { path: '/x/y.md' } }).file);
});

test('view: removed chips come back when the file or the selection changes; outside flag', () => {
  const dismissed = { file: chips.pathKey('C:/p/app.js'), sel: chips.selKey(ctx) };
  const removed = chips.view(ctx, on, { dismissed });
  assert.strictEqual(removed.file, null);
  assert.strictEqual(removed.lines, null);
  const moved = chips.view(ctxOf('C:/p/app.js', { start: 6, end: 10 }, 'y'), on, { dismissed: { sel: dismissed.sel } });
  assert.ok(moved.lines);
  const out = chips.view(null, on, { manual: { path: 'D:/docs/a.md' } }, (p) => p.startsWith('D:'));
  assert.strictEqual(out.file.outside, true);
  assert.strictEqual(chips.view(null, on, { reverted: true }).reverted, true);
  assert.strictEqual(chips.view(null, on, { reverted: true, manual: { path: '/a' } }).reverted, false);
});

const NR = 'This may or may not be related to the current task.';

test('withContext: English context blocks in the official format, once per change, text unchanged', () => {
  const first = chips.withContext('fix', chips.view(ctx, on, {}), ctx);
  assert.strictEqual(first.text, 'fix', 'the user text is never changed');
  // A new selection goes alone (its block names the file), as in the official extension.
  assert.deepStrictEqual(first.context, [
    `<ide_selection>The user selected the lines 5 to 10 from C:/p/app.js:\nsel text\n\n${NR}</ide_selection>`,
  ]);
  assert.strictEqual(first.last.file, chips.pathKey('C:/p/app.js'), 'the file counts as sent');
  const again = chips.withContext('more', chips.view(ctx, on, {}), ctx, first.last);
  assert.deepStrictEqual(again, { text: 'more', context: [], last: first.last });
  // No selection: the opened file alone.
  const plain = ctxOf('C:/p/app.js');
  assert.deepStrictEqual(chips.withContext('fix', chips.view(plain, on, {}), plain).context,
    [`<ide_opened_file>The user opened the file C:/p/app.js in the IDE. ${NR}</ide_opened_file>`]);
  // File already sent, then a selection in it: only the selection.
  const fileOnly = chips.withContext('a', chips.view(plain, on, {}), plain);
  const selLater = chips.withContext('b', chips.view(ctx, on, {}), ctx, fileOnly.last);
  assert.strictEqual(selLater.context.length, 1);
  assert.ok(selLater.context[0].startsWith('<ide_selection>'));
  const folderView = chips.view(null, on, { manual: { path: 'C:/my dir/src', isDir: true } });
  assert.deepStrictEqual(chips.withContext('go', folderView, null).context,
    [`<ide_opened_file>The user selected the folder C:/my dir/src in the IDE. ${NR}</ide_opened_file>`]);
  const long = ctxOf('C:/a.js', { start: 1, end: 1 }, 'z'.repeat(9000));
  const cut = chips.withContext('x', chips.view(long, on, {}), long).context[0];
  assert.ok(cut.includes(`${'z'.repeat(chips.SELECTION_MAX_CHARS)}\n... (truncated)\n\n${NR}`));
  assert.ok(!cut.includes('z'.repeat(chips.SELECTION_MAX_CHARS + 1)));
  // Windows path as VS Code gives it: kept as is (absolute).
  const win = ctxOf('C:\\p\\app.js');
  assert.ok(chips.withContext('y', chips.view(win, on, {}), win).context[0].includes('the file C:\\p\\app.js in the IDE'));
});

test('withContext: the same file in the chip and in the text is sent once', () => {
  const v = chips.view(ctxOf('C:/p/app.js'), on, {});
  const viaAt = chips.withContext('look at @C:/p/app.js please', v, ctxOf('C:/p/app.js'));
  assert.strictEqual(viaAt.text, 'look at @C:/p/app.js please');
  assert.deepStrictEqual(viaAt.context, []);
  assert.strictEqual(viaAt.last.file, chips.pathKey('C:/p/app.js'), 'counted as sent');
  const viaAltK = chips.withContext('@c:/P/app.js#3-4 why?', v, ctxOf('C:/p/app.js'));
  assert.deepStrictEqual(viaAltK.context, []);
  const quoted = chips.view(null, on, { manual: { path: 'C:/my dir/a.js' } });
  assert.deepStrictEqual(chips.withContext('see @"C:/my dir/a.js", ok', quoted, null).context, []);
  const other = chips.withContext('see @C:/p/b.js', v, ctxOf('C:/p/app.js'));
  assert.strictEqual(other.text, 'see @C:/p/b.js');
  assert.ok(other.context[0].startsWith('<ide_opened_file>The user opened the file C:/p/app.js '));
});

test('recent list: 5 items, most recent first, no duplicates, change events', () => {
  const r = createRecentFiles();
  let changes = 0;
  r.onDidChange(() => { changes += 1; });
  for (const n of [1, 2, 3, 4, 5, 6]) r.add(`C:/p/f${n}.js`);
  assert.deepStrictEqual(r.list().map((i) => i.path), ['C:/p/f6.js', 'C:/p/f5.js', 'C:/p/f4.js', 'C:/p/f3.js', 'C:/p/f2.js']);
  r.add('c:/P/F3.js');
  assert.strictEqual(r.list().length, 5);
  assert.strictEqual(r.list()[0].path, 'c:/P/F3.js');
  r.add('C:/p/src/', true);
  assert.deepStrictEqual(r.list()[0], { path: 'C:/p/src', isDir: true });
  assert.ok(r.has('C:\\p\\src'));
  assert.strictEqual(changes, 8);
});

test('@ menu: recent rows first (relative inside the project), filtered, merged without duplicates', () => {
  const recent = [{ path: 'C:/p/src/app.js', isDir: false }, { path: 'C:/p/src', isDir: true }, { path: 'D:/docs/spec.md', isDir: false }];
  const all = mentionRows(recent, '', 'C:\\p');
  assert.deepStrictEqual(all.map((r) => r.path), ['src/app.js', 'src/', 'D:/docs/spec.md']);
  assert.strictEqual(all[1].abs, 'C:/p/src/');
  assert.ok(all.every((r) => r.recent));
  assert.deepStrictEqual(mentionRows(recent, 'spec', 'C:/p').map((r) => r.path), ['D:/docs/spec.md']);
  assert.deepStrictEqual(mentionRows(recent, 'src/', 'C:/p'), [], 'drilling into a folder: no recent rows');
  const ranked = [{ path: 'src/app.js', isDir: false, abs: 'C:/p/src/app.js' }, { path: 'src/b.js', isDir: false, abs: 'C:/p/src/b.js' }];
  const merged = mergeMentionRows(mentionRows(recent, 'app', 'C:/p'), ranked);
  assert.deepStrictEqual(merged.map((r) => r.abs), ['C:/p/src/app.js', 'C:/p/src/b.js']);
  assert.strictEqual(merged[0].recent, true);
});

test('pruneDismissed: a removed chip returns after the file or the selection changed', () => {
  const st = { dismissed: { file: chips.pathKey('C:/p/app.js'), sel: chips.selKey(ctx) } };
  chips.pruneDismissed(st, ctx);
  assert.deepStrictEqual(Object.keys(st.dismissed).sort(), ['file', 'sel'], 'same file and selection: still removed');
  chips.pruneDismissed(st, ctxOf('C:/p/app.js', { start: 6, end: 10 }));
  assert.deepStrictEqual(Object.keys(st.dismissed), ['file'], 'selection changed: the lines chip returns');
  chips.pruneDismissed(st, ctxOf('C:/p/b.js'));
  assert.deepStrictEqual(st.dismissed, {}, 'file changed: the file chip returns');
  assert.ok(chips.view(ctx, on, st).file, 'back in app.js: shown again');
  const none = { dismissed: { file: chips.pathKey('C:/p/app.js') } };
  chips.pruneDismissed(none, null);
  assert.deepStrictEqual(none.dismissed, {});
  chips.pruneDismissed({}, ctx); // no state: no throw
});

test('commandName: a CLI command is recognised (no context in front of it); a path is not', () => {
  assert.strictEqual(chips.commandName('/compact'), 'compact');
  assert.strictEqual(chips.commandName('  /Clear'), 'clear');
  assert.strictEqual(chips.commandName('/review the auth module'), 'review');
  assert.strictEqual(chips.commandName('/my-plugin:do-it x'), 'my-plugin:do-it');
  assert.strictEqual(chips.commandName('/src/app.js explain'), null);
  assert.strictEqual(chips.commandName('/a.js'), null);
  assert.strictEqual(chips.commandName('fix /compact'), null);
  assert.strictEqual(chips.commandName(''), null);
});

test('mentionedKeys: mentions after ( [ { " \' count, e-mails do not', () => {
  const keys = chips.mentionedKeys('see (@C:/p/a.js) and [@C:/p/b.js], \'@C:/p/c.js\' mail me@x.com');
  for (const p of ['C:/p/a.js', 'C:/p/b.js', 'C:/p/c.js']) assert.ok(keys.has(chips.pathKey(p)), p);
  assert.ok(!keys.has(chips.pathKey('x.com')));
  const v = chips.view(ctxOf('C:/p/a.js'), on, {});
  assert.deepStrictEqual(chips.withContext('why (@C:/p/a.js)?', v, ctxOf('C:/p/a.js')).context, []);
});
