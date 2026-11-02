const test = require('node:test');
const assert = require('node:assert');
const m = require('../src/panels/session-model');

const conv = (id, extra = {}) => ({ id, sessionId: null, title: '', busy: false, pending: new Map(), unread: false, ...extra });

test('conversationStatus: waiting beats running beats unread', () => {
  assert.strictEqual(m.conversationStatus({ busy: true, waiting: true, unread: true }), 'waiting');
  assert.strictEqual(m.conversationStatus({ busy: true, waiting: false, unread: true }), 'running');
  assert.strictEqual(m.conversationStatus({ busy: false, waiting: false, unread: true }), 'unread');
  assert.strictEqual(m.conversationStatus({}), 'idle');
});

test('conversationRow: fallback title, status and the current flag', () => {
  const row = m.conversationRow(conv('c1', { pending: new Map([['r', {}]]) }), 'c1');
  assert.deepStrictEqual(row, { id: 'c1', sessionId: null, title: m.TITLE_FALLBACK, status: 'waiting', current: true });
  assert.strictEqual(m.conversationRow(conv('c2', { title: 'x', busy: true }), 'c1').current, false);
});

test('hiddenAttention counts only conversations that are not shown', () => {
  const rows = [
    m.conversationRow(conv('a', { pending: new Map([['r', {}]]) }), null),
    m.conversationRow(conv('b', { unread: true }), null),
    m.conversationRow(conv('c', { busy: true }), null),
  ];
  assert.deepStrictEqual(m.hiddenAttention(rows, null), { waiting: 1, unread: 1, state: 'waiting' });
  assert.deepStrictEqual(m.hiddenAttention(rows, 'a'), { waiting: 0, unread: 1, state: 'finished' });
  assert.strictEqual(m.hiddenAttention(rows.slice(2), null).state, null);
});
test('decorateTitle', () => {
  assert.strictEqual(m.decorateTitle('x', null), 'x');
  assert.strictEqual(m.decorateTitle('x', 'waiting'), `${m.MARK_WAITING} x`);
  assert.strictEqual(m.decorateTitle('x', 'finished'), `${m.MARK_FINISHED} x`);
});

test('pushClosed dedups, ignores sessions without id and caps length', () => {
  let list = [];
  list = m.pushClosed(list, { sessionId: null });
  assert.strictEqual(list.length, 0);
  list = m.pushClosed(list, { sessionId: 'a' });
  list = m.pushClosed(list, { sessionId: 'b' });
  list = m.pushClosed(list, { sessionId: 'a' });
  assert.deepStrictEqual(list.map((e) => e.sessionId), ['b', 'a']);
  for (let i = 0; i < 20; i++) list = m.pushClosed(list, { sessionId: `s${i}` });
  assert.strictEqual(list.length, m.CLOSED_MAX);
});
