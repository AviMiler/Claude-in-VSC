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

const ctx = ec.describe('C:\\p\\app.js', { start: 5, end: 10 }, 'sel text');

test('Alt+K text: @path#lines, #n for one line, plain @path with no selection', () => {
  assert.strictEqual(ec.linesMention(ctx), '@C:/p/app.js#5-10');
  assert.strictEqual(ec.linesMention(ec.describe('C:/p/app.js', { start: 3, end: 3 }, 'x')), '@C:/p/app.js#3');
  assert.strictEqual(ec.linesMention(ec.describe('C:/p/app.js', null)), '@C:/p/app.js');
  assert.strictEqual(ec.linesMention(ec.describe('C:/my dir/a.js', { start: 1, end: 2 }, 'x')), '@"C:/my dir/a.js#1-2"');
});

test('toolFilePath and path helpers', () => {
  assert.strictEqual(ec.toolFilePath({ file_path: '/a.js' }), '/a.js');
  assert.strictEqual(ec.toolFilePath({ notebook_path: '/n.ipynb' }), '/n.ipynb');
  assert.strictEqual(ec.toolFilePath({ command: 'ls' }), null);
  assert.strictEqual(ec.toolFilePath(null), null);
  assert.ok(ec.insideDir('/w', '/w/src/a.js'));
  assert.ok(!ec.insideDir('/w', '/other/a.js'));
});
