const test = require('node:test');
const assert = require('node:assert');
const keys = require('../webview/chat/keys');

const ev = (key, mods = {}) => ({ key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods });

test('defaults: Enter sends, Shift+Enter is a new line', () => {
  const k = keys.resolve();
  assert.deepStrictEqual(k, { send: 'Enter', newLine: 'Shift+Enter', rewind: 'Escape Escape' });
  assert.ok(keys.matches(ev('Enter'), k.send));
  assert.ok(!keys.matches(ev('Enter', { shiftKey: true }), k.send));
  assert.ok(keys.matches(ev('Enter', { shiftKey: true }), k.newLine));
});

test('useCtrlEnterToSend swaps the defaults only', () => {
  assert.deepStrictEqual(keys.resolve({ useCtrlEnterToSend: true }), { send: 'Ctrl+Enter', newLine: 'Enter', rewind: 'Escape Escape' });
  const custom = keys.resolve({ useCtrlEnterToSend: true, keybindings: { send: 'Alt+Enter' } });
  assert.strictEqual(custom.send, 'Alt+Enter');
  assert.strictEqual(custom.newLine, 'Shift+Enter');
});

test('invalid or empty settings fall back to the defaults', () => {
  assert.strictEqual(keys.resolve({ keybindings: { send: '', newLine: '+', rewind: undefined } }).newLine, 'Shift+Enter');
  assert.strictEqual(keys.resolve({ keybindings: { send: 'Ctrl' } }).send, 'Enter');
});

test('matching: Ctrl and Cmd are the same, aliases and case are tolerated', () => {
  assert.ok(keys.matches(ev('Enter', { metaKey: true }), 'ctrl+enter'));
  assert.ok(keys.matches(ev('Escape'), 'Esc'));
  assert.ok(!keys.matches(ev('Enter', { ctrlKey: true }), 'Enter'));
  assert.ok(!keys.matches(ev('Escape'), 'Escape Escape'));
});

test('sequence: second press inside the window completes, outside it restarts', () => {
  const seq = keys.createSequence('Escape Escape', 600);
  assert.strictEqual(seq.feed(ev('Escape'), 1000), false);
  assert.strictEqual(seq.feed(ev('Escape'), 1300), true);
  assert.strictEqual(seq.feed(ev('Escape'), 1400), false);
  assert.strictEqual(seq.feed(ev('Escape'), 3000), false);
  assert.strictEqual(seq.feed(ev('a'), 3100), false);
  assert.strictEqual(seq.feed(ev('Escape'), 3200), false);
  assert.strictEqual(keys.createSequence('', 600).feed(ev('Escape')), false);
});
