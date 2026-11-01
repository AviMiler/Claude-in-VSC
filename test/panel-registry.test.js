const test = require('node:test');
const assert = require('node:assert');
const { createRegistry } = require('../src/panels/panel-registry');

const entry = (sessionId, extra = {}) => ({
  isTab: true,
  conversation: { sessionId, hasMessages: true, busy: false, pending: new Map(), dispose() {}, ...extra },
});

test('closing a tab with a session adds it to the closed list; reopening pops it', () => {
  const r = createRegistry();
  const a = entry('a');
  r.add(a);
  assert.strictEqual(r.hasClosed(), false);
  r.remove(a);
  assert.strictEqual(r.hasClosed(), true);
  assert.strictEqual(r.popClosed(), 'a');
  assert.strictEqual(r.popClosed(), null);
});

test('conversations without a session or messages are not remembered; any place counts', () => {
  const r = createRegistry();
  const none = entry(null);
  const empty = entry('e', { hasMessages: false });
  [none, empty].forEach((e) => { r.add(e); r.remove(e); });
  assert.strictEqual(r.hasClosed(), false);
  const side = { ...entry('s'), isTab: false };
  r.add(side);
  r.remove(side);
  assert.strictEqual(r.popClosed(), 's');
});
test('popClosed skips a session that is open again', () => {
  const r = createRegistry();
  const a = entry('a');
  r.add(a);
  r.remove(a);
  r.add(entry('a'));
  assert.strictEqual(r.popClosed(), null);
});

test('openStates and change listeners', () => {
  const r = createRegistry();
  let n = 0;
  r.onChange(() => { n += 1; });
  r.add(entry('a', { busy: true }));
  r.add(entry('b', { pending: new Map([['1', {}]]) }));
  r.add(entry(null));
  assert.strictEqual(n, 3);
  const s = r.openStates();
  assert.deepStrictEqual([...s.keys()], ['a', 'b']);
  assert.deepStrictEqual(s.get('a'), { busy: true, waiting: false });
  assert.deepStrictEqual(s.get('b'), { busy: false, waiting: true });
});

test('changed() notifies only when a busy/waiting state changed', () => {
  const r = createRegistry();
  const a = entry('a');
  r.add(a);
  let n = 0;
  r.onChange(() => { n += 1; });
  r.changed();
  assert.strictEqual(n, 1);
  r.changed();
  assert.strictEqual(n, 1);
  a.conversation.busy = true;
  r.changed();
  assert.strictEqual(n, 2);
});
