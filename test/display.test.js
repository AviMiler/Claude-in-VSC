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
    collapseUserMessageLines: 8,
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

test('shouldCollapse: long or many-line messages collapse, short ones and limit 0 never', () => {
  assert.strictEqual(d.shouldCollapse('a\nb\nc', 8), false);
  assert.strictEqual(d.shouldCollapse(Array(9).fill('x').join('\n'), 8), true);
  assert.strictEqual(d.shouldCollapse(Array(8).fill('x').join('\n'), 8), false);
  assert.strictEqual(d.shouldCollapse('x'.repeat(81 * 8), 8), true); // one long line wraps
  assert.strictEqual(d.shouldCollapse(Array(50).fill('x').join('\n'), 0), false);
});

test('sanitizeLines keeps whole numbers 0-200, otherwise 8', () => {
  const { sanitizeLines } = require('../src/panels/display-settings');
  assert.strictEqual(sanitizeLines(12), 12);
  assert.strictEqual(sanitizeLines(0), 0);
  assert.strictEqual(sanitizeLines(-1), 8);
  assert.strictEqual(sanitizeLines('5'), 8);
  assert.strictEqual(sanitizeLines(undefined), 8);
  assert.strictEqual(readDisplay(() => undefined).collapseUserMessageLines, 8);
});
