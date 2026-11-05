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

test('a file source: the agreed instruction, once, and again only when the choice changes', () => {
  const first = withWorkFile('fix it', 'C:/p/a.js', null);
  assert.strictEqual(first.text, 'זה קובץ המקור של השיחה הזו: @C:/p/a.js. קרא אותו ותתחיל לעבוד ממנו.\n\nfix it');
  assert.strictEqual(first.sentFile, 'C:/p/a.js');
  const second = withWorkFile('and more', 'C:/p/a.js', first.sentFile);
  assert.strictEqual(second.text, 'and more'); // same choice: no repeat, no extra tokens
  const third = withWorkFile('now this', 'C:/p/b.js', second.sentFile);
  assert.ok(third.text.startsWith('זה קובץ המקור של השיחה הזו: @C:/p/b.js.'));
});

test('a folder source gets its own instruction', () => {
  const out = withWorkFile('go', 'C:/p/src', null, true);
  assert.strictEqual(out.text, 'זו תיקיית המקור של השיחה הזו: @C:/p/src. עבור על התוכן שלה ותתחיל לעבוד ממנה.\n\ngo');
});

test('no source (the default) leaves the text alone; paths with spaces are quoted', () => {
  assert.deepStrictEqual(withWorkFile('hi', null, 'C:/p/a.js'), { text: 'hi', sentFile: 'C:/p/a.js' });
  assert.ok(withWorkFile('hi', 'C:/my dir/a.js', null).text.includes('@"C:/my dir/a.js"'));
});

test('current: the default is no source; the picked path otherwise', () => {
  assert.strictEqual(current({ workFile: null }), null);
  assert.strictEqual(current({}), null);
  assert.strictEqual(current({ workFile: 'C:/p/x.js' }), 'C:/p/x.js');
});
