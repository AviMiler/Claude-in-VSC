const test = require('node:test');
const assert = require('node:assert');
const { extract, restore } = require('../webview/chat/math-logic.js');

const srcs = (t) => extract(t).items.map((i) => [i.src, i.display]);

test('inline $..$ and \(..\)', () => {
  assert.deepStrictEqual(srcs('so $x^2$ and \\(a+b\\) end'), [['x^2', false], ['a+b', false]]);
});

test('display $$..$$ and \[..\], also across lines', () => {
  assert.deepStrictEqual(srcs('$$a=b$$ and \\[c\\]'),[['a=b', true], ['c', true]]);
  assert.deepStrictEqual(srcs('$$\na\n=b\n$$'), [['\na\n=b\n', true]]);
});

test('prices do not trigger', () => {
  assert.deepStrictEqual(srcs('it costs $5 and $10 total'), []);
  assert.deepStrictEqual(srcs('only $ alone, and $ x $ spaced'), []);
  assert.deepStrictEqual(srcs('$x$5'), []);
  assert.strictEqual(extract('$5 and $10').text, '$5 and $10');
});

test('code spans and fenced blocks are left alone', () => {
  assert.deepStrictEqual(srcs('`$x$` and ``a $y$ b``'), []);
  assert.deepStrictEqual(srcs('```js\nconst a = "$x$";\n```\n$z$'), [['z', false]]);
  assert.deepStrictEqual(srcs('~~~\n$x$\n~~~'), []);
  assert.deepStrictEqual(srcs('```\n$x$ unfinished fence'), []);
});

test('escaped \$ is not math', () => {
  assert.deepStrictEqual(srcs('cost \\$5 and \\$x\\$ here'), []);
  assert.deepStrictEqual(srcs('$a\\$b$'), [['a\\$b', false]]);
});

test('unbalanced and streaming-partial input stays plain', () => {
  for (const t of ['$x^2', '$$x', '\\(x', '\\[x', 'a $x\n\nb$', '$$ $$']) {
    assert.deepStrictEqual(extract(t).items, [], t);
    assert.strictEqual(extract(t).text, t);
  }
});

test('restore swaps placeholders, raw kept for fallback', () => {
  const r = extract('a $x$ b $$y$$');
  const html = restore(`<p>${r.text}</p>`, r.items, (it, i) => `[${i}:${it.display ? 'D' : 'I'}:${it.raw}]`);
  assert.strictEqual(html, '<p>a [0:I:$x$] b [1:D:$$y$$]</p>');
});

test('input private-use chars cannot forge placeholders', () => {
  assert.strictEqual(extract('a0b').items.length, 0);
});
