// The new-diagnostics tracker and block (src/tagging/diagnostics.js), with a fake diagnostics source.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const d = require('../src/tagging/diagnostics');

const F = path.resolve('/ws/a.js');
const G = path.resolve('/ws/b.js');
const err = (message, line = 1, extra = {}) => ({ severity: 'error', line, column: 1, message, ...extra });
const warn = (message, line = 1) => ({ severity: 'warning', line, column: 2, message });

// A fake source: `diags[path]` is what the IDE shows now; files outside /ws answer null.
function fakeSource(diags) {
  return {
    reads: [],
    read(p) {
      this.reads.push(p);
      return d.insideFolders(p, [path.resolve('/ws')]) ? (diags[p] || []).slice() : null;
    },
    waitForChange: () => Promise.resolve(),
  };
}
const toolStart = (id, file, name = 'Edit') => ({ kind: 'tool', id, name, input: { file_path: file }, final: true });
const toolEnd = (id, isError = false) => ({ kind: 'toolResult', toolUseId: id, text: '', isError });

test('newDiagnostics: only entries not in the baseline, as a multiset, errors and warnings only', () => {
  const base = [err('a', 1), err('a', 5), warn('w')];
  const now = [err('a', 2), err('a', 6), err('a', 9), warn('w', 3), err('b'), { severity: 'info', line: 1, column: 1, message: 'i' }];
  const out = d.newDiagnostics(base, now);
  assert.deepStrictEqual(out.map((x) => x.message), ['a', 'b']);
  assert.deepStrictEqual(d.newDiagnostics([], []), []);
});

test('buildBlock: English, wrapped in <ide_diagnostics>, null when empty', () => {
  assert.strictEqual(d.buildBlock([]), null);
  assert.strictEqual(d.buildBlock([{ path: F, items: [] }]), null);
  const block = d.buildBlock([{ path: 'C:\\ws\\a.js', items: [err('Cannot find name x.', 12, { source: 'ts', code: 2304 })] }]);
  assert.match(block, /^<ide_diagnostics>After your last edits/);
  assert.match(block, /\nC:\/ws\/a\.js\n- error at line 12:1: Cannot find name x\. \[ts 2304\]\n<\/ide_diagnostics>$/);
  assert.ok(!/[\u0590-\u05FF]/.test(block));
});

test('buildBlock: caps at 20 items and about 1,500 characters, with "N more not shown"', () => {
  const many = Array.from({ length: 30 }, (_, i) => err(`e${i}`, i + 1));
  const block = d.buildBlock([{ path: F, items: many }]);
  assert.strictEqual((block.match(/^- /gm) || []).length, d.MAX_ITEMS);
  assert.match(block, /\(10 more not shown\)/);
  const long = Array.from({ length: 10 }, (_, i) => err(`${'x'.repeat(250)}${i}`));
  const b2 = d.buildBlock([{ path: F, items: long }]);
  const shown = (b2.match(/^- /gm) || []).length;
  assert.ok(shown < 10 && shown >= 1);
  assert.match(b2, new RegExp(`\\(${10 - shown} more not shown\\)`));
  assert.ok(b2.length < d.MAX_CHARS + 400);
});

test('tracker: only the edited file, only new problems, once', () => {
  const diags = { [F]: [err('old')], [G]: [err('other')] };
  const src = fakeSource(diags);
  const t = d.createTracker(src);
  t.observe([toolStart('t1', F)]);
  diags[F] = [err('old', 3), err('new one'), warn('new warning')]; // the edit ran
  diags[G] = [err('other'), err('not edited')];
  t.observe([toolEnd('t1')]);
  const block = t.takeBlock();
  assert.match(block, /new one/);
  assert.match(block, /new warning/);
  assert.ok(!/old|other|not edited/.test(block.replace('After your last edits', '')));
  assert.ok(!block.includes('b.js'));
  assert.strictEqual(t.takeBlock(), null); // once
  // A later edit of the same file: the reported problems are in its baseline, so not repeated.
  t.observe([toolStart('t2', F)]);
  t.observe([toolEnd('t2')]);
  assert.strictEqual(t.takeBlock(), null);
});

test('tracker: a denied or failed edit does not count; non-edit tools and outside files are ignored', () => {
  const diags = { [F]: [] };
  const t = d.createTracker(fakeSource(diags));
  t.observe([toolStart('t1', F)]);
  diags[F] = [err('x')];
  t.observe([toolEnd('t1', true)]);
  assert.strictEqual(t.takeBlock(), null);
  t.observe([toolStart('t2', F, 'Read'), toolEnd('t2')]);
  assert.strictEqual(t.takeBlock(), null);
  const outside = path.resolve('/elsewhere/c.js');
  t.observe([toolStart('t3', outside), toolEnd('t3')]);
  assert.strictEqual(t.hasPending(), false);
});

test('tracker: the earliest baseline wins over several edits; reset drops everything', async () => {
  const diags = { [F]: [] };
  const t = d.createTracker(fakeSource(diags));
  t.observe([toolStart('t1', F)]);
  diags[F] = [err('first')];
  t.observe([toolEnd('t1')]);
  t.observe([toolStart('t2', F, 'Write')]);
  diags[F] = [err('first'), err('second')];
  t.observe([toolEnd('t2')]);
  const settled = t.whenSettled();
  assert.ok(settled);
  await settled;
  assert.strictEqual(t.whenSettled(), null);
  const block = t.takeBlock();
  assert.match(block, /first/);
  assert.match(block, /second/);
  t.observe([toolStart('t3', F)]);
  diags[F] = [err('later')];
  t.observe([toolEnd('t3')]);
  t.reset();
  assert.strictEqual(t.takeBlock(), null);
});

test('tracker: without a source it does nothing', () => {
  const t = d.createTracker(null);
  t.observe([toolStart('t1', F), toolEnd('t1')]);
  assert.strictEqual(t.whenSettled(), null);
  assert.strictEqual(t.takeBlock(), null);
});

test('insideFolders: case-insensitive on Windows, not a sibling prefix', () => {
  assert.ok(d.insideFolders('C:\\WS\\a.js', ['c:/ws'], 'win32'));
  assert.ok(!d.insideFolders('C:\\ws2\\a.js', ['C:\\ws'], 'win32'));
  assert.ok(!d.insideFolders(null, ['C:\\ws'], 'win32'));
});
