const test = require('node:test');
const assert = require('node:assert');
const { find } = require('../webview/chat/trigger-token');

test('slash: at start, after whitespace, mid-sentence with text after the caret', () => {
  assert.deepStrictEqual(find('/he', 3), { kind: 'slash', start: 0, end: 3, query: 'he', quoted: false });
  const t = 'please /co now';
  const tok = find(t, 10);
  assert.strictEqual(tok.kind, 'slash');
  assert.strictEqual(tok.start, 7);
  assert.strictEqual(tok.query, 'co');
  assert.strictEqual(tok.end, 10);
  assert.strictEqual(find('a\n/x', 4).start, 2);
});

test('slash: caret inside the word extends end to the word end', () => {
  const tok = find('/clear x', 3);
  assert.strictEqual(tok.query, 'cl');
  assert.strictEqual(tok.end, 6);
});

test('slash: not inside paths or URLs', () => {
  assert.strictEqual(find('a/b', 3), null);
  assert.strictEqual(find('http://x', 8), null);
  assert.strictEqual(find('hello', 5), null);
});

test('mention: start, whitespace, punctuation, Hebrew text, text after the caret', () => {
  assert.strictEqual(find('@src', 4).query, 'src');
  assert.strictEqual(find('(@src', 5).start, 1);
  assert.strictEqual(find('[@a', 3).kind, 'mention');
  assert.strictEqual(find('"@a', 3).kind, 'mention');
  const he = 'תסתכל על @ab ועוד';
  const tok = find(he, 12);
  assert.strictEqual(tok.kind, 'mention');
  assert.strictEqual(tok.start, 9);
  assert.strictEqual(tok.query, 'ab');
  assert.strictEqual(tok.end, 12);
});

test('mention: not inside an email; quoted form keeps spaces', () => {
  assert.strictEqual(find('a@b.com', 7), null);
  const q = find('see @"C:/my dir/s', 17);
  assert.strictEqual(q.kind, 'mention');
  assert.strictEqual(q.quoted, true);
  assert.strictEqual(q.query, 'C:/my dir/s');
  assert.strictEqual(q.start, 4);
});
