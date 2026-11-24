const test = require('node:test');
const assert = require('node:assert');
const { createStatusTracker, clock } = require('../src/panels/status-summary');

const conv = (o = {}) => ({ busy: false, pending: new Map(), unread: false, ...o });

test('clock formats m:ss', () => {
  assert.strictEqual(clock(0), '0:00');
  assert.strictEqual(clock(75), '1:15');
});

test('idle with no activity', () => {
  const t = createStatusTracker();
  assert.strictEqual(t.update([conv()], 1000).state, 'idle');
  assert.strictEqual(t.update([], 1000).text, '✻ Claude');
});

test('working shows the turn timer from the first time it was seen busy', () => {
  const t = createStatusTracker();
  const c = conv({ busy: true });
  assert.match(t.update([c], 1000).text, /0:00/);
  const s = t.update([c], 1000 + 83000);
  assert.strictEqual(s.state, 'working');
  assert.match(s.text, /1:23/);
});

test('several working conversations: oldest timer and a count', () => {
  const t = createStatusTracker();
  const a = conv({ busy: true });
  t.update([a], 0);
  const b = conv({ busy: true });
  assert.match(t.update([a, b], 10000).text, /0:10 \(2\)/);
});

test('waiting for permission beats working', () => {
  const t = createStatusTracker();
  const c = conv({ busy: true, pending: new Map([['x', 1]]) });
  assert.strictEqual(t.update([c], 0).state, 'waiting');
});

test('finished: right after a turn ends for 8 s, and while unread', () => {
  const t = createStatusTracker();
  const c = conv({ busy: true });
  t.update([c], 0);
  c.busy = false;
  assert.strictEqual(t.update([c], 5000).state, 'finished');
  assert.strictEqual(t.update([c], 5000 + 8001).state, 'idle');
  c.unread = true;
  assert.strictEqual(t.update([c], 60000).state, 'finished');
  c.unread = false;
  assert.strictEqual(t.update([c], 60001).state, 'idle');
});

test('a second turn restarts the timer', () => {
  const t = createStatusTracker();
  const c = conv({ busy: true });
  t.update([c], 0);
  c.busy = false; t.update([c], 5000);
  c.busy = true;
  assert.match(t.update([c], 100000).text, /0:00/);
});
