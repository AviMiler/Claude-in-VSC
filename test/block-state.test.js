// Per-block review state (R-1): decisions per block, completion, cursor-to-block lookup. Pure, no vscode.
const test = require('node:test');
const assert = require('node:assert');
const { createBlockState, shouldShowThreads, MAX_THREAD_BLOCKS } = require('../src/diff/block-state');

// Hand-built blocks (0-based, relative to the reviewed text): a replace, an insertion, a deletion.
const REPLACE = { oldStart: 1, oldCount: 2, newStart: 1, newCount: 3, newLines: ['x', 'y', 'z'] }; // old 1-2, new 1-3
const INSERT = { oldStart: 6, oldCount: 0, newStart: 7, newCount: 2, newLines: ['p', 'q'] }; // new 7-8
const DELETE = { oldStart: 10, oldCount: 2, newStart: 12, newCount: 0, newLines: [] }; // old 10-11, before new 12
const LIST = [REPLACE, INSERT, DELETE];

test('every block starts pending and the state is incomplete', () => {
  const s = createBlockState(LIST, 0, 20);
  assert.deepStrictEqual(s.states(), ['pending', 'pending', 'pending']);
  assert.strictEqual(s.isComplete(), false);
  assert.strictEqual(s.accepted(), null);
});

test('the last decision completes the state and accepted() lists them in block order', () => {
  const s = createBlockState(LIST, 0, 20);
  assert.strictEqual(s.decide(2, false), true);
  assert.strictEqual(s.decide(0, true), true);
  assert.strictEqual(s.isComplete(), false);
  s.decide(1, true);
  assert.strictEqual(s.isComplete(), true);
  assert.deepStrictEqual(s.accepted(), [true, true, false]);
  assert.deepStrictEqual(s.states(), ['accepted', 'accepted', 'rejected']);
});

test('a decision can be changed while other blocks are pending', () => {
  const s = createBlockState(LIST, 0, 20);
  s.decide(0, true);
  s.decide(0, false);
  assert.deepStrictEqual(s.states(), ['rejected', 'pending', 'pending']);
});

test('decide on a block that does not exist changes nothing and returns false', () => {
  const s = createBlockState(LIST, 0, 20);
  assert.strictEqual(s.decide(3, true), false);
  assert.strictEqual(s.decide(-1, true), false);
  assert.deepStrictEqual(s.states(), ['pending', 'pending', 'pending']);
});

test('decideRest decides only the pending blocks and returns how many it decided', () => {
  const s = createBlockState(LIST, 0, 20);
  s.decide(1, false);
  assert.strictEqual(s.decideRest(true), 2);
  assert.deepStrictEqual(s.states(), ['accepted', 'rejected', 'accepted']);
  assert.strictEqual(s.isComplete(), true);
  assert.strictEqual(s.decideRest(false), 0);
  assert.deepStrictEqual(s.accepted(), [true, false, true]);
});

test('blockAtLine on the right side: replace and insertion match their own lines, with the line offset', () => {
  const s = createBlockState(LIST, 100, 130);
  assert.strictEqual(s.blockAtLine('right', 100 + 1), 0);
  assert.strictEqual(s.blockAtLine('right', 100 + 3), 0);
  assert.strictEqual(s.blockAtLine('right', 100 + 4), -1);
  assert.strictEqual(s.blockAtLine('right', 100 + 7), 1);
  assert.strictEqual(s.blockAtLine('right', 100 + 8), 1);
  assert.strictEqual(s.blockAtLine('right', 100 + 9), -1);
  assert.strictEqual(s.blockAtLine('right', 100), -1);
});

test('blockAtLine on the right side: a deletion matches the line it sits before and the line above it', () => {
  const s = createBlockState(LIST, 0, 20);
  assert.strictEqual(s.blockAtLine('right', 12), 2);
  assert.strictEqual(s.blockAtLine('right', 11), 2);
  assert.strictEqual(s.blockAtLine('right', 13), -1);
  assert.strictEqual(s.blockAtLine('right', 10), -1);
});

test('blockAtLine on the left side uses the old line numbers: replace and deletion by range, insertion by position', () => {
  const s = createBlockState(LIST, 0, 20);
  assert.strictEqual(s.blockAtLine('left', 1), 0);
  assert.strictEqual(s.blockAtLine('left', 2), 0);
  assert.strictEqual(s.blockAtLine('left', 3), -1);
  assert.strictEqual(s.blockAtLine('left', 10), 2);
  assert.strictEqual(s.blockAtLine('left', 11), 2);
  assert.strictEqual(s.blockAtLine('left', 12), -1);
  assert.strictEqual(s.blockAtLine('left', 6), 1);
  assert.strictEqual(s.blockAtLine('left', 5), 1);
  assert.strictEqual(s.blockAtLine('left', 7), -1);
});

test('lineRange gives the block lines on the right document, clamped to the document', () => {
  const s = createBlockState(LIST, 100, 112);
  assert.deepStrictEqual(s.lineRange(0), { start: 101, end: 103 });
  assert.deepStrictEqual(s.lineRange(1), { start: 107, end: 108 });
  // The deletion sits at line 112, past the last line (111): it is shown on the last line.
  assert.deepStrictEqual(s.lineRange(2), { start: 111, end: 111 });
});

test('thread limit: 100 blocks still get comment threads, 101 do not', () => {
  assert.strictEqual(MAX_THREAD_BLOCKS, 100);
  assert.strictEqual(shouldShowThreads(100), true);
  assert.strictEqual(shouldShowThreads(101), false);
});
