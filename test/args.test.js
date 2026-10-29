const test = require('node:test');
const assert = require('node:assert');
const { buildArgs } = require('../src/cli/args');

test('default args: stream-json both ways, stdio permission prompts, default mode', () => {
  const a = buildArgs();
  assert.deepStrictEqual(a, [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--permission-prompt-tool', 'stdio',
    '--permission-mode', 'default',
  ]);
});

test('resume and model are appended', () => {
  const a = buildArgs({ resume: 'abc', model: 'sonnet', permissionMode: 'plan' });
  assert.ok(a.join(' ').endsWith('--permission-mode plan --resume abc --model sonnet'));
});

test('bypass is only allowed when the setting asks for it', () => {
  assert.ok(!buildArgs().includes('--allow-dangerously-skip-permissions'));
  assert.ok(buildArgs({ allowBypass: true }).includes('--allow-dangerously-skip-permissions'));
});

test('an unknown mode falls back to default', () => {
  const a = buildArgs({ permissionMode: 'rm -rf' });
  assert.strictEqual(a[a.indexOf('--permission-mode') + 1], 'default');
});
