const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

// work-file.js requires `vscode`: give it a stub.
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === 'vscode' ? 'vscode-stub' : resolve.call(this, request, ...rest);
};
require.cache['vscode-stub'] = { id: 'vscode-stub', filename: 'vscode-stub', loaded: true, exports: { window: undefined } };
const { withWorkFile, current } = require('../src/panels/work-file');

test('withWorkFile puts the file in front of the first message and again only when the file changes', () => {
  const first = withWorkFile('fix it', 'C:/p/a.js', null);
  assert.strictEqual(first.text, '@C:/p/a.js fix it');
  assert.strictEqual(first.sentFile, 'C:/p/a.js');
  const second = withWorkFile('and more', 'C:/p/a.js', first.sentFile);
  assert.strictEqual(second.text, 'and more'); // same file: no repeat, no extra tokens
  const third = withWorkFile('now this', 'C:/p/b.js', second.sentFile);
  assert.strictEqual(third.text, '@C:/p/b.js now this');
});

test('withWorkFile leaves the text alone when no file is in effect, and quotes paths with spaces', () => {
  assert.deepStrictEqual(withWorkFile('hi', null, 'C:/p/a.js'), { text: 'hi', sentFile: 'C:/p/a.js' });
  assert.strictEqual(withWorkFile('hi', 'C:/my dir/a.js', null).text, '@"C:/my dir/a.js" hi');
});

test('current: the picked file wins; with no editor and no pick there is none', () => {
  assert.strictEqual(current({ workFile: 'C:/p/x.js' }), 'C:/p/x.js');
  assert.strictEqual(current({ workFile: null }), null);
});
