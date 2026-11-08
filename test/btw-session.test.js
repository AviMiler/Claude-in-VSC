const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { BtwSession } = require('../src/panels/btw-session');

const claudePath = path.join(__dirname, '..', 'dev', process.platform === 'win32' ? 'fake-claude.cmd' : 'fake-claude.js');

// Resolves with the next `answer` message the session posts.
function make() {
  const msgs = [];
  const waiters = [];
  const session = new BtwSession({
    post: (m) => { msgs.push(m); const w = waiters.shift(); if (w) w(m); },
  });
  session.setRunOptions({ claudePath });
  const next = () => new Promise((resolve) => waiters.push(resolve));
  return { session, msgs, next };
}

test('first question is answered and kept in the history', async () => {
  const { session, next } = make();
  const p = next();
  session.ask('a1', 'שלום?');
  const m = await p;
  assert.strictEqual(m.type, 'answer');
  assert.strictEqual(m.id, 'a1');
  assert.ok(m.text.includes('btw: '), JSON.stringify(m));
  assert.strictEqual(session.history.length, 1);
  assert.strictEqual(session.history[0].q, 'שלום?');
  assert.strictEqual(session.busy, false);
});

test('a follow-up carries the first turn in the stdin text', async () => {
  const { session, next } = make();
  let p = next();
  session.ask('a1', 'first question');
  await p;
  p = next();
  session.ask('a2', 'second question');
  const m = await p;
  assert.ok(m.text.includes('User: first question'), m.text);
  assert.ok(m.text.includes('second question'), m.text);
  assert.strictEqual(session.history.length, 2);
});

test('a failed question is reported and not added to the history', async () => {
  const { session, next } = make();
  const p = next();
  session.ask('f1', 'FAIL');
  const m = await p;
  assert.ok(m.error.includes('fake btw failure'), JSON.stringify(m));
  assert.strictEqual(session.history.length, 0);
  assert.strictEqual(session.busy, false);
});

test('a second question while one is in flight is refused', async () => {
  const { session, msgs, next } = make();
  session.ask('b1', 'slow one');
  assert.strictEqual(session.busy, true);
  session.ask('b2', 'too early');
  assert.strictEqual(msgs[0].id, 'b2');
  assert.ok(msgs[0].error);
  await next(); // the answer to b1
  assert.strictEqual(session.history.length, 1);
});

test('clear cancels the question in flight and empties the history', async () => {
  const { session, msgs, next } = make();
  const p = next();
  session.ask('c1', 'one');
  await p;
  session.ask('c2', 'two');
  session.clear();
  assert.strictEqual(session.busy, false);
  assert.strictEqual(session.history.length, 0);
  await new Promise((r) => setTimeout(r, 500)); // the cancelled job's late result is ignored
  assert.strictEqual(session.history.length, 0);
  assert.ok(!msgs.some((m) => m.id === 'c2'));
});

test('cancel posts a cancelled error and the late result is dropped', async () => {
  const { session, msgs } = make();
  session.ask('d1', 'one');
  session.cancel('d1');
  assert.strictEqual(session.busy, false);
  assert.strictEqual(msgs[0].id, 'd1');
  assert.ok(msgs[0].error);
  await new Promise((r) => setTimeout(r, 500));
  assert.strictEqual(session.history.length, 0);
  assert.strictEqual(msgs.length, 1);
});
