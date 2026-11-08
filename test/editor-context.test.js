const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

// editor-context.js requires `vscode`: give it a stub.
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === 'vscode' ? 'vscode-stub' : resolve.call(this, request, ...rest);
};
require.cache['vscode-stub'] = { id: 'vscode-stub', filename: 'vscode-stub', loaded: true, exports: { window: undefined } };
const ec = require('../src/panels/editor-context');

const on = { attachOpenFile: true, attachSelection: true };
const ctx = ec.describe('C:\\p\\app.js', { start: 5, end: 10 }, 'sel text');

test('Alt+K text: @path#lines, #n for one line, plain @path with no selection', () => {
  assert.strictEqual(ec.linesMention(ctx), '@C:/p/app.js#5-10');
  assert.strictEqual(ec.linesMention(ec.describe('C:/p/app.js', { start: 3, end: 3 }, 'x')), '@C:/p/app.js#3');
  assert.strictEqual(ec.linesMention(ec.describe('C:/p/app.js', null)), '@C:/p/app.js');
  assert.strictEqual(ec.linesMention(ec.describe('C:/my dir/a.js', { start: 1, end: 2 }, 'x')), '@"C:/my dir/a.js#1-2"');
});

test('chips follow the settings and the removed keys', () => {
  assert.deepStrictEqual(ec.chips(ctx, on), { file: { name: 'app.js', path: 'C:/p/app.js' }, lines: { start: 5, end: 10, name: 'app.js' } });
  assert.deepStrictEqual(ec.chips(ctx, { attachOpenFile: false, attachSelection: false }), { file: null, lines: null });
  const removed = ec.chips(ctx, on, { file: 'C:/p/app.js', sel: 'C:/p/app.js#5-10' });
  assert.deepStrictEqual(removed, { file: null, lines: null });
  const moved = ec.chips(ec.describe('C:/p/app.js', { start: 6, end: 10 }, 'y'), on, { sel: 'C:/p/app.js#5-10' });
  assert.ok(moved.lines, 'a new selection brings the chip back');
  assert.deepStrictEqual(ec.chips(null, on), { file: null, lines: null });
});

test('withContext: file once per change, selection with its text, nothing when removed', () => {
  const first = ec.withContext('fix', ctx, on);
  assert.ok(first.text.startsWith('[הקשר מהעורך] הקובץ הפתוח בעורך: @C:/p/app.js\n[הקשר מהעורך] השורות שנבחרו: @C:/p/app.js#5-10\n```\nsel text\n```\n\nfix'));
  const again = ec.withContext('more', ctx, on, {}, first.last);
  assert.strictEqual(again.text, 'more');
  const off = ec.withContext('x', ctx, on, { file: 'C:/p/app.js', sel: 'C:/p/app.js#5-10' });
  assert.strictEqual(off.text, 'x');
  const long = ec.withContext('x', ec.describe('a.js', { start: 1, end: 1 }, 'z'.repeat(9000)), { attachSelection: true });
  assert.ok(long.text.includes('… (קוצר)'));
});

test('toolFilePath and path helpers', () => {
  assert.strictEqual(ec.toolFilePath({ file_path: '/a.js' }), '/a.js');
  assert.strictEqual(ec.toolFilePath({ notebook_path: '/n.ipynb' }), '/n.ipynb');
  assert.strictEqual(ec.toolFilePath({ command: 'ls' }), null);
  assert.strictEqual(ec.toolFilePath(null), null);
  assert.ok(ec.insideDir('/w', '/w/src/a.js'));
  assert.ok(!ec.insideDir('/w', '/other/a.js'));
});
