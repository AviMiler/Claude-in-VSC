const test = require('node:test');
const assert = require('node:assert');
const { diffBlocks, applyBlocks, reviewTexts, decision } = require('../src/diff/blocks');

const before = 'a\nb\nc\nd\ne\nf';
const after = 'a\nB\nc\nd\ne2\ne3\nf';

test('two separate changes become two blocks', () => {
  const blocks = diffBlocks(before, after);
  assert.strictEqual(blocks.length, 2);
  assert.deepStrictEqual(blocks[0], { oldStart: 1, oldCount: 1, newStart: 1, newCount: 1, newLines: ['B'] });
  assert.deepStrictEqual(blocks[1], { oldStart: 4, oldCount: 1, newStart: 4, newCount: 2, newLines: ['e2', 'e3'] });
});

test('applying all, none or some blocks', () => {
  const blocks = diffBlocks(before, after);
  assert.strictEqual(applyBlocks(before, blocks, [true, true]), after);
  assert.strictEqual(applyBlocks(before, blocks, [false, false]), before);
  assert.strictEqual(applyBlocks(before, blocks, [false, true]), 'a\nb\nc\nd\ne2\ne3\nf');
});

test('pure insertions and deletions', () => {
  const ins = diffBlocks('a\nb', 'a\nx\nb');
  assert.deepStrictEqual(ins, [{ oldStart: 1, oldCount: 0, newStart: 1, newCount: 1, newLines: ['x'] }]);
  const del = diffBlocks('a\nx\nb', 'a\nb');
  assert.strictEqual(applyBlocks('a\nx\nb', del, [true]), 'a\nb');
  assert.deepStrictEqual(diffBlocks('same', 'same'), []);
});

test('Edit review: old_string must appear exactly once; the offset is its first line', () => {
  const disk = 'one\ntwo\nthree\n';
  const t = reviewTexts('Edit', { file_path: 'x', old_string: 'two\nthree', new_string: 'TWO\nthree' }, disk);
  assert.strictEqual(t.lineOffset, 1);
  assert.strictEqual(t.fullAfter, 'one\nTWO\nthree\n');
  assert.strictEqual(reviewTexts('Edit', { old_string: 'zzz', new_string: 'y' }, disk), null);
  assert.strictEqual(reviewTexts('Edit', { old_string: 'o', new_string: 'y' }, 'o o'), null);
  assert.strictEqual(reviewTexts('Edit', { old_string: 'one', new_string: 'y', replace_all: true }, disk), null);
  assert.strictEqual(reviewTexts('Bash', { command: 'ls' }, disk), null);
});

test('decision: all kept -> original input, none -> deny, some -> updatedInput', () => {
  const input = { file_path: 'f.txt', old_string: before, new_string: after };
  const texts = reviewTexts('Edit', input, `x\n${before}\ny`);
  const blocks = diffBlocks(texts.before, texts.after);
  assert.deepStrictEqual(decision('Edit', input, texts, blocks, [true, true]), { behavior: 'allow', updatedInput: input });
  assert.strictEqual(decision('Edit', input, texts, blocks, [false, false]).behavior, 'deny');
  const some = decision('Edit', input, texts, blocks, [true, false]);
  assert.strictEqual(some.updatedInput.new_string, 'a\nB\nc\nd\ne\nf');
  assert.strictEqual(some.updatedInput.old_string, before);
  assert.deepStrictEqual(some.partial, { kept: 1, total: 2 });
  const w = { file_path: 'n.txt', content: after };
  const wt = reviewTexts('Write', w, before);
  const wb = diffBlocks(wt.before, wt.after);
  assert.strictEqual(decision('Write', w, wt, wb, [false, true]).updatedInput.content, 'a\nb\nc\nd\ne2\ne3\nf');
});
