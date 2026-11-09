const test = require('node:test');
const assert = require('node:assert');
const r = require('../src/panels/replay-log');

const events = (...evs) => ({ type: 'events', events: evs });

test('streamed pieces fold into one block, and the final block replaces them in place', () => {
  const log = r.createReplayLog();
  r.addUser(log, 'שלום');
  r.record(log, events({ kind: 'delta', key: 'm:0', blockType: 'text', text: 'He' }));
  r.record(log, events({ kind: 'tool', key: 'm:1', id: 't1', name: 'Read', input: {}, final: false }));
  r.record(log, events({ kind: 'delta', key: 'm:0', blockType: 'text', text: 'llo' }));
  assert.strictEqual(log.items[1].ev.text, 'Hello');
  r.record(log, events({ kind: 'block', key: 'm:0', blockType: 'text', text: 'Hello!' }));
  r.record(log, events({ kind: 'delta', key: 'm:0', blockType: 'text', text: ' late' }));
  r.record(log, events({ kind: 'tool', key: 'm:1', id: 't1', name: 'Read', input: { file_path: 'a' }, final: true }));
  r.record(log, events({ kind: 'tool', key: 'm:1', id: 't1', name: 'Read', input: {}, final: false }));
  r.record(log, events({ kind: 'status', status: 'compacting' }, { kind: 'result', isError: false }));
  const { items } = r.replay(log);
  assert.deepStrictEqual(items.map((i) => i.ev.kind), ['user', 'block', 'tool', 'result']);
  assert.strictEqual(items[1].ev.text, 'Hello!');
  assert.deepStrictEqual(items[2].ev.input, { file_path: 'a' });
});

test('snapshots keep the last message of each type; agent cards merge by id', () => {
  const log = r.createReplayLog();
  r.record(log, { type: 'mode', value: 'plan' });
  r.record(log, { type: 'mode', value: 'default' });
  r.record(log, { type: 'agentCards', cards: [{ id: 'a', state: 'running' }] });
  r.record(log, { type: 'agentCards', cards: [{ id: 'b', state: 'running' }, { id: 'a', state: 'done' }] });
  r.record(log, { type: 'notice', text: 'not kept' });
  const { snapshots } = r.replay(log);
  assert.deepStrictEqual(snapshots.find((s) => s.type === 'mode').value, 'default');
  assert.deepStrictEqual(snapshots.find((s) => s.type === 'agentCards').cards, [{ id: 'a', state: 'done' }, { id: 'b', state: 'running' }]);
  assert.strictEqual(snapshots.some((s) => s.type === 'notice'), false);
});

test('a loaded transcript is the new base; sent texts come from it and from the live items', () => {
  const log = r.createReplayLog();
  r.addUser(log, 'old');
  r.record(log, { type: 'planReady' });
  r.record(log, { type: 'sessionLoaded', id: 's', title: 't', events: [{ kind: 'user', text: 'a' }, { kind: 'block', key: 'k', text: 'x' }] });
  assert.strictEqual(r.replay(log).items.length, 0);
  r.addUser(log, 'b');
  assert.deepStrictEqual(r.sentTexts(log), ['a', 'b']);
  assert.strictEqual(r.replay(log).base.id, 's');
});

test('injected editor-context text is not kept for the restored view', () => {
  const log = r.createReplayLog();
  r.record(log, events({ kind: 'block', key: 'm:0', blockType: 'text', text: '<ide_opened_file>The user opened the file a.js in the IDE.</ide_opened_file>' }));
  r.record(log, events({ kind: 'delta', key: 'm:1', blockType: 'text', text: '<ide_selection>x</ide_selection>' }));
  assert.strictEqual(r.replay(log).items.length, 0);
});
