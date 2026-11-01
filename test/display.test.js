const test = require('node:test');
const assert = require('node:assert');
const { readDisplay, sanitizeVerbs } = require('../src/panels/display-settings');
const d = require('../webview/chat/display-logic');

const fromMap = (map) => (name) => map[name];

test('readDisplay applies the plan defaults', () => {
  assert.deepStrictEqual(readDisplay(fromMap({})), {
    focusView: false,
    showMessageTimestamps: false,
    spinnerVerbs: [],
    scrollToBottomOnSend: true,
    prefersReducedMotion: false,
    colorMode: 'default',
  });
});

test('readDisplay takes explicit values and rejects bad ones', () => {
  const out = readDisplay(fromMap({ focusView: true, scrollToBottomOnSend: false, colorMode: 'daltonized', prefersReducedMotion: 'yes' }));
  assert.strictEqual(out.focusView, true);
  assert.strictEqual(out.scrollToBottomOnSend, false);
  assert.strictEqual(out.colorMode, 'daltonized');
  assert.strictEqual(out.prefersReducedMotion, false);
  assert.strictEqual(readDisplay(fromMap({ colorMode: 'neon' })).colorMode, 'default');
});

test('sanitizeVerbs trims, drops empties and non-strings, strips a trailing ellipsis, caps length and count', () => {
  assert.deepStrictEqual(sanitizeVerbs([' חושב… ', '', 5, null, 'מרחף']), ['חושב', 'מרחף']);
  assert.deepStrictEqual(sanitizeVerbs('x'), []);
  assert.strictEqual(sanitizeVerbs(['a'.repeat(100)])[0].length, 40);
  assert.strictEqual(sanitizeVerbs(Array.from({ length: 80 }, (_, i) => `v${i}`)).length, 50);
});

test('pickVerb uses the custom list when it is not empty', () => {
  assert.strictEqual(d.pickVerb(['a', 'b'], ['x', 'y'], () => 0), 'x');
  assert.strictEqual(d.pickVerb(['a', 'b'], [], () => 0.99), 'b');
  assert.strictEqual(d.pickVerb(['a', 'b'], undefined, () => 1), 'b');
});

test('speaker labels and heading text', () => {
  assert.strictEqual(d.speakerLabel('user'), 'אתה');
  assert.strictEqual(d.speakerLabel('assistant'), 'Claude');
  assert.strictEqual(d.speakerLabel('other'), '');
  assert.strictEqual(d.headingText('user'), 'אתה');
  const ms = new Date(2026, 10, 1, 9, 5).getTime();
  assert.strictEqual(d.formatTime(ms), '09:05');
  assert.strictEqual(d.headingText('assistant', ms), 'Claude · 09:05');
});
