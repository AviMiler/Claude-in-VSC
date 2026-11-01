const test = require('node:test');
const assert = require('node:assert');
const m = require('../src/panels/session-model');

const items = [
  { id: 'a', title: 'A', mtime: 3 },
  { id: 'b', title: 'B', mtime: 2 },
  { id: 'c', title: 'C', mtime: 1 },
];

test('classify marks waiting, active and finished', () => {
  const open = new Map([['a', { busy: true, waiting: true }], ['b', { busy: true, waiting: false }], ['c', { busy: false, waiting: false }]]);
  const out = m.classify(items, open);
  assert.deepStrictEqual(out.map((i) => i.status), ['waiting', 'active', 'finished']);
  assert.ok(out.every((i) => i.open));
  assert.strictEqual(m.classify(items, new Map())[0].open, false);
});

test('filterItems', () => {
  const out = m.classify(items, new Map([['a', { busy: true, waiting: false }]]));
  assert.strictEqual(m.filterItems(out, 'all').length, 3);
  assert.deepStrictEqual(m.filterItems(out, 'active').map((i) => i.id), ['a']);
  assert.strictEqual(m.filterItems(out, 'finished').length, 2);
  assert.strictEqual(m.filterItems(out, 'waiting').length, 0);
});

test('continueSuggestion only when nothing is open', () => {
  assert.strictEqual(m.continueSuggestion(items, new Map()).id, 'a');
  assert.strictEqual(m.continueSuggestion(items, new Map([['b', {}]])), null);
  assert.strictEqual(m.continueSuggestion([], new Map()), null);
});

test('tab tracker: finished in a hidden tab, cleared when visible', () => {
  const t = m.createTabTracker();
  assert.strictEqual(t.update({ busy: true, waiting: false, visible: false }), null);
  assert.strictEqual(t.update({ busy: true, waiting: true, visible: false }), 'waiting');
  assert.strictEqual(t.update({ busy: true, waiting: false, visible: false }), null);
  assert.strictEqual(t.update({ busy: false, waiting: false, visible: false }), 'finished');
  assert.strictEqual(t.update({ busy: false, waiting: false, visible: false }), 'finished');
  assert.strictEqual(t.update({ busy: false, waiting: false, visible: true }), null);
});

test('tab tracker: finishing in a visible tab leaves no mark', () => {
  const t = m.createTabTracker();
  t.update({ busy: true, waiting: false, visible: true });
  assert.strictEqual(t.update({ busy: false, waiting: false, visible: true }), null);
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
