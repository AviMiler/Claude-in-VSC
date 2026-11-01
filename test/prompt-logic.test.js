const test = require('node:test');
const assert = require('node:assert');
const p = require('../webview/chat/prompt-logic');

const cmds = [{ name: 'compact' }, { name: 'doctor' }, { name: 'review' }, { name: 'color' }, { name: 'batch' }];
const meta = { skills: ['review', 'batch'], terminalOnly: ['doctor', 'color'] };

test('classify separates skills, built-ins and terminal-only', () => {
  const g = Object.fromEntries(p.classify(cmds, meta).map((c) => [c.name, c.group]));
  assert.deepStrictEqual(g, { compact: 'builtin', doctor: 'terminal', review: 'skill', color: 'terminal', batch: 'skill' });
});

test('classify falls back to the default terminal-only names', () => {
  assert.strictEqual(p.classify(cmds, {}).find((c) => c.name === 'doctor').group, 'terminal');
});

test('filterCommands: prefix first, groups ordered, terminal-only last', () => {
  const t = p.classify(cmds, meta);
  assert.deepStrictEqual(p.filterCommands(t, '').map((c) => c.name), ['compact', 'batch', 'review', 'color', 'doctor']);
  assert.deepStrictEqual(p.filterCommands(t, 'c').map((c) => c.name), ['compact', 'color', 'batch', 'doctor']);
  assert.deepStrictEqual(p.filterCommands(t, 'zzz'), []);
});

test('terminal-only detection by the typed text', () => {
  assert.ok(p.isTerminalOnly('/doctor', {}));
  assert.ok(p.isTerminalOnly('  /Color red', {}));
  assert.ok(!p.isTerminalOnly('/compact', {}));
  assert.ok(!p.isTerminalOnly('hello /doctor', {}));
  assert.ok(p.isTerminalOnly('/x', { terminalOnly: ['x'] }));
  assert.strictEqual(p.commandName('/a/b'), 'a');
});

test('queue: order, cancel, shift', () => {
  const q = p.createQueue();
  const a = q.push('a');
  q.push('b');
  assert.ok(q.cancel(a.id));
  assert.ok(!q.cancel(a.id));
  assert.strictEqual(q.size, 1);
  assert.strictEqual(q.shift().text, 'b');
  assert.strictEqual(q.shift(), null);
});

test('history: browse back and forward, restore the draft', () => {
  const h = p.createHistory();
  h.add('one');
  h.add('two');
  h.add('two');
  assert.strictEqual(h.prev('draft'), 'two');
  assert.strictEqual(h.prev('x'), 'one');
  assert.strictEqual(h.prev('x'), null);
  assert.strictEqual(h.next(), 'two');
  assert.strictEqual(h.next(), 'draft');
  assert.strictEqual(h.next(), null);
  h.reset(['a']);
  assert.strictEqual(h.prev(''), 'a');
});
